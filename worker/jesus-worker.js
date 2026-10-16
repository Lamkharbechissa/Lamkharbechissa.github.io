/* ============================================================================
   ISSA — relais LLM + RAG (Cloudflare Worker, module ES, gratuit)
   ----------------------------------------------------------------------------
   Le site (GitHub Pages) ne peut pas contenir la clé Groq : ce Worker la garde
   secrète, retrouve les bons passages du parcours d'Issa (RAG hybride) et
   renvoie la réponse du modèle en streaming.

     navigateur ──POST /chat──▶ Worker ──▶ Workers AI (embeddings bge-m3)
                                       └─▶ api.groq.com (clé secrète, cascade)
                ◀── text/event-stream ──┘

   API (identique au relais local de serve.py) :
     POST /chat   {"question": str <= 600, "history": [{role, content}] (<= 8),
                   "lang": "fr"|"en"}
                  -> 200 text/event-stream :
                       event: meta
                       data: {"sources":[{id,entity,title}],"model":"...","retrieval":"hybrid"|"bm25"}
                       data: {"delta":"..."}        (contenu uniquement, jamais le raisonnement)
                       data: {"error":"interrupted"} (seulement si le flux est coupé en route)
                       data: [DONE]
                  -> échec : 429 / 502 / 503 JSON {"error"} (le site bascule alors
                     sur son moteur local)
     GET  /health -> {"ok","chunks","embedded","embedModel","models","version"}

   Données : passages et prompt lus sur le site publié (CHUNKS_URL / PROMPT_URL,
   générés par chatbot/jesus_rag.py --export-assets) : aucune duplication de texte ici.
   Retrieval, relances, modes de réponse et messages : MIROIR EXACT de
   chatbot/jesus_rag.py (RagIndex.plan / retrieve, build_messages, stream_groq).

   Configuration (dashboard Cloudflare → Worker → Settings) — voir GUIDE_JESUS_LLM.md :
     • Binding Workers AI nommé  AI                         (embeddings @cf/baai/bge-m3)
     • Binding KV nommé          EMB  (recommandé)          (vecteurs des passages + pauses des modèles :
                                                             sans lui, chaque nouvelle instance recalcule
                                                             les vecteurs ; caches.default ne marche pas
                                                             sur *.workers.dev)
     • Binding Rate Limiting     RL   (optionnel)           (limite par IP gérée par Cloudflare)
     • Secret                    GROQ_API_KEY               (console.groq.com)
     • Variables optionnelles    MODELS (liste séparée par des virgules), RATE_LIMIT (req/min/IP,
                                 défaut 4), DAILY_LIMIT (req/jour/IP, défaut 40), GLOBAL_RPM
                                 (req/min pour toute l'instance, défaut 6), ALLOW_LOCAL = "1"
                                 (autorise http://localhost:8791), CHUNKS_URL, PROMPT_URL,
                                 ALLOWED_ORIGINS (liste supplémentaire)

   SÉCURITÉ : allowlist CORS stricte, Origin obligatoire sur /chat (protège du vol de quota
   par un AUTRE SITE, mais un script peut forger l'en-tête : ce n'est pas une authentification),
   limites par IP / par jour / globale dimensionnées sur le quota Groq gratuit, validation et
   bornage des entrées (corps lu avec plafond), paramètres du modèle imposés côté serveur,
   erreurs sans détail amont.
   ============================================================================ */

const DEFAULT_CHUNKS_URL = "https://lamkharbechissa.github.io/js/rag-chunks.json";
const DEFAULT_PROMPT_URL = "https://lamkharbechissa.github.io/js/rag-prompt.json";
const EMBED_MODEL = "@cf/baai/bge-m3";
const DEFAULT_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"];
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const PROD_ORIGINS = ["https://lamkharbechissa.github.io"];
const LOCAL_ORIGINS = ["http://localhost:8791", "http://127.0.0.1:8791"];
const MAX_BODY_BYTES = 16 * 1024;
const ASSET_TTL_MS = 5 * 60 * 1000;
const EMBED_BATCH = 32;
const FIRST_EMBED_WAIT_MS = 1500;   // vecteurs pas prêts -> BM25 pour CETTE requête (le calcul continue en tâche de fond)
const QUERY_EMBED_MS = 2500;        // plafond pour l'embedding de la question
const KV_EMB_TTL_S = 90 * 24 * 3600;

