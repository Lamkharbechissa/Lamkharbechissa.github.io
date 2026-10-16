/* ============================================================================
   ISSA — client du relais LLM/RAG (navigateur)
   ----------------------------------------------------------------------------
   Le navigateur ne fait PLUS de retrieval ni d'appel direct au LLM : tout se
   passe dans le RELAIS, qui garde la clé Groq secrète et applique le même
   pipeline en production et en local :
       embeddings + BM25 (fusion RRF) → contexte borné (~1 100 tokens estimés)
       → prompt (js/rag-prompt.json) → cascade de modèles Groq en streaming.

     • Production : Cloudflare Worker (worker/jesus-worker.js),
                    JESUS_CONFIG.apiUrl = "https://<nom>.<compte>.workers.dev"
                    (voir GUIDE_JESUS_LLM.md).
     • Local      : serve.py sert le site ET le relais sur la même origine,
                    js/config.local.js (git-ignoré) pose apiUrl = "/api".
     • apiUrl vide : mode hors ligne — moteur à règles instantané (js/jesus.js).
       L'ancien appel direct à api.groq.com depuis le navigateur (clé exposée)
       a été SUPPRIMÉ : groqApiKey n'est plus jamais lu par le navigateur.

   API du relais (identique Worker / serve.py) :
     POST {apiUrl}/chat  {question ≤ 600 car., history: 8 derniers messages, lang}
       → text/event-stream :
           event: meta / data: {"sources":[{id,entity,title}],"model","retrieval"}
           data: {"delta":"…"}   (contenu de la réponse uniquement)
           data: [DONE]
       → échec : HTTP 429 / 502 / 503 + JSON {error} → le widget bascule sur
         le moteur hors ligne (avec une courte note discrète).
     GET  {apiUrl}/health → {ok, chunks, embedded, embedModel, models, …}

   Délais côté client : premier token 13 s (= échéance unique du relais, 10 s pour
   retrieval + cascade de modèles, + 3 s de marge réseau), réponse complète 40 s.
   Si le relais coupe un flux en route, il envoie data: {"error":"interrupted"} :
   la réponse partielle est gardée avec la mention « réponse interrompue ».
   Après un échec, le relais est mis en pause quelques dizaines de secondes
   (« disjoncteur ») : les questions suivantes partent directement au moteur
   hors ligne, puis le mode IA est retenté automatiquement.
   ============================================================================ */

