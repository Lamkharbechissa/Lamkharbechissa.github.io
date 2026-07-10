/* ============================================================================
   ISSA — Proxy LLM sécurisé (Cloudflare Worker, gratuit : 100 000 req/jour)
   ----------------------------------------------------------------------------
   Rôle : le site (GitHub Pages) ne peut pas contenir la clé API Groq sans
   qu'elle soit visible par tous. Ce worker la garde SECRÈTE côté serveur.

        navigateur ──POST /chat──▶ ce worker ──▶ api.groq.com (clé secrète)
                   ◀── streaming SSE ◀──────────┘

   SÉCURITÉ intégrée :
     • Allowlist d'origines (CORS strict) → seul VOTRE site peut l'utiliser.
     • Rejet des requêtes venant d'un autre domaine (anti-vol de quota).
     • Bornage des messages (nombre + taille) → anti-abus / anti-DoS léger.
     • Modèle, température et max_tokens imposés côté serveur (non modifiables
       par le client) → personne ne peut détourner le worker.
     • En-têtes de sécurité (nosniff, no-referrer) sur toutes les réponses.
     • Rate limiting fort : à activer dans le dashboard Cloudflare (voir
       SECURITY.md) — Security → WAF → Rate limiting rules (gratuit).

   Déploiement (voir GUIDE_JESUS_LLM.md) :
     1. dash.cloudflare.com → Workers & Pages → Create Worker → coller ce fichier
     2. Settings → Variables → Secret : GROQ_API_KEY = votre clé Groq
     3. Copier l'URL du worker dans js/config.js (champ apiUrl)
   ============================================================================ */

/* ⚠️ Mettez ICI le(s) domaine(s) autorisé(s) à utiliser le worker.
   Ajoutez votre domaine de production ; localhost sert au test local. */
const ALLOWED_ORIGINS = [
  "https://lamkharbechissa.github.io",
  "http://localhost:8765",
  "http://localhost:8766",
  "http://127.0.0.1:8765",
  "http://127.0.0.1:8766",
];

const MAX_MESSAGES = 24;      // nombre max de messages par requête
const MAX_CHARS = 24000;      // taille totale max des messages (caractères)

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
    /* en-têtes de sécurité appliqués à toutes les réponses du worker */
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
  };
}

function json(status, obj, origin) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin);

    /* pré-vol CORS */
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    /* 🔒 Allowlist : refuse toute origine non autorisée (autre site, bot…) */
    if (!ALLOWED_ORIGINS.includes(origin)) {
      return json(403, { error: "Origine non autorisée" }, origin);
    }

    const url = new URL(request.url);
    if (request.method !== "POST" || !url.pathname.endsWith("/chat")) {
      return json(404, { error: "POST /chat attendu" }, origin);
    }

    /* corps JSON valide et borné */
    let body;
    try { body = await request.json(); }
    catch { return json(400, { error: "JSON invalide" }, origin); }

    let messages = Array.isArray(body.messages) ? body.messages.slice(-MAX_MESSAGES) : null;
    if (!messages || !messages.length) {
      return json(400, { error: "messages manquants" }, origin);
    }
    /* ne garder que les champs attendus (role/content) — on ignore tout le reste
       que le client pourrait tenter d'injecter (model, api_key, etc.) */
    messages = messages.map(m => ({
      role: String(m.role || "user").slice(0, 20),
      content: String(m.content || "").slice(0, MAX_CHARS),
    }));
    const totalChars = messages.reduce((s, m) => s + m.content.length, 0);
    if (totalChars > MAX_CHARS) {
      return json(413, { error: "requête trop longue" }, origin);
    }

    /* appel Groq — TOUS les paramètres sensibles sont imposés ici, côté serveur */
    let upstream;
    try {
      upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: env.MODEL || "llama-3.3-70b-versatile",
          messages,
          temperature: 0.75,
          top_p: 0.95,
          presence_penalty: 0.5,
          frequency_penalty: 0.4,
          max_tokens: 900,
          stream: true,
        }),
      });
    } catch (_) {
      return json(502, { error: "LLM injoignable" }, origin);
    }

    if (!upstream.ok) {
      /* on ne renvoie PAS le détail de l'erreur upstream au client (fuite d'info) */
      return json(502, { error: "Erreur du service LLM" }, origin);
    }

    /* relais du flux SSE vers le navigateur */
    return new Response(upstream.body, {
      headers: { ...cors, "Content-Type": "text/event-stream" },
    });
  },
};