/* ------------------------------------------------------------------ texte */
function norm(text) {
  return String(text == null ? "" : text).toLowerCase().normalize("NFD")
    .replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function stem(w) {
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

function tokens(text, stop) {
  return norm(text).split(" ").filter(w => w.length > 1 && !stop.has(w)).map(stem);
}

function estTokens(text, cpt) {
  return Math.ceil(String(text || "").length / (cpt || 3.5));
}

/* ------------------------------------------------------------------ BM25 */
class BM25 {
  constructor(docsTokens, k1 = 1.2, b = 0.75) {
    this.k1 = k1; this.b = b; this.docs = docsTokens; this.N = docsTokens.length;
    this.avgdl = this.N ? docsTokens.reduce((s, d) => s + d.length, 0) / this.N : 1;
    this.tf = []; this.df = new Map();
    for (const d of docsTokens) {
      const m = new Map();
      for (const w of d) m.set(w, (m.get(w) || 0) + 1);
      this.tf.push(m);
      for (const w of m.keys()) this.df.set(w, (this.df.get(w) || 0) + 1);
    }
  }
  idf(term) {
    const n = this.df.get(term) || 0;
    return Math.log(1 + (this.N - n + 0.5) / (n + 0.5));
  }
  scores(queryTokens) {
    const qs = [...new Set(queryTokens)];
    const out = [];
    for (let i = 0; i < this.N; i++) {
      let s = 0;
      const dl = this.docs[i].length, tf = this.tf[i];
      for (const q of qs) {
        const f = tf.get(q) || 0;
        if (f) s += this.idf(q) * (f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + this.b * dl / this.avgdl));
      }
      out.push(s);
    }
    return out;
  }
}

function cosine(a, b) {
  let s = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { s += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? s / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

/* --------------------------------------------- intentions, entités, relances */
function detectIntents(question, intentsCfg) {
  const q = norm(question);
  return Object.keys(intentsCfg).filter(name => new RegExp(intentsCfg[name]).test(q));
}

function detectEntities(normQ, entities) {
  const padded = ` ${normQ} `;
  const found = [];
  for (const ent of Object.keys(entities || {})) {
    for (const a of entities[ent]) {
      if (padded.includes(` ${a} `)) { found.push(ent); break; }
    }
  }
  return found;
}

function strongEntities(ents, cfg) {
  const weak = new Set(cfg.weak_entities);
  return ents.filter(e => !weak.has(e));
}

function hintMatches(normQ, cfg) {
  return (cfg.topic_hints || []).filter(h => new RegExp(h.re).test(normQ));
}

/** Relance = suite du sujet précédent (miroir de is_followup en Python). */
function isFollowup(question, promptDoc, entities) {
  const q = norm(question);
  const intents = promptDoc.intents;
  const cfg = promptDoc.retrieval;
  if (strongEntities(detectEntities(q, entities || {}), cfg).length) return false;
  const has = name => Boolean(intents[name]) && new RegExp(intents[name]).test(q);
  if (cfg.never_followup.some(has)) return false;
  if (has("summary") && has("profile_ref")) return false;
  if (has("accept") || has("cont_start") || has("anaphora")) return true;
  if (hintMatches(q, cfg).length) return false;
  if (has("depth") || has("summary") || has("drilldown")) return true;
  const stop = new Set(cfg.stopwords);
  const words = q.split(" ").filter(w => w && !stop.has(w));
  return words.length <= cfg.followup_max_words;
}

/** Requête de retrieval : une relance hérite des questions précédentes. */
function retrievalQuery(question, history, promptDoc, entities) {
  const users = history.filter(m => m.role === "user").map(m => m.content);
  let lastAssistant = "";
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "assistant") { lastAssistant = history[i].content; break; }
  }
  if (!users.length || !isFollowup(question, promptDoc, entities)) return { query: question, follow: false, lastAssistant };
  const parts = [question];
  const prev = users.slice(-3).reverse();
  for (const p of prev) {
    parts.push(p);
    if (!isFollowup(p, promptDoc, entities)) break;
  }
  return { query: parts.join(" "), follow: true, lastAssistant };
}

/** Poids dense par modèle d'embedding et par langue (miroir de dense_weight). */
function denseWeight(cfg, lang, model) {
  const base = String(model || "").split(":")[0].split("/").pop();
  const by = (cfg.w_dense_by_model || {})[base];
  return by ? (by[lang] !== undefined ? by[lang] : cfg.w_dense) : cfg.w_dense;
}

/* ------------------------------------------------------------------ index */
function chunkDocText(c, lang) {
  return `${c["title_" + lang]}. ${c[lang]}`;
}

function createIndex(chunksDoc, promptDoc) {
  const cfg = promptDoc.retrieval;
  const stop = new Set(cfg.stopwords);
  const chunks = chunksDoc.chunks;
  const bm25 = new BM25(chunks.map(c => tokens(`${c.title_fr} ${c.title_en} ${c.fr} ${c.en}`, stop)), cfg.bm25.k1, cfg.bm25.b);
  const byId = new Map(chunks.map((c, i) => [c.id, i]));
  const expEntities = new Set(chunks.filter(c => c.id.startsWith("projet_") || c.id.startsWith("stage_")).map(c => c.entity));
  return { version: chunksDoc.version, chunks, entities: chunksDoc.entities || {}, prompt: promptDoc, cfg, stop, bm25,
           byId, expEntities, vectors: null };
}

/** Fusion RRF (rangs BM25 + rangs denses), normalisée pour que le 1er rang vaille le poids. */
function rrf(bm, dense, cfg, wd) {
  const K = cfg.rrf_k;
  const fused = new Array(bm.length).fill(0);
  const orderBm = bm.map((s, i) => i).filter(i => bm[i] > 0).sort((a, b) => (bm[b] - bm[a]) || (a - b));
  orderBm.forEach((i, r) => { fused[i] += cfg.w_bm25 * (K + 1) / (K + r + 1); });
  if (dense) {
    const orderD = dense.map((s, i) => i).sort((a, b) => (dense[b] - dense[a]) || (a - b));
    orderD.forEach((i, r) => { fused[i] += wd * (K + 1) / (K + r + 1); });
  }
  return fused;
}

/** Scores d'un texte de requête (miroir de RagIndex.scores) : RRF + entités + indices thématiques. */
function scoresFor(index, query, ents, dense, cfg, lang, listQuery, facet, model) {
  const bm = index.bm25.scores(tokens(query, index.stop));
  const fused = rrf(bm, dense, cfg, denseWeight(cfg, lang, model));
  const weak = new Set(cfg.weak_entities);
  const lists = new Set(cfg.list_entities || []);
  const strong = ents.some(e => !weak.has(e));
  index.chunks.forEach((c, i) => {
    const keys = [c.entity].concat(c.id === "profil" ? ["objective"] : []);
    const matched = keys.filter(k => ents.includes(k));
    if (matched.length) {
      const allWeak = matched.every(k => weak.has(k));
      const listOnly = matched.every(k => lists.has(k));
      const weakHit = (allWeak && strong) || (listOnly && !listQuery);
      fused[i] += weakHit ? cfg.weak_entity_boost : cfg.entity_boost;
      if (!facet && (c.id.startsWith("projet_") || c.id.startsWith("stage_"))) fused[i] += cfg.overview_bonus;
    }
  });
  for (const h of hintMatches(norm(query), cfg)) {
    const demote = h.demote || [];
    index.chunks.forEach((c, i) => {
      if (h.ids.some(x => c.id === x || c.id.startsWith(x + "_"))) fused[i] += cfg.hint_boost;
      else if (demote.includes(c.id) || demote.includes(c.entity)) fused[i] -= cfg.hint_boost;
      /* « exclude » : hors sujet pour cette intention (ex. « échecs » = jeu, projet sans résultat) */
      if ((h.exclude || []).includes(c.id) || (h.exclude || []).includes(c.entity)) fused[i] = -1e9;
    });
  }
  return fused;
}

/** Classement complet + passages imposés + mode de réponse (miroir de RagIndex.plan).
 *  getDense(texts) -> Promise<number[][] | null> (null = BM25 seul). */
async function planRetrieval(index, question, history, lang, getDense, cfgOverride, model) {
  const cfg = cfgOverride || index.cfg;
  const pi = index.prompt.intents;
  const modes = index.prompt.modes;
  const { query, follow, lastAssistant } = retrievalQuery(question, history, index.prompt, index.entities);
  const intents = detectIntents(question, pi);
  const has = x => intents.includes(x);
  const nq = norm(question);
  const hintsQ = hintMatches(nq, cfg);
  const entsQ = detectEntities(nq, index.entities);
  const ents = detectEntities(norm(query), index.entities);
  if (follow && lastAssistant && (!hintsQ.length || ["depth", "summary", "drilldown", "accept"].some(has))) {
    for (const e of detectEntities(norm(lastAssistant.slice(0, 600)), index.entities)) {
      if (index.expEntities.has(e) && !ents.includes(e)) ents.push(e);
    }
  }
  const listQ = has("list");
  const facet = (cfg.facets || []).some(f => new RegExp(f.re).test(nq));
  const strong = strongEntities(ents, cfg);
  let dense = null;
  if (getDense) {
    try { dense = await getDense(follow ? [question, query] : [question]); } catch (_) { dense = null; }
  }
  let fused;
  if (follow) {
    const s1 = scoresFor(index, question, entsQ, dense ? dense[0] : null, cfg, lang, listQ, facet, model);
    const s2 = scoresFor(index, query, ents, dense ? dense[1] : null, cfg, lang, listQ, facet, model);
    const wq = cfg.w_followup_question !== undefined ? cfg.w_followup_question : 1;
    const wa = cfg.w_followup_augmented !== undefined ? cfg.w_followup_augmented : 1;
    fused = s1.map((a, i) => wq * a + wa * s2[i]);
  } else {
    fused = scoresFor(index, question, ents, dense ? dense[0] : null, cfg, lang, listQ, facet, model);
  }
  if (strong.length) {
    for (const f of cfg.facets || []) {
      if (!new RegExp(f.re).test(nq)) continue;
      index.chunks.forEach((c, i) => {
        if (strong.includes(c.entity) && f.prefixes.some(p => c.id.startsWith(p))) fused[i] += cfg.facet_boost;
      });
    }
  }
  if (cfg.company_re && !new RegExp(cfg.company_re).test(nq)) {
    index.chunks.forEach((c, i) => { if (c.id.startsWith("entreprise_")) fused[i] -= cfg.company_demote; });
  }
  const order = fused.map((s, i) => i).sort((a, b) => (fused[b] - fused[a]) || (a - b));
  let base = [];
  if (has("self_intro")) base = cfg.always_for_intro.slice();
  else if (has("why_hire") || has("motivation")) base = cfg.always_for_summary.slice();
  else if (has("summary") && (!strong.length || new RegExp(pi.profile_ref).test(nq))) base = cfg.always_for_summary.slice();
  const hinted = [];
  for (const h of hintsQ.slice(0, cfg.max_forced_hints !== undefined ? cfg.max_forced_hints : 2)) {
    if (h.ids.length && !base.includes(h.ids[0]) && !hinted.includes(h.ids[0])) hinted.push(h.ids[0]);
  }
  let mode = "simple";
  for (const m of modes.order) {
    if (!has(modes.intent[m])) continue;
    if (m === "overview" && (follow || !strongEntities(entsQ, cfg).length)) continue;
    mode = m;
    break;
  }
  return { query, followup: follow, intents, entities: ents, retrieval: dense ? "hybrid" : "bm25", scores: fused, order,
           baseForced: base, hintForced: hinted, mode, long: modes.long.includes(mode), careful: modes.careful.includes(mode) };
}

/** Sélection finale : passages imposés puis top-k adaptatif (3 à 6) sous budget de tokens (miroir de retrieve). */
async function selectChunks(index, question, history, lang, getDense, model) {
  const cfg = index.cfg;
  const pl = await planRetrieval(index, question, history, lang, getDense, null, model);
  const cpt = cfg.chars_per_token;
  const picked = [];
  let used = 0;
  for (const cid of pl.baseForced.concat(pl.hintForced)) {
    const i = index.byId.get(cid);
    if (i === undefined || picked.includes(i)) continue;
    const cost = estTokens(index.chunks[i][lang], cpt);
    if (!pl.baseForced.includes(cid) && used + cost > cfg.budget_tokens) continue;
    picked.push(i);
    used += cost;
  }
  const top = pl.order.length ? pl.scores[pl.order[0]] : 0;
  for (const i of pl.order) {
    if (picked.includes(i)) continue;
    if (picked.length >= cfg.k_max) break;
    const cost = estTokens(index.chunks[i][lang], cpt);
    if (used + cost > cfg.budget_tokens) continue;
    if (picked.length >= cfg.k_min && pl.scores[i] < cfg.rel_threshold * top) break;
    picked.push(i);
    used += cost;
  }
  return {
    selected: picked.map(i => index.chunks[i]),
    info: { query: pl.query, followup: pl.followup, intents: pl.intents, entities: pl.entities, retrieval: pl.retrieval,
            mode: pl.mode, long: pl.long, careful: pl.careful, tokens: used,
            ranked: pl.order.slice(0, 8).map(i => index.chunks[i].id) },
  };
}

/* ------------------------------------------------------------------ prompt */
function todayStr(lang, promptDoc, date) {
  const p = promptDoc[lang];
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "numeric", day: "numeric" })
    .formatToParts(date || new Date());
  const get = t => Number(parts.find(x => x.type === t).value);
  return p.date_format.replace("{d}", () => String(get("day"))).replace("{month}", () => p.months[get("month") - 1])
    .replace("{y}", () => String(get("year")));
}