(function () {
  "use strict";
  const CFG = window.JESUS_CONFIG || {};
  /* ancienne commande « /key » (appel direct à Groq, supprimé) : on efface une
     éventuelle clé restée dans ce navigateur */
  try { localStorage.removeItem("jesus_groq_key"); } catch (_) { /* stockage indisponible */ }

  function normalize(text) {
    return String(text).toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ").trim();
  }

  /* ---------------- paramètres du contrat relais ---------------- */
  const LIMITS = {
    questionChars: 600,
    historyMessages: 8,
    userChars: 400,
    assistantChars: 700,
    historyChars: 1600,
    /* rag-prompt.json generation.first_token_budget_ms (10 s) + 3 s de marge */
    firstTokenMs: Number(CFG.firstTokenTimeoutMs) || 13000,
    totalMs: Number(CFG.totalTimeoutMs) || 40000,
    healthMs: 5000
  };

  function apiBase() {
    const u = String(CFG.apiUrl || "").trim();
    return u ? u.replace(/\/+$/, "") : "";
  }

  /* ---------------- disjoncteur (pause après échec) ---------------- */
  let pausedUntil = 0;
  let lastFailure = null;
  const listeners = new Set();
  function emitMode() {
    const m = mode();
    listeners.forEach(fn => { try { fn(m); } catch (_) { /* ignoré */ } });
  }
  function pause(ms, why) {
    pausedUntil = Date.now() + ms;
    lastFailure = why || "error";
    emitMode();
    /* retour automatique au mode IA à l'expiration de la pause */
    setTimeout(emitMode, ms + 50);
  }
  function configured() { return Boolean(apiBase()); }
  function llmAvailable() { return configured() && Date.now() >= pausedUntil; }
  /* "llm" | "offline" (non configuré ou en pause) */
  function mode() { return llmAvailable() ? "llm" : "offline"; }
  function onModeChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  /* ---------------- mémoire de conversation (réponses réelles) ---------------- */
  const history = [];
  function clip(s, n) {
    s = String(s == null ? "" : s).trim();
    return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
  }
  function pushHistory(role, content) {
    if (role !== "user" && role !== "assistant") return;
    const c = clip(content, role === "user" ? LIMITS.userChars : LIMITS.assistantChars);
    if (!c) return;
    history.push({ role, content: c });
    while (history.length > LIMITS.historyMessages) history.shift();
  }
  /* Une question et SA réponse (jamais un refus) entrent ensemble dans la mémoire. */
  function remember(question, answer) {
    if (!String(answer || "").trim()) return;
    pushHistory("user", question);
    pushHistory("assistant", answer);
  }
  /* Historique envoyé au relais : 8 derniers messages, ≤ 1 600 caractères au total. */
  function historyForRequest() {
    const out = [];
    let total = 0;
    for (let i = history.length - 1; i >= 0; i--) {
      const m = history[i];
      if (total + m.content.length > LIMITS.historyChars) break;
      total += m.content.length;
      out.unshift({ role: m.role, content: m.content });
    }
    /* l'historique commence toujours par une question */
    while (out.length && out[0].role !== "user") out.shift();
    return out;
  }
  function resetConversation() { history.length = 0; }
  /* Restaure la mémoire depuis une conversation rouverte (historique Supabase / local). */
  function setHistory(msgs) {
    history.length = 0;
    (msgs || []).forEach(m => pushHistory(m.role === "user" ? "user" : "assistant", m.content));
  }
  function getHistory() { return history.map(m => Object.assign({}, m)); }

  /* ---------------- erreurs typées ---------------- */
  class RelayError extends Error {
    constructor(kind, status, partial) {
      super("relay " + kind + (status ? " " + status : ""));
      this.kind = kind;        /* http | timeout | network | empty | aborted | stream */
      this.status = status || 0;
      this.partial = partial || "";
    }
  }

  /* ---------------- santé du relais ---------------- */
  async function health() {
    if (!configured()) return { ok: false, reason: "not_configured" };
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), LIMITS.healthMs);
    try {
      const res = await fetch(apiBase() + "/health", { signal: ctl.signal, cache: "no-store" });
      const data = res.ok ? await res.json() : null;
      const ok = Boolean(data && data.ok && data.groqKey !== false);
      if (!ok) pause(60000, "health");
      else if (Date.now() < pausedUntil && lastFailure === "health") { pausedUntil = 0; emitMode(); }
      return Object.assign({ ok }, data || {});
    } catch (_) {
      pause(30000, "health");
      return { ok: false, reason: "unreachable" };
    } finally {
      clearTimeout(timer);
    }
  }

  /* ---------------- lecture du flux SSE ---------------- */
  function parseEvent(block) {
    let event = "message";
    const data = [];
    for (const raw of block.split(/\r?\n/)) {
      if (!raw || raw.charAt(0) === ":") continue;
      const i = raw.indexOf(":");
      const field = i < 0 ? raw : raw.slice(0, i);
      let value = i < 0 ? "" : raw.slice(i + 1);
      if (value.charAt(0) === " ") value = value.slice(1);
      if (field === "event") event = value.trim();
      else if (field === "data") data.push(value);
    }
    return { event, data: data.join("\n") };
  }

  /**
   * Pose une question au relais et lit la réponse en streaming.
   *   opts.onMeta(meta)   : sources / modèle / type de retrieval (avant le texte)
   *   opts.onToken(delta) : chaque fragment de réponse
   *   opts.signal         : AbortSignal externe (bouton « Arrêter »)
   * Résout {text, meta}. Rejette une RelayError (le widget bascule alors sur le
   * moteur hors ligne, sauf arrêt volontaire : kind "aborted" + texte partiel).
   */
  async function ask(question, lang, opts) {
    opts = opts || {};
    if (!configured()) throw new RelayError("network", 0);
    const ctl = new AbortController();
    let why = null;
    const stop = reason => { if (!why) { why = reason; ctl.abort(); } };
    const onExternalAbort = () => stop("aborted");
    if (opts.signal) {
      if (opts.signal.aborted) throw new RelayError("aborted", 0);
      opts.signal.addEventListener("abort", onExternalAbort);
    }
    let firstTimer = setTimeout(() => stop("timeout"), LIMITS.firstTokenMs);
    const totalTimer = setTimeout(() => stop("timeout"), LIMITS.totalMs);
    let full = "", meta = null, done = false;

    const cleanup = () => {
      clearTimeout(firstTimer); clearTimeout(totalTimer);
      if (opts.signal) opts.signal.removeEventListener("abort", onExternalAbort);
    };
    const fail = (kind, status) => {
      cleanup();
      if (kind === "timeout" || kind === "network" || kind === "stream") pause(30000, kind);
      return new RelayError(kind, status, full);
    };

    let res;
    try {
      res = await fetch(apiBase() + "/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "text/event-stream" },
        signal: ctl.signal,
        cache: "no-store",
        body: JSON.stringify({
          question: String(question).trim().slice(0, LIMITS.questionChars),
          history: historyForRequest(),
          lang: lang === "en" ? "en" : "fr"
        })
      });
    } catch (_) {
      throw fail(why || "network");
    }

    if (!res.ok) {
      const st = res.status;
      cleanup();
      /* pauses : quota Groq (429) court, relais cassé / clé absente plus long,
         origine refusée (403 = configuration) très long ; 4xx de saisie : aucune */
      if (st === 429) pause(30000, "429");
      else if (st === 503) pause(60000, "503");
      else if (st === 403) pause(600000, "403");
      else if (st >= 500) pause(20000, String(st));
      throw new RelayError("http", st);
    }
    if (!res.body || !res.body.getReader) throw fail("stream");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const handle = block => {
      const ev = parseEvent(block);
      if (ev.event === "meta") {
        try { meta = JSON.parse(ev.data); } catch (_) { meta = null; }
        if (meta && opts.onMeta) opts.onMeta(meta);
        return;
      }
      if (!ev.data) return;
      if (ev.data.trim() === "[DONE]") { done = true; return; }
      let obj;
      try { obj = JSON.parse(ev.data); } catch (_) { return; }
      if (obj && typeof obj.delta === "string" && obj.delta) {
        if (!full) { clearTimeout(firstTimer); firstTimer = null; }
        full += obj.delta;
        if (opts.onToken) opts.onToken(obj.delta, full);
      } else if (obj && obj.error) {
        throw new Error("stream error");
      }
    };
    try {
      while (!done) {
        const { done: end, value } = await reader.read();
        if (end) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split(/\r?\n\r?\n/);
        buffer = parts.pop();
        for (const p of parts) { handle(p); if (done) break; }
      }
      if (!done && buffer.trim()) handle(buffer);
    } catch (_) {
      try { reader.cancel().catch(() => {}); } catch (__) { /* ignoré */ }
      throw fail(why || "stream");
    }
    if (done) { try { reader.cancel().catch(() => {}); } catch (_) { /* ignoré */ } }
    cleanup();
    if (!full.trim()) throw fail("empty");
    if (Date.now() < pausedUntil) { pausedUntil = 0; emitMode(); }   /* le relais répond de nouveau */
    return { text: full, meta: meta || { sources: [], model: "", retrieval: "" } };
  }

  /* ================= GARDE-FOU DÉTERMINISTE ================================
     Bloque, AVANT tout appel au relais, les demandes de tâches manifestement
     hors-sujet (écrire du code/poème, traduire, calculer, culture générale…).
     Motifs à haute précision, testés (python chatbot/jesus_chatbot.py --test)
     pour ne PAS bloquer les questions légitimes sur Issa. */
  const OFFTOPIC_PATTERNS = [
    /\b(poeme|poem|blague|blagues|joke|jokes|chanson|song|paroles|lyrics|recette|recettes|recipe)\b/,
    /\b(traduis|traduire|traduction|translate|translation)\b/,
    /\bcapitale? (de|du|des|d|la|le)\b|\bcapital of\b/,
    /\b(meteo|weather|horoscope|actualite|actualites|news)\b/,
    /\bcombien font\b|\b(calcule|calculer|calculez|resous|resoudre|solve|compute|calculate)\b(?: [a-z0-9]+){0,4} (?:[0-9]+|equation|equations|integrale|derivee|x)\b/,
    /\b(ecris|ecrire|redige|rediger|write|compose|composer|invente|inventer|genere|generer|generate|donne moi|give me|fais moi|make me|create).{0,28}(code|fonction|function|script|programme|program|poeme|poem|texte|text|essai|essay|lettre|letter|histoire|story|dissertation|paragraphe|paragraph|chanson|song|discours|speech|blague|joke|recette|recipe)\b/,
  ];
  function isOffTopicTask(q) {
    const n = normalize(q);
    return OFFTOPIC_PATTERNS.some(re => re.test(n));
  }
  const REFUSALS = {
    fr: [
      "Je suis ISSA, l'assistant dédié **uniquement** au parcours d'Issa Lamkharbech. Ça sort de mon domaine — mais je peux tout te dire sur ses projets, ses stages, ses compétences ou son parcours. Que veux-tu savoir sur Issa ? 🙂",
      "Désolé, ce n'est pas mon rayon 🙂 Je ne parle que d'Issa Lamkharbech : ses projets, ses stages, ses compétences, son parcours. Sur lequel veux-tu que je m'attarde ?",
      "Ça, je préfère ne pas m'y aventurer — je suis l'assistant d'Issa et je reste concentré sur son parcours. Je te parle de ses projets, de ses stages ou de ses compétences ?",
      "Hmm, hors sujet pour moi ! 😄 Mon truc à moi, c'est Issa Lamkharbech : son parcours, ses stages, ses projets. Qu'est-ce qui t'intéresse chez lui ?"
    ],
    en: [
      "I'm ISSA, the assistant dedicated **only** to Issa Lamkharbech's background. That's outside my scope — but I'd love to tell you about his projects, internships, skills or education. What would you like to know about Issa? 🙂",
      "Sorry, that's not my thing 🙂 I only talk about Issa Lamkharbech: his projects, internships, skills, background. Which one should I dive into?",
      "I'd rather not go there — I'm Issa's assistant and I stay focused on his journey. Shall I tell you about his projects, internships or skills?",
      "Hmm, off-topic for me! 😄 My whole world is Issa Lamkharbech: his background, internships, projects. What interests you about him?"
    ]
  };
  let _lastRefusal = -1;
  function refusal(lang) {
    const pool = REFUSALS[lang === "en" ? "en" : "fr"];
    let i = Math.floor(Math.random() * pool.length);
    if (i === _lastRefusal) i = (i + 1) % pool.length;
    _lastRefusal = i;
    return pool[i];
  }

  window.JesusRAG = {
    ask, health, llmAvailable, configured, mode, onModeChange,
    remember, resetConversation, setHistory, getHistory,
    isOffTopicTask, refusal, REFUSALS, LIMITS, RelayError
  };
})();
