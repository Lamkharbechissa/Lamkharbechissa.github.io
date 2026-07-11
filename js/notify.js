/* ============================================================================
   ISSA — Notifications par email (visites + conversations)
   ----------------------------------------------------------------------------
   Prévient Issa par email (via FormSubmit -> sa boîte Gmail) :
     • quand quelqu'un VISITE le site (anti-flood : 1 email max / visiteur / 24 h),
     • quand quelqu'un DISCUTE avec ISSA : la conversation complète lui est
       envoyée (à la fermeture du chat, au départ de la page, ou après un temps
       d'inactivité). Chaque conversation n'est envoyée que si elle a de
       nouveaux messages (pas de doublon).

   Ainsi, TOUTES les conversations s'archivent dans le Gmail d'Issa : il peut
   les consulter à tout moment (recherche « conversation ISSA »).

   Réglages dans config.js : notifyOnVisit, notifyOnChat, notifyEmail.
   Tout passe par FormSubmit (déjà autorisé par la CSP) : aucune clé requise.
   ============================================================================ */
(function () {
  "use strict";
  const CFG = window.JESUS_CONFIG || {};
  const EMAIL = (CFG.notifyEmail || CFG.contactEmail || "").trim();
  const ON_VISIT = CFG.notifyOnVisit !== false;   // défaut : activé
  const ON_CHAT = CFG.notifyOnChat !== false;     // défaut : activé
  if (!EMAIL) return;

  const ENDPOINT = "https://formsubmit.co/ajax/" + encodeURIComponent(EMAIL);
  const VISIT_THROTTLE_MS = 24 * 60 * 60 * 1000;  // 1 notif de visite / 24 h
  const INACTIVITY_MS = 25000;                    // envoi transcript après 25 s d'inactivité

  function lsGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }

  /* Envoi email non bloquant (keepalive pour survivre à la fermeture d'onglet) */
  function sendEmail(subject, message, replyTo) {
    try {
      return fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          name: "Portfolio ISSA",
          email: replyTo || EMAIL,
          _subject: subject,
          _template: "box",
          message: message,
        }),
      }).catch(function () {});
    } catch (_) { return Promise.resolve(); }
  }

  /* -------- 1) NOTIFICATION DE VISITE (throttlée) -------- */
  function notifyVisit() {
    if (!ON_VISIT) return;
    const now = Date.now();
    const last = parseInt(lsGet("issa_last_visit_notify") || "0", 10);
    if (now - last < VISIT_THROTTLE_MS) return;    // déjà notifié récemment
    lsSet("issa_last_visit_notify", String(now));
    const info =
      "🔔 Quelqu'un vient de visiter votre portfolio.\n\n" +
      "Date : " + new Date().toLocaleString("fr-FR") + "\n" +
      "Provenance : " + (document.referrer || "accès direct") + "\n" +
      "Langue navigateur : " + (navigator.language || "?") + "\n" +
      "Page : " + location.href;
    sendEmail("🔔 Nouvelle visite sur votre portfolio", info);
  }

  /* -------- 2) ENVOI DE LA CONVERSATION -------- */
  let flushTimer = null;

  async function buildTranscript() {
    const H = window.ISSAHistory;
    if (!H || !H.currentId) return null;
    let msgs = [];
    try { msgs = await H.messages(H.currentId); } catch (_) { return null; }
    if (!msgs || !msgs.length) return null;
    if (!msgs.some(function (m) { return m.role === "user"; })) return null; // aucune vraie question
    const key = "issa_sent_" + H.currentId;
    const sent = parseInt(lsGet(key) || "0", 10);
    if (msgs.length <= sent) return null;          // rien de nouveau depuis le dernier envoi
    return { key, count: msgs.length, text: msgs.map(function (m) {
      return (m.role === "user" ? "👤 Visiteur" : "🤖 ISSA") + " : " + m.content;
    }).join("\n\n") };
  }

  async function flushConversation() {
    if (!ON_CHAT) return;
    const t = await buildTranscript();
    if (!t) return;
    lsSet(t.key, String(t.count));                 // marque comme envoyé (anti-doublon)
    sendEmail(
      "💬 Nouvelle conversation avec ISSA sur votre portfolio",
      "Un visiteur a discuté avec ISSA. Voici la conversation :\n\n" + t.text +
      "\n\n— " + new Date().toLocaleString("fr-FR")
    );
  }

  function scheduleFlush() {
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flushConversation, INACTIVITY_MS);
  }

  /* Observe les nouveaux messages du chat pour (ré)armer le minuteur d'envoi */
  function watchChat() {
    const box = document.getElementById("jw-messages");
    if (!box) return false;
    new MutationObserver(scheduleFlush).observe(box, { childList: true });
    /* envoi immédiat si le visiteur ferme le chat */
    const closeBtn = document.querySelector(".jw-close");
    if (closeBtn) closeBtn.addEventListener("click", flushConversation);
    return true;
  }

  /* Le widget de chat est injecté par jesus.js : on attend qu'il existe */
  function whenChatReady(tries) {
    if (watchChat()) return;
    if (tries <= 0) return;
    setTimeout(function () { whenChatReady(tries - 1); }, 400);
  }

  /* Envoi de secours quand la page passe en arrière-plan / se ferme */
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") flushConversation();
  });
  window.addEventListener("pagehide", flushConversation);

  /* Démarrage */
  function start() { notifyVisit(); whenChatReady(30); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