/** Derniers messages, rôles contrôlés, tronqués (idempotent), budget total borné (miroir de clean_history). */
function cleanHistory(history, gen) {
  const out = [];
  for (const m of (Array.isArray(history) ? history : []).slice(-gen.history_messages)) {
    if (!m || typeof m !== "object" || (m.role !== "user" && m.role !== "assistant")) continue;
    let content = String(m.content == null ? "" : m.content).trim();
    if (!content) continue;
    const lim = m.role === "user" ? gen.history_chars_user : gen.history_chars_assistant;
    if (content.length > lim) {
      const cut = content.slice(0, lim - 2);
      const sp = cut.lastIndexOf(" ");
      content = (sp > 0 ? cut.slice(0, sp) : cut) + " …";
    }
    out.push({ role: m.role, content });
  }
  let total = out.reduce((s, m) => s + m.content.length, 0);
  while (out.length && total > gen.history_chars_total) total -= out.shift().content.length;
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

function firstWords(text, n) {
  return String(text || "").replace(/[*_#>`|\-•]+/g, " ").split(/\s+/).filter(Boolean).slice(0, n || 8).join(" ");
}

/** Dernier message système, propre au tour (miroir de turn_instructions). */
function turnInstructions(info, history, lang, promptDoc, rnd) {
  const p = promptDoc[lang];
  const t = p.turn;
  const modes = promptDoc.modes;
  const mode = info.mode || "simple";
  const guard = (mode === "depth" || mode === "drilldown") ? t.guard : (t.guard_short || t.guard);
  const lines = [p.mode_hints[mode] || p.mode_hints.simple, guard];
  const prev = history.filter(m => m.role === "assistant").map(m => m.content).slice(-2);
  const openers = prev.map(a => firstWords(a, 8)).filter(Boolean);
  if (openers.length) {
    const [q1, q2] = lang === "fr" ? ["« ", " »"] : ["\"", "\""];
    lines.push(t.avoid_openers.replace("{list}", () => openers.map(o => q1 + o + q2).join(" ; ")));
  }
  if (modes.angles.includes(mode)) {
    const r = rnd === undefined || rnd === null ? Math.random() : rnd;
    lines.push(t.angles[Math.min(Math.floor(r * t.angles.length), t.angles.length - 1)]);
  }
  const asked = prev.some(a => a.trimEnd().endsWith("?"));
  lines.push(modes.offer.includes(mode) && !asked ? t.offer_ok : t.no_offer);
  return t.header + "\n- " + lines.join("\n- ");
}

/** Messages : system (règles + contexte) → historique → system (consignes du tour) → question. */
function buildMessages(question, history, lang, selected, info, promptDoc, date, rnd) {
  const p = promptDoc[lang];
  const ctx = selected.map((c, k) => p.context_header.replace("{n}", () => String(k + 1)).replace("{title}", () => c["title_" + lang])
    + "\n" + c[lang]).join("\n\n");
  const system = p.system.replace("{context}", () => ctx).replace("{today}", () => todayStr(lang, promptDoc, date));
  const hist = cleanHistory(history, promptDoc.generation);
  return [{ role: "system", content: system }].concat(hist, [
    { role: "system", content: turnInstructions(info, hist, lang, promptDoc, rnd) },
    { role: "user", content: question },
  ]);
}

/** Paramètres Groq imposés côté serveur (le client ne choisit ni modèle ni longueur). */
function groqBody(model, messages, gen, longAnswer, careful) {
  const maxT = longAnswer ? gen.max_tokens_long : gen.max_tokens;
  const body = { model, messages, temperature: (gen.temperature_by_model || {})[model] ?? gen.temperature, stream: true };
  if (model.startsWith("openai/gpt-oss")) {
    body.reasoning_effort = careful ? gen.reasoning_effort_careful : gen.reasoning_effort;
    body.include_reasoning = false;
    body.max_completion_tokens = maxT + gen.reasoning_allowance; // le raisonnement compte dans la limite
  } else if (model.startsWith("qwen/")) {
    body.reasoning_effort = "none";
    body.max_completion_tokens = maxT + (gen.reasoning_allowance_qwen || 0); // qwen raisonne parfois malgré « none »
  } else {
    body.max_tokens = maxT;
  }
  return body;
}

/** Retire d'éventuels blocs <think>…</think> d'un flux de texte. */
class ThinkFilter {
  constructor() { this.buf = ""; this.inside = false; }
  feed(s) {
    this.buf += s;
    let out = "";
    while (this.buf) {
      if (this.inside) {
        const j = this.buf.indexOf("</think>");
        if (j < 0) { this.buf = this.buf.slice(-8); return out; }
        this.buf = this.buf.slice(j + 8); this.inside = false;
      } else {
        const j = this.buf.indexOf("<think>");
        if (j < 0) {
          const k = this.buf.lastIndexOf("<");
          if (k >= 0 && "<think>".startsWith(this.buf.slice(k))) { out += this.buf.slice(0, k); this.buf = this.buf.slice(k); }
          else { out += this.buf; this.buf = ""; }
          return out;
        }
        out += this.buf.slice(0, j);
        this.buf = this.buf.slice(j + 7); this.inside = true;
      }
    }
    return out;
  }
  flush() { const r = this.inside ? "" : this.buf; this.buf = ""; return r; }
}

/* refus générique des modèles gpt-oss (« I'm sorry, but I can't comply with that. ») -> refus localisé d'ISSA */
const EN_REFUSAL_RE = /^\s*(I[’']?m sorry|I am sorry|Sorry)[,.!]?\s*(but\s+)?I\s*(can[’']?t|cannot|won[’']?t)/i;

class RefusalGuard {
  constructor(refusal, n) { this.refusal = refusal; this.n = n || 60; this.buf = ""; this.state = "buffer"; }
  decide() {
    if (EN_REFUSAL_RE.test(this.buf)) { this.state = "replaced"; this.buf = ""; return this.refusal; }
    const out = this.buf; this.buf = ""; this.state = "pass"; return out;
  }
  feed(s) {
    if (this.state === "pass") return s;
    if (this.state === "replaced") return "";
    this.buf += s;
    return this.buf.length >= this.n ? this.decide() : "";
  }
  flush() { return this.state === "buffer" && this.buf ? this.decide() : ""; }
}

const ZERO_WIDTH = /[​-‍⁠﻿]/g;

/** Lit le flux SSE de Groq et produit UNIQUEMENT le contenu (les deltas « reasoning » sont ignorés). */
async function* groqContent(body, guard) {
  const reader = body.getReader();
  const dec = new TextDecoder();
  const tf = new ThinkFilter();
  let buf = "";
  const tail = () => {
    let r = tf.flush().replace(ZERO_WIDTH, "");
    if (guard) r = (r ? guard.feed(r) : "") + guard.flush();
    return r;
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") { const r = tail(); if (r) yield r; return; }
        let obj;
        try { obj = JSON.parse(payload); } catch (_) { continue; }
        if (obj.error) throw new Error("upstream stream error");
        const delta = obj.choices && obj.choices[0] && obj.choices[0].delta && obj.choices[0].delta.content;
        if (delta) {
          let t = tf.feed(delta).replace(ZERO_WIDTH, "");
          if (t && guard) t = guard.feed(t);
          if (t) yield t;
        }
      }
    }
    const r = tail();
    if (r) yield r;
  } finally {
    try { reader.releaseLock(); } catch (_) { /* déjà libéré */ }
  }
}

function withTimeout(promise, ms) {
  let t;
  return Promise.race([promise, new Promise((_, rej) => { t = setTimeout(() => rej(new Error("timeout")), Math.max(0, ms)); })])
    .finally(() => clearTimeout(t));
}

/* ------------------------------------------------- pauses des modèles (429) */
/* modèle -> fin de pause (ms) ; mémoire du module + KV (EMB) partagé entre instances */
const COOL = new Map();
const COOL_KEY = "cooldowns:v1";
let coolReadAt = 0;

async function loadCooldowns(env) {
  if (env.EMB && Date.now() - coolReadAt > 30000) {
    coolReadAt = Date.now();
    try {
      const saved = await env.EMB.get(COOL_KEY, "json");
      if (saved && typeof saved === "object") {
        for (const [m, until] of Object.entries(saved)) if (Number(until) > (COOL.get(m) || 0)) COOL.set(m, Number(until));
      }
    } catch (_) { /* KV indisponible : mémoire seule */ }
  }
  return COOL;
}

function setCooldown(env, ctx, model, retryAfter, capS) {
  let secs = Number(retryAfter);
  if (!Number.isFinite(secs)) secs = 60;
  secs = Math.max(5, Math.min(secs, capS || 3600));
  COOL.set(model, Date.now() + secs * 1000);
  if (env.EMB) {
    const obj = {};
    for (const [m, until] of COOL) if (until > Date.now()) obj[m] = until;
    const p = env.EMB.put(COOL_KEY, JSON.stringify(obj), { expirationTtl: Math.max(60, Math.ceil(secs) + 60) }).catch(() => {});
    if (ctx && ctx.waitUntil) ctx.waitUntil(p);
  }
  return secs;
}

function modelList(env, gen) {
  return (env.MODELS ? String(env.MODELS).split(",").map(s => s.trim()).filter(Boolean) : null) || gen.models || DEFAULT_MODELS;
}

/** Essaie chaque modèle ; renvoie {model, first, iter, controller} dès le premier token de contenu.
 *  Une seule échéance (deadline) pour le 1er token ; chaque modèle a au plus first_token_timeout_ms.
 *  429 -> pause du modèle (Retry-After) puis modèle suivant ; 5xx / 400 / 404 / 413 / délai -> suivant ;
 *  401 / 403 -> arrêt (clé invalide). (miroir de stream_groq) */
async function openCascade(messages, env, gen, longAnswer, careful, deadline, refusal, ctx) {
  const models = modelList(env, gen);
  const cool = await loadCooldowns(env);
  let lastStatus = 502, tried = 0;
  for (const model of models) {
    if ((cool.get(model) || 0) > Date.now()) { if (lastStatus !== 503) lastStatus = 429; continue; }
    const left = deadline - Date.now();
    if (left < (gen.min_model_ms || 1500)) { if (tried) lastStatus = lastStatus === 429 ? 429 : 503; break; }
    const ms = Math.min(gen.first_token_timeout_ms, left);
    tried++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      const resp = await fetch(GROQ_URL, {
        method: "POST", signal: controller.signal,
        headers: { "Authorization": `Bearer ${env.GROQ_API_KEY}`, "Content-Type": "application/json", "Accept": "text/event-stream" },
        body: JSON.stringify(groqBody(model, messages, gen, longAnswer, careful)),
      });
      if (!resp.ok) {
        try { await resp.body.cancel(); } catch (_) { /* rien */ }
        clearTimeout(timer);
        if (resp.status === 401 || resp.status === 403) return { error: 503 };
        if (resp.status === 429) {
          const secs = setCooldown(env, ctx, model, resp.headers.get("retry-after"), gen.cooldown_max_s);
          console.log(`[issa] ${model} -> 429, pause ${Math.round(secs)} s`);
          lastStatus = 429;
        } else {
          lastStatus = lastStatus === 429 ? 429 : 502;
        }
        continue;
      }
      console.log(`[issa] ${model} quotas restants : tokens/min ${resp.headers.get("x-ratelimit-remaining-tokens")}, ` +
                  `requêtes/jour ${resp.headers.get("x-ratelimit-remaining-requests")}`);
      const iter = groqContent(resp.body, refusal ? new RefusalGuard(refusal, gen.refusal_buffer_chars) : null);
      const first = await iter.next();
      clearTimeout(timer);
      if (first.done) { lastStatus = lastStatus === 429 ? 429 : 502; continue; }
      return { model, first: first.value, iter, controller };
    } catch (_) {
      clearTimeout(timer);
      try { controller.abort(); } catch (__) { /* rien */ }
      if (lastStatus !== 429) lastStatus = 503;
    }
  }
  return { error: lastStatus };
}

/* ------------------------------------------------------------- chargement */
const STATE = { assets: null, fetchedAt: 0, loading: null, index: null, vecPromise: null, vecVersion: null };

async function fetchJson(url) {
  const r = await fetch(url, { cf: { cacheTtl: 300, cacheEverything: true } });
  if (!r.ok) throw new Error(`asset ${r.status}`);
  return r.json();
}

async function loadIndex(env) {
  const fresh = STATE.index && (Date.now() - STATE.fetchedAt < ASSET_TTL_MS);
  if (fresh) return STATE.index;
  if (!STATE.loading) {
    STATE.loading = (async () => {
      const [chunksDoc, promptDoc] = await Promise.all([
        fetchJson(env.CHUNKS_URL || DEFAULT_CHUNKS_URL), fetchJson(env.PROMPT_URL || DEFAULT_PROMPT_URL)]);
      if (!STATE.index || STATE.index.version !== chunksDoc.version || STATE.index.prompt.version !== promptDoc.version) {
        const old = STATE.index;
        STATE.index = createIndex(chunksDoc, promptDoc);
        if (old && old.version === chunksDoc.version) STATE.index.vectors = old.vectors; // mêmes passages
      }
      STATE.fetchedAt = Date.now();
      return STATE.index;
    })().finally(() => { STATE.loading = null; });
  }
  try { return await STATE.loading; } catch (e) {
    if (STATE.index) return STATE.index; // ancienne version encore valable
    throw e;
  }
}

function embedModel(env) {
  return env.EMBED_MODEL || EMBED_MODEL;
}

async function embedTexts(env, texts) {
  const out = [];
  for (let k = 0; k < texts.length; k += EMBED_BATCH) {
    const res = await env.AI.run(embedModel(env), { text: texts.slice(k, k + EMBED_BATCH) });
    if (!res || !Array.isArray(res.data)) throw new Error("embedding invalide");
    out.push(...res.data);
  }
  return out;
}

const CACHE_HOST = "https://issa-rag-cache.internal";

function setVectorsFromBuffer(index, buf) {
  const n = index.chunks.length * 2;
  const all = new Float32Array(buf);
  const dim = all.length / n;
  if (!(dim > 0 && Number.isInteger(dim))) return false;
  index.vectors = index.chunks.map((_, i) => [all.subarray(2 * i * dim, (2 * i + 1) * dim),
                                              all.subarray((2 * i + 1) * dim, (2 * i + 2) * dim)]);
  return true;
}

/** Vecteurs des passages : mémoire du module, puis KV (EMB, fonctionne sur *.workers.dev), puis
 *  caches.default (domaine personnalisé seulement), sinon calcul (puis sauvegarde en tâche de fond). */
function ensureVectors(index, env, ctx) {
  if (index.vectors) return Promise.resolve(true);
  if (!env.AI) return Promise.resolve(false);
  if (STATE.vecPromise && STATE.vecVersion === index.version) return STATE.vecPromise;
  STATE.vecVersion = index.version;
  STATE.vecPromise = (async () => {
    const kvKey = `emb:${embedModel(env)}:${index.version}`;
    const cache = (typeof caches !== "undefined" && caches.default) ? caches.default : null;
    const cacheKey = `${CACHE_HOST}/emb/${encodeURIComponent(embedModel(env))}/${index.version}`;
    /* format binaire Float32 (aucun JSON.parse coûteux : budget CPU de 10 ms de l'offre gratuite) */
    if (env.EMB) {
      try {
        const buf = await env.EMB.get(kvKey, "arrayBuffer");
        if (buf && setVectorsFromBuffer(index, buf)) return true;
      } catch (_) { /* KV indisponible */ }
    }
    if (cache) {
      try {
        const hit = await cache.match(cacheKey);
        if (hit && setVectorsFromBuffer(index, await hit.arrayBuffer())) return true;
      } catch (_) { /* cache indisponible */ }
    }
    const texts = [];
    for (const c of index.chunks) texts.push(chunkDocText(c, "fr"), chunkDocText(c, "en"));
    const vecs = await embedTexts(env, texts);
    index.vectors = index.chunks.map((_, i) => [vecs[2 * i], vecs[2 * i + 1]]);
    const dim = vecs[0].length;
    const all = new Float32Array(texts.length * dim);
    vecs.forEach((v, k) => all.set(v, k * dim));
    const saves = [];
    if (env.EMB) saves.push(env.EMB.put(kvKey, all.buffer, { expirationTtl: KV_EMB_TTL_S }).catch(() => {}));
    if (cache) {
      saves.push(cache.put(cacheKey, new Response(all.buffer.slice(0), {
        headers: { "Content-Type": "application/octet-stream", "Cache-Control": "public, max-age=2592000" } })).catch(() => {}));
    }
    if (saves.length && ctx && ctx.waitUntil) ctx.waitUntil(Promise.all(saves));
    return true;
  })().catch(() => { STATE.vecPromise = null; return false; });
  return STATE.vecPromise;
}

/** getDense(texts) : scores denses de chaque texte (une seule requête Workers AI), ou null. */
function denseScorer(index, env, ctx) {
  return async (texts) => {
    if (!env.AI) return null;
    const ready = ensureVectors(index, env, ctx);
    if (ctx && ctx.waitUntil) ctx.waitUntil(ready);
    let ok;
    try { ok = await withTimeout(ready, FIRST_EMBED_WAIT_MS); } catch (_) { ok = false; }
    if (!ok || !index.vectors) return null;   // première visite d'une instance : BM25, les vecteurs arrivent
    const qvs = await withTimeout(embedTexts(env, texts), QUERY_EMBED_MS);
    return qvs.map(qv => index.vectors.map(([vf, ve]) => Math.max(cosine(qv, vf), cosine(qv, ve))));
  };
}

/* ------------------------------------------------------------- HTTP / sécurité */
function allowedOrigins(env) {
  let list = PROD_ORIGINS.slice();
  if (env.ALLOW_LOCAL === "1") list = list.concat(LOCAL_ORIGINS);
  if (env.ALLOWED_ORIGINS) list = list.concat(String(env.ALLOWED_ORIGINS).split(",").map(s => s.trim()).filter(Boolean));
  return list;
}

function baseHeaders(origin, env) {
  const h = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
  if (origin && allowedOrigins(env).includes(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    h["Access-Control-Allow-Headers"] = "Content-Type";
    h["Access-Control-Max-Age"] = "86400";
  }
  return h;
}

function json(status, obj, origin, env, extra) {
  return new Response(JSON.stringify(obj), {
    status, headers: Object.assign(baseHeaders(origin, env), { "Content-Type": "application/json; charset=utf-8" }, extra || {}) });
}

/* limites en mémoire (best effort : une instance du Worker ne voit qu'une partie du trafic),
   dimensionnées sur le quota Groq gratuit (8 000 tokens/min et ~200 000 tokens/jour par modèle,
   ~3 000 tokens par question) ; le binding RL (Rate Limiting de Cloudflare) est prioritaire s'il existe */
const HITS = new Map();
function rateLimited(ip, limit, now) {
  now = now || Date.now();
  const arr = (HITS.get(ip) || []).filter(t => now - t < 60000);
  if (arr.length >= limit) { HITS.set(ip, arr); return true; }
  arr.push(now);
  HITS.set(ip, arr);
  if (HITS.size > 5000) { for (const [k, v] of HITS) { if (!v.length || now - v[v.length - 1] > 60000) HITS.delete(k); } }
  return false;
}

const DAY = new Map();
function overDaily(ip, cap, now) {
  const d = new Date(now || Date.now()).toISOString().slice(0, 10);
  const e = DAY.get(ip);
  if (!e || e.d !== d) {
    DAY.set(ip, { d, n: 1 });
    if (DAY.size > 10000) { for (const [k, v] of DAY) if (v.d !== d) DAY.delete(k); }
    return 1 > cap;
  }
  e.n += 1;
  return e.n > cap;
}

const GLOBAL = [];
function overGlobal(n, now) {
  now = now || Date.now();
  while (GLOBAL.length && now - GLOBAL[0] > 60000) GLOBAL.shift();
  if (GLOBAL.length >= n) return true;
  GLOBAL.push(now);
  return false;
}

function validateChat(body, gen) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: [400, "JSON objet attendu"] };
  if (typeof body.question !== "string" || !body.question.trim()) return { error: [400, "question manquante"] };
  const question = body.question.trim();
  if (question.length > gen.question_max_chars) return { error: [413, "question trop longue"] };
  const lang = body.lang === "en" ? "en" : "fr";
  if (body.history != null && !Array.isArray(body.history)) return { error: [400, "history doit être une liste"] };
  const history = (body.history || []).slice(-gen.history_messages)
    .filter(m => m && typeof m === "object" && (m.role === "user" || m.role === "assistant"))
    .map(m => ({ role: m.role, content: String(m.content == null ? "" : m.content).slice(0, 4000) }));
  return { question, lang, history };
}

/** Lit le corps avec un plafond d'octets (même sans Content-Length). null = trop volumineux. */
async function readBodyCapped(request, maxBytes) {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const parts = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > maxBytes) { try { await reader.cancel(); } catch (_) { /* rien */ } return null; }
    parts.push(value);
  }
  const all = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { all.set(p, o); o += p.length; }
  return new TextDecoder().decode(all);
}

