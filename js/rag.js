/* ============================================================================
   JESUS — Pipeline RAG (Retrieval-Augmented Generation) côté navigateur
   ----------------------------------------------------------------------------
   Portage JavaScript du pipeline de référence chatbot/jesus_rag.py :

     1. CHUNKING     : la base de connaissances (JESUS_KB) est découpée en
                       passages ciblés (profil, chaque stage, chaque projet,
                       compétences, parcours…), bilingues FR/EN.
     2. INDEXATION   : index lexical BM25 (Okapi) construit au chargement,
                       + index d'entités (alias NLP normalisés).
     3. RETRIEVAL    : recherche hybride = score BM25 + boost d'entités.
                       Top-K passages retenus pour le contexte.
     4. AUGMENTATION : les passages sont injectés dans un prompt système
                       strictement ancré (« réponds UNIQUEMENT avec le
                       contexte ») + historique de conversation multi-tours.
     5. GÉNÉRATION   : appel du LLM distant (Groq — gratuit et ultra-rapide)
                       en STREAMING via le proxy Cloudflare Worker qui protège
                       la clé API. En cas d'échec / hors-ligne / clé absente :
                       repli automatique sur le moteur local (js/jesus.js).
   ============================================================================ */

(function () {
  "use strict";
  const KB = window.JESUS_KB;
  if (!KB) { console.error("rag.js : JESUS_KB manquant"); return; }
  const CFG = window.JESUS_CONFIG || {};

  /* ---------------- outils NLP de base (identiques à jesus.js) ------------- */
  function normalize(text) {
    return String(text).toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ").trim();
  }
  const STOP = new Set(("le la les un une des du de et ou est sont a au aux en dans sur pour par avec son sa ses il elle je tu nous vous ce cette ces qui que quoi dont the a an of and or is are was were in on for with his her it this that these those what which who how").split(" "));
  function tokens(text) {
    return normalize(text).split(" ").filter(w => w.length > 1 && !STOP.has(w));
  }
  const t = (f, lang) => (f && typeof f === "object" && !Array.isArray(f)) ? (f[lang] || f.fr || "") : f;

  /* ================= 1. CHUNKING — même découpage que jesus_rag.py ========= */
  function buildChunks() {
    const chunks = [];
    const add = (id, entity, fr, en) => chunks.push({ id, entity, fr, en, index: tokens(fr + " " + en) });
    const p = KB.profile;

    add("profil", "about",
      `Profil de Issa Lamkharbech. ${t(p.title, "fr")}. ${t(p.summary, "fr")} Objectif : ${t(p.objective, "fr")} Loisirs : ${(p.hobbies.fr || []).join(", ")}.`,
      `Profile of Issa Lamkharbech. ${t(p.title, "en")}. ${t(p.summary, "en")} Goal: ${t(p.objective, "en")} Hobbies: ${(p.hobbies.en || []).join(", ")}.`);

    add("contact", "contact",
      `Contact d'Issa Lamkharbech : email ${p.contact.email}, téléphone ${p.contact.phone}, localisation ${t(p.contact.location, "fr")}, LinkedIn ${p.contact.linkedin}, GitHub ${p.contact.github}.`,
      `Issa Lamkharbech's contact: email ${p.contact.email}, phone ${p.contact.phone}, location ${t(p.contact.location, "en")}, LinkedIn ${p.contact.linkedin}, GitHub ${p.contact.github}.`);

    add("langues", "languages",
      "Langues parlées par Issa : " + p.languages_spoken.map(l => `${t(l.name, "fr")} (${t(l.level, "fr")})`).join(", ") + ".",
      "Languages spoken by Issa: " + p.languages_spoken.map(l => `${t(l.name, "en")} (${t(l.level, "en")})`).join(", ") + ".");

    add("parcours", "education",
      "Parcours scolaire d'Issa Lamkharbech : " + KB.education.map(e => `${t(e.degree, "fr")} — ${t(e.school, "fr")} (${t(e.period, "fr")})`).join(" ; ") + ".",
      "Educational background of Issa Lamkharbech: " + KB.education.map(e => `${t(e.degree, "en")} — ${t(e.school, "en")} (${t(e.period, "en")})`).join("; ") + ".");

    for (const s of KB.internships) {
      add(`stage_${s.id}`, s.id,
        `STAGE (${t(s.type, "fr")}) : « ${t(s.title, "fr")} » chez ${t(s.company, "fr")}. Période : ${t(s.period, "fr")} — durée : ${t(s.duration, "fr")}. Ce stage est spécifié dans le CV d'Issa. ${t(s.description, "fr")} Technologies : ${s.technologies.join(", ")}. Résultats : ${s.metrics.fr.join(" ; ")}.`,
        `INTERNSHIP (${t(s.type, "en")}): “${t(s.title, "en")}” at ${t(s.company, "en")}. Period: ${t(s.period, "en")} — duration: ${t(s.duration, "en")}. This internship is listed on Issa's CV. ${t(s.description, "en")} Technologies: ${s.technologies.join(", ")}. Results: ${s.metrics.en.join("; ")}.`);
      add(`entreprise_${s.id}`, s.id,
        `À propos de l'entreprise du stage « ${t(s.title, "fr")} » : ${t(s.company_details, "fr")}`,
        `About the company of the internship “${t(s.title, "en")}”: ${t(s.company_details, "en")}`);
    }

    for (const pr of KB.projects) {
      const teamFr = pr.team && pr.team.length ? ` Équipe : ${pr.team.join(", ")}.` : "";
      const supFr = pr.supervisors && pr.supervisors.length ? ` Encadrement : ${pr.supervisors.join(", ")}.` : "";
      const cvFr = pr.in_cv ? "Ce projet est spécifié dans le CV d'Issa." : "Ce projet N'EST PAS spécifié dans le CV d'Issa (il figure dans son dossier de projets).";
      const cvEn = pr.in_cv ? "This project is listed on Issa's CV." : "This project is NOT listed on Issa's CV (it appears in his project folder).";
      add(`projet_${pr.id}`, pr.id,
        `PROJET : « ${t(pr.name, "fr")} » (${t(pr.context, "fr")}). Période : ${t(pr.period, "fr")} — durée : ${t(pr.duration, "fr")}. ${t(pr.team_type, "fr")}.${teamFr}${supFr} ${cvFr} ${t(pr.description, "fr")}`,
        `PROJECT: “${t(pr.name, "en")}” (${t(pr.context, "en")}). Period: ${t(pr.period, "en")} — duration: ${t(pr.duration, "en")}. ${t(pr.team_type, "en")}.${pr.team && pr.team.length ? " Team: " + pr.team.join(", ") + "." : ""}${pr.supervisors && pr.supervisors.length ? " Supervised by: " + pr.supervisors.join(", ") + "." : ""} ${cvEn} ${t(pr.description, "en")}`);
      add(`resultats_${pr.id}`, pr.id,
        `Technologies et résultats du projet « ${t(pr.name, "fr")} » — Technologies : ${pr.technologies.join(", ")}. Résultats et métriques : ${pr.metrics.fr.join(" ; ")}.`,
        `Technologies and results of the project “${t(pr.name, "en")}” — Technologies: ${pr.technologies.join(", ")}. Results and metrics: ${pr.metrics.en.join("; ")}.`);
    }

    const skFr = Object.values(KB.skills).map(c => `${t(c.label, "fr")} : ${c.items.join(", ")}`).join(". ");
    const skEn = Object.values(KB.skills).map(c => `${t(c.label, "en")} : ${c.items.join(", ")}`).join(". ");
    add("competences", "skills",
      `Compétences d'Issa Lamkharbech (telles que listées dans ses CV) : ${skFr}.`,
      `Skills of Issa Lamkharbech (as listed on his CVs): ${skEn}.`);

    add("certifications", "certifications",
      "Licences et certifications d'Issa : " + KB.certifications.map(c => `${c.name} — ${t(c.issuer, "fr")} (${t(c.date, "fr")})`).join(" ; ") + ".",
      "Issa's licenses and certifications: " + KB.certifications.map(c => `${c.name} — ${t(c.issuer, "en")} (${t(c.date, "en")})`).join("; ") + ".");

    add("parascolaire", "extracurricular",
      "Activités parascolaires d'Issa : " + KB.extracurricular.map(x => `${t(x.role, "fr")} | ${t(x.org, "fr")} (${t(x.date, "fr")}) — ${t(x.description, "fr")}`).join(" ; "),
      "Issa's extracurricular activities: " + KB.extracurricular.map(x => `${t(x.role, "en")} | ${t(x.org, "en")} (${t(x.date, "en")}) — ${t(x.description, "en")}`).join("; "));

    add("liste_projets", "projects_list",
      "Liste complète des 5 projets d'Issa : " + KB.projects.map(pr => `« ${t(pr.name, "fr")} » (${t(pr.period, "fr")}, ${t(pr.team_type, "fr")})`).join(" ; ") + ".",
      "Complete list of Issa's 5 projects: " + KB.projects.map(pr => `“${t(pr.name, "en")}” (${t(pr.period, "en")}, ${t(pr.team_type, "en")})`).join("; ") + ".");

    add("liste_stages", "internships_list",
      "Liste des 2 stages d'Issa : " + KB.internships.map(s => `« ${t(s.title, "fr")} » chez ${t(s.company, "fr")} (${t(s.period, "fr")}, ${t(s.duration, "fr")})`).join(" ; ") + ".",
      "List of Issa's 2 internships: " + KB.internships.map(s => `“${t(s.title, "en")}” at ${t(s.company, "en")} (${t(s.period, "en")}, ${t(s.duration, "en")})`).join("; ") + ".");

    return chunks;
  }

  /* ================= 2. INDEXATION — BM25 (Okapi) =========================== */
  class BM25 {
    constructor(docsTokens, k1 = 1.5, b = 0.75) {
      this.k1 = k1; this.b = b;
      this.docs = docsTokens;
      this.N = docsTokens.length;
      this.avgdl = docsTokens.reduce((s, d) => s + d.length, 0) / this.N;
      this.df = new Map();
      this.tf = docsTokens.map(d => {
        const m = new Map();
        for (const w of d) m.set(w, (m.get(w) || 0) + 1);
        for (const w of m.keys()) this.df.set(w, (this.df.get(w) || 0) + 1);
        return m;
      });
    }
    idf(term) {
      const n = this.df.get(term) || 0;
      return Math.log(1 + (this.N - n + 0.5) / (n + 0.5));
    }
    score(queryTokens, i) {
      let s = 0;
      const dl = this.docs[i].length;
      for (const q of queryTokens) {
        const f = this.tf[i].get(q) || 0;
        if (!f) continue;
        s += this.idf(q) * (f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + this.b * dl / this.avgdl));
      }
      return s;
    }
    search(query, topK) {
      const q = tokens(query);
      const scored = this.docs.map((_, i) => [this.score(q, i), i]);
      scored.sort((a, b) => b[0] - a[0]);
      return scored.slice(0, topK);
    }
  }

  const CHUNKS = buildChunks();
  const bm25 = new BM25(CHUNKS.map(c => c.index));

  /* ================= 3. RETRIEVAL hybride (BM25 + entités) ================== */
  function retrieve(query, lang, topK) {
    topK = topK || CFG.topK || 5;
    /* boost d'entité : réutilise le détecteur d'alias du moteur local */
    const entities = (window.Jesus && window.Jesus.findEntities) ? window.Jesus.findEntities(normalize(query)) : [];
    const scored = bm25.search(query, CHUNKS.length)
      .map(([s, i]) => [s + (entities.includes(CHUNKS[i].entity) ? 3.5 : 0), i])
      .sort((a, b) => b[0] - a[0]);
    const picked = scored.slice(0, topK).filter(([s]) => s > 0.3);
    /* sécurité : toujours au moins le chunk profil */
    if (!picked.length) picked.push([0, 0]);
    return picked.map(([, i]) => CHUNKS[i][lang]);
  }

  /* ================= 4. AUGMENTATION — prompt strictement ancré ============= */
  function systemPrompt(lang, contextBlocks) {
    const ctx = contextBlocks.map((c, i) => `[${i + 1}] ${c}`).join("\n\n");
    if (lang === "fr") {
      return `Tu es « Jesus », l'assistant IA personnel et chaleureux du portfolio d'Issa Lamkharbech, élève ingénieur Arts et Métiers spécialisé en IA.

RÈGLES ABSOLUES :
1. Tu réponds UNIQUEMENT à partir du CONTEXTE ci-dessous (extrait du dossier officiel d'Issa : CV, rapports de stages, rapports de projets). N'invente JAMAIS un fait, un chiffre, une date ou un nom qui n'y figure pas.
2. Si l'information demandée n'est pas dans le contexte, dis-le honnêtement et propose une question à laquelle tu peux répondre.
3. Tu ne parles QUE d'Issa Lamkharbech : son profil, ses stages, ses projets, ses compétences, son parcours, ses certifications, ses langues, sa vie associative, son contact. Pour tout autre sujet (actualité, code, culture générale…), décline poliment en rappelant ton rôle.
4. Réponds dans la langue de l'utilisateur (français ou anglais).
5. Style : conversationnel, naturel, précis et concis (réponses courtes sauf si on demande des détails). Utilise quelques emojis avec modération. Quand c'est pertinent, précise s'il s'agit d'un stage (entreprise + durée) ou d'un projet (groupe ou individuel, spécifié au CV ou non, durée).

CONTEXTE :
${ctx}`;
    }
    return `You are “Jesus”, the warm personal AI assistant of Issa Lamkharbech's portfolio. Issa is an Arts et Métiers engineering student specialized in AI.

ABSOLUTE RULES:
1. Answer ONLY from the CONTEXT below (taken from Issa's official folder: CVs, internship reports, project reports). NEVER invent a fact, number, date or name that is not in it.
2. If the requested information is not in the context, say so honestly and suggest a question you can answer.
3. You ONLY talk about Issa Lamkharbech: his profile, internships, projects, skills, education, certifications, languages, extracurricular activities, contact. For any other topic (news, coding help, general knowledge…), politely decline and recall your role.
4. Reply in the user's language (French or English).
5. Style: conversational, natural, precise and concise (short answers unless details are requested). Use a few emojis sparingly. When relevant, specify whether something is an internship (company + duration) or a project (group or individual, listed on the CV or not, duration).

CONTEXT:
${ctx}`;
  }

  /* ================= 5. GÉNÉRATION — LLM distant en streaming =============== */
  const history = [];   /* mémoire de conversation multi-tours */

  function pushHistory(role, content) {
    history.push({ role, content });
    const max = (CFG.maxHistory || 8);
    while (history.length > max) history.shift();
  }

  function llmAvailable() {
    return Boolean((CFG.apiUrl && CFG.apiUrl.trim()) || (CFG.groqApiKey && CFG.groqApiKey.trim()));
  }

  /**
   * Interroge le LLM en streaming.
   * onToken(texte)  : appelé à chaque fragment reçu.
   * Retourne la réponse complète. Lance une exception en cas d'échec
   * (le widget bascule alors sur le moteur local).
   */
  async function ask(question, lang, onToken) {
    const context = retrieve(question, lang);
    const messages = [
      { role: "system", content: systemPrompt(lang, context) },
      ...history,
      { role: "user", content: question }
    ];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CFG.timeoutMs || 12000);

    const direct = !(CFG.apiUrl && CFG.apiUrl.trim());
    const url = direct
      ? "https://api.groq.com/openai/v1/chat/completions"
      : CFG.apiUrl.replace(/\/$/, "") + "/chat";
    const headers = { "Content-Type": "application/json" };
    if (direct) headers["Authorization"] = "Bearer " + CFG.groqApiKey;

    const res = await fetch(url, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: CFG.model || "llama-3.3-70b-versatile",
        messages, temperature: 0.3, max_tokens: 800, stream: true
      })
    });
    if (!res.ok) { clearTimeout(timer); throw new Error("LLM HTTP " + res.status); }

    /* lecture du flux SSE (Server-Sent Events, format OpenAI) */
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let full = "", buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        const s = line.trim();
        if (!s.startsWith("data:")) continue;
        const payload = s.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const delta = JSON.parse(payload).choices?.[0]?.delta?.content;
          if (delta) { full += delta; if (onToken) onToken(delta); }
        } catch (_) { /* fragment incomplet : ignoré */ }
      }
    }
    clearTimeout(timer);
    if (!full.trim()) throw new Error("Réponse vide du LLM");
    pushHistory("user", question);
    pushHistory("assistant", full);
    return full;
  }

  function resetConversation() { history.length = 0; }

  window.JesusRAG = { ask, retrieve, llmAvailable, resetConversation, chunks: CHUNKS };
})();
