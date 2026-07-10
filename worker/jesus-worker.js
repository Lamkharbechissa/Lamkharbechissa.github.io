/* ============================================================================
   JESUS — Proxy LLM (Cloudflare Worker, niveau gratuit : 100 000 requêtes/jour)
   ----------------------------------------------------------------------------
   Rôle : le site (GitHub Pages) ne peut pas contenir la clé API Groq sans
   qu'elle soit visible par tous. Ce worker la garde SECRÈTE côté serveur :

        navigateur ──POST /chat──▶ ce worker ──▶ api.groq.com (clé secrète)
                   ◀── streaming SSE ◀──────────┘

   Déploiement (5 minutes, voir GUIDE_JESUS_LLM.md) :
     1. https://dash.cloudflare.com → Workers & Pages → Create Worker
     2. Collez ce fichier entier dans l'éditeur → Deploy
     3. Settings → Variables → Secrets → ajouter GROQ_API_KEY = votre clé Groq
     4. Copiez l'URL du worker dans js/config.js (champ apiUrl)
   ============================================================================ */

const CORS = {
  "Access-Control-Allow-Origin": "*",           /* ou "https://lamkharbechissa.github.io" pour restreindre */
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/* garde-fous anti-abus : messages bornés, modèle imposé côté serveur */
const MAX_MESSAGES = 24;
const MAX_CHARS = 24000;

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }
    const url = new URL(request.url);
    if (request.method !== "POST" || !url.pathname.endsWith("/chat")) {
      return new Response(JSON.stringify({ error: "POST /chat attendu" }),
        { status: 404, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    let body;
    try { body = await request.json(); }
    catch { return new Response(JSON.stringify({ error: "JSON invalide" }),
      { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }); }

    const messages = Array.isArray(body.messages) ? body.messages.slice(-MAX_MESSAGES) : null;
    if (!messages || !messages.length) {
      return new Response(JSON.stringify({ error: "messages manquants" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }
    const totalChars = messages.reduce((s, m) => s + String(m.content || "").length, 0);
    if (totalChars > MAX_CHARS) {
      return new Response(JSON.stringify({ error: "requête trop longue" }),
        { status: 413, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.MODEL || "llama-3.3-70b-versatile",
        messages,
        /* réponses vivantes et variées, tout en restant factuel (RAG) */
        temperature: 0.75,
        top_p: 0.95,
        presence_penalty: 0.5,
        frequency_penalty: 0.4,
        max_tokens: 900,
        stream: true,
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      return new Response(JSON.stringify({ error: "Groq " + upstream.status, detail: detail.slice(0, 300) }),
        { status: 502, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    /* on relaie le flux SSE tel quel vers le navigateur */
    return new Response(upstream.body, {
      headers: { ...CORS, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  },
};