async function handleChat(request, env, ctx, origin) {
  const t0 = Date.now();
  if (!env.GROQ_API_KEY) return json(503, { error: "relais non configuré" }, origin, env);
  const ct = request.headers.get("Content-Type") || "";
  if (!ct.toLowerCase().includes("application/json")) return json(415, { error: "Content-Type application/json attendu" }, origin, env);
  const len = Number(request.headers.get("Content-Length") || 0);
  if (len > MAX_BODY_BYTES) return json(413, { error: "requête trop volumineuse" }, origin, env);
  const raw = await readBodyCapped(request, MAX_BODY_BYTES);
  if (raw === null) return json(413, { error: "requête trop volumineuse" }, origin, env);
  let body;
  try { body = JSON.parse(raw); } catch (_) { return json(400, { error: "JSON invalide" }, origin, env); }

  let index;
  try { index = await loadIndex(env); } catch (_) { return json(503, { error: "données indisponibles" }, origin, env); }
  const gen = index.prompt.generation;
  const v = validateChat(body, gen);
  if (v.error) return json(v.error[0], { error: v.error[1] }, origin, env);
  const deadline = t0 + (gen.first_token_budget_ms || 10000);
  const hist = cleanHistory(v.history, gen);   // une seule fois : retrieval ET messages

  const { selected, info } = await selectChunks(index, v.question, hist, v.lang, denseScorer(index, env, ctx), embedModel(env));
  const messages = buildMessages(v.question, hist, v.lang, selected, info, index.prompt);
  const opened = await openCascade(messages, env, gen, info.long, info.careful, deadline, index.prompt[v.lang].refusal, ctx);
  if (opened.error) {
    const status = [429, 502, 503].includes(opened.error) ? opened.error : 502;
    return json(status, { error: "LLM indisponible", retryable: status !== 502 }, origin, env,
      status === 429 ? { "Retry-After": "20" } : undefined);
  }

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  const meta = { sources: selected.map(c => ({ id: c.id, entity: c.entity, title: c["title_" + v.lang] })),
                 model: opened.model, retrieval: info.retrieval };
  const idle = gen.stream_idle_ms || 15000, maxMs = gen.stream_max_ms || 60000;
  const pump = (async () => {
    const started = Date.now();
    let cut = false;
    try {
      await writer.write(enc.encode(`event: meta\ndata: ${JSON.stringify(meta)}\n\n`));
      await writer.write(enc.encode(`data: ${JSON.stringify({ delta: opened.first })}\n\n`));
      for (;;) {
        const left = maxMs - (Date.now() - started);
        if (left <= 0) { cut = true; break; }
        const n = await withTimeout(opened.iter.next(), Math.min(idle, left));   // flux amont bloqué -> coupure
        if (n.done) break;
        await writer.write(enc.encode(`data: ${JSON.stringify({ delta: n.value })}\n\n`));
      }
    } catch (_) {
      cut = true;   /* flux amont interrompu / bloqué */
    } finally {
      try { opened.controller.abort(); } catch (_) { /* rien */ }
      /* le navigateur garde alors la réponse partielle avec la mention « réponse interrompue » */
      if (cut) { try { await writer.write(enc.encode(`data: ${JSON.stringify({ error: "interrupted" })}\n\n`)); } catch (_) { /* client parti */ } }
      try { await writer.write(enc.encode("data: [DONE]\n\n")); } catch (_) { /* client parti */ }
      try { await writer.close(); } catch (_) { /* rien */ }
    }
  })();
  if (ctx && ctx.waitUntil) ctx.waitUntil(pump);
  return new Response(readable, {
    status: 200,
    headers: Object.assign(baseHeaders(origin, env), { "Content-Type": "text/event-stream; charset=utf-8", "X-Accel-Buffering": "no" }),
  });
}

async function handleHealth(env, ctx, origin) {
  let index;
  try { index = await loadIndex(env); } catch (_) { return json(503, { ok: false, error: "données indisponibles" }, origin, env); }
  /* préchauffage des vecteurs seulement pour le site autorisé (pas pour n'importe quel appelant) */
  if (!index.vectors && env.AI && ctx && ctx.waitUntil && allowedOrigins(env).includes(origin)) ctx.waitUntil(ensureVectors(index, env, ctx));
  const gen = index.prompt.generation;
  return json(200, {
    ok: true, chunks: index.chunks.length, embedded: Boolean(index.vectors),
    embedModel: env.AI ? embedModel(env) : null,
    models: modelList(env, gen),
    version: index.version, groqKey: Boolean(env.GROQ_API_KEY),
  }, origin, env);
}

async function handle(request, env, ctx) {
  env = env || {};
  const origin = request.headers.get("Origin") || "";
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const allowed = allowedOrigins(env);
  const ip = request.headers.get("CF-Connecting-IP") || "local";

  if (request.method === "OPTIONS") {
    if (!allowed.includes(origin)) return new Response(null, { status: 403, headers: baseHeaders("", env) });
    return new Response(null, { status: 204, headers: baseHeaders(origin, env) });
  }
  if (path.endsWith("/health")) {
    if (request.method !== "GET") return json(405, { error: "GET attendu" }, origin, env, { "Allow": "GET" });
    if (rateLimited("health:" + ip, 20)) return json(429, { error: "trop de requêtes" }, origin, env, { "Retry-After": "60" });
    return handleHealth(env, ctx, origin);
  }
  if (path.endsWith("/chat")) {
    if (request.method !== "POST") return json(405, { error: "POST attendu" }, origin, env, { "Allow": "POST" });
    /* Origin obligatoire et autorisée (anti-vol de quota depuis un autre site ; un script peut forger
       l'en-tête : ce n'est PAS une authentification) ; ALLOW_NO_ORIGIN = "1" est réservé au banc
       d'essai local (dev/worker_harness.html) */
    if (origin ? !allowed.includes(origin) : env.ALLOW_NO_ORIGIN !== "1") return json(403, { error: "origine non autorisée" }, origin, env);
    if (env.RL && typeof env.RL.limit === "function") {
      try {
        const { success } = await env.RL.limit({ key: ip });
        if (!success) return json(429, { error: "trop de requêtes, réessayez dans une minute" }, origin, env, { "Retry-After": "60" });
      } catch (_) { /* binding indisponible : limites en mémoire */ }
    }
    const limit = Math.max(1, Number(env.RATE_LIMIT) || 4);
    if (rateLimited(ip, limit)) return json(429, { error: "trop de requêtes, réessayez dans une minute" }, origin, env, { "Retry-After": "60" });
    if (overDaily(ip, Math.max(1, Number(env.DAILY_LIMIT) || 40))) {
      return json(429, { error: "limite quotidienne atteinte" }, origin, env, { "Retry-After": "3600" });
    }
    /* budget de toute l'instance : au-delà, 429 immédiat plutôt que d'épuiser la cascade Groq */
    if (overGlobal(Math.max(1, Number(env.GLOBAL_RPM) || 6))) {
      return json(429, { error: "assistant très sollicité, réessayez dans une minute" }, origin, env, { "Retry-After": "30" });
    }
    return handleChat(request, env, ctx, origin);
  }
  return json(404, { error: "routes : POST /chat, GET /health" }, origin, env);
}

export default {
  async fetch(request, env, ctx) {
    try {
      return await handle(request, env, ctx);
    } catch (_) {
      return json(500, { error: "erreur interne" }, request.headers.get("Origin") || "", env || {});
    }
  },
  /* fonctions pures exposées pour le banc d'essai navigateur (dev/worker_harness.js) ;
     propriété ignorée par Cloudflare (ce n'est pas un gestionnaire d'événement) */
  testing: {
    norm, stem, tokens, estTokens, BM25, cosine, detectIntents, detectEntities, isFollowup, retrievalQuery,
    createIndex, rrf, scoresFor, planRetrieval, selectChunks, buildMessages, buildPrompt: buildMessages, cleanHistory,
    turnInstructions, groqBody, ThinkFilter, RefusalGuard, todayStr, validateChat, rateLimited, overDaily, overGlobal,
    chunkDocText, allowedOrigins, denseWeight, readBodyCapped, ensureVectors, _state: STATE, _cool: COOL,
    _resetLimits() { HITS.clear(); DAY.clear(); GLOBAL.length = 0; COOL.clear(); },
  },
};
