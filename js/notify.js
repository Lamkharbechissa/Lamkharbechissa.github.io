/* ============================================================================
   ISSA — Notifications par email (résumé de visite + conversations)
   ----------------------------------------------------------------------------
   Objectif : vous prévenir dans votre Gmail (via FormSubmit) SANS noyer votre
   boîte. Au lieu d'un email à chaque chargement de page, on envoie UN SEUL
   email « résumé » par visiteur (au plus 1 / 24 h), au moment où il quitte le
   site, contenant :
     • ce qu'il a fait (sections consultées, durée, provenance, langue),
     • et SA CONVERSATION avec ISSA s'il a discuté.

   Si le visiteur relance une nouvelle conversation plus tard dans les 24 h
   (après l'envoi du résumé), cette conversation est quand même envoyée (sans
   doublon). Ainsi TOUTES les conversations arrivent dans votre Gmail et vous
   les consultez à tout moment, sans exception.

   Réglages : config.js -> notifyOnVisit, notifyOnChat, notifyEmail.
   ============================================================================ */
(function () {
  "use strict";
  const CFG = window.JESUS_CONFIG || {};
  const EMAIL = (CFG.notifyEmail || CFG.contactEmail || "").trim();
  const ON_VISIT = CFG.notifyOnVisit !== false;
  const ON_CHAT = CFG.notifyOnChat !== false;
  if (!EMAIL || (!ON_VISIT && !ON_CHAT)) return;

  const ENDPOINT = "https://formsubmit.co/ajax/" + encodeURIComponent(EMAIL);
  const VISIT_THROTTLE_MS = 24 * 60 * 60 * 1000;   // 1 résumé de visite / 24 h
  const INACTIVITY_MS = 30000;                     // envoi après 30 s d'inactivité

  const startedAt = Date.now();
  const sectionsSeen = new Set();
  let chatOpened = false;
  let sent = false;                                // résumé de visite déjà envoyé (cette session)

  function lsGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }

  function sendEmail(subject, message) {
    try {
      return fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        keepalive: true,
        body: JSON.stringify({ name: "Portfolio ISSA", email: EMAIL, _subject: subject, _template: "box", message }),
      }).catch(function () {});
    } catch (_) { return Promise.resolve(); }
  }

  /* -------- Transcript de la conversation en cours (dé-dupliqué) -------- */
  async function getNewTranscript() {
    const H = window.ISSAHistory;
    if (!ON_CHAT || !H || !H.currentId) return null;
    let msgs = [];
    try { msgs = await H.messages(H.currentId); } catch (_) { return null; }
    if (!msgs || !msgs.some(function (m) { return m.role === "user"; })) return null;
    const key = "issa_sent_" + H.currentId;
    const already = parseInt(lsGet(key) || "0", 10);
    if (msgs.length <= already) return null;         // rien de nouveau
    return {
      key: key, count: msgs.length,
      text: msgs.map(function (m) { return (m.role === "user" ? "👤 Visiteur" : "🤖 ISSA") + " : " + m.content; }).join("\n\n"),
    };
  }

  function durationStr() {
    const s = Math.round((Date.now() - startedAt) / 1000);
    return s < 60 ? s + " s" : Math.floor(s / 60) + " min " + (s % 60) + " s";
  }

  /* -------- Envoi du résumé complet (visite + conversation) -------- */
  async function sendSummary() {
    const transcript = await getNewTranscript();

    /* Cas 1 : le résumé de visite du jour n'a pas encore été envoyé */
    const last = parseInt(lsGet("issa_last_visit_notify") || "0", 10);
    const visitDue = ON_VISIT && (Date.now() - last >= VISIT_THROTTLE_MS) && !sent;

    if (visitDue) {
      sent = true;
      lsSet("issa_last_visit_notify", String(Date.now()));
      let body =
        "🔔 Un visiteur a consulté votre portfolio.\n\n" +
        "🕒 Date : " + new Date().toLocaleString("fr-FR") + "\n" +
        "⏱️ Durée de visite : " + durationStr() + "\n" +
        "🌐 Provenance : " + (document.referrer || "accès direct") + "\n" +
        "🗣️ Langue navigateur : " + (navigator.language || "?") + "\n" +
        "📄 Sections vues : " + (sectionsSeen.size ? Array.from(sectionsSeen).join(", ") : "—") + "\n" +
        "💬 A discuté avec ISSA : " + (chatOpened ? "oui" : "non");
      if (transcript) {
        lsSet(transcript.key, String(transcript.count));   // marque la conv comme envoyée
        body += "\n\n———  CONVERSATION AVEC ISSA  ———\n\n" + transcript.text;
      }
      sendEmail(
        transcript ? "💬 Visite + conversation ISSA sur votre portfolio" : "🔔 Nouvelle visite sur votre portfolio",
        body
      );
      return;
    }

    /* Cas 2 : le résumé du jour est déjà parti, mais il y a une NOUVELLE
       conversation -> on l'envoie quand même (aucune conversation perdue) */
    if (transcript) {
      lsSet(transcript.key, String(transcript.count));
      sendEmail(
        "💬 Nouvelle conversation avec ISSA sur votre portfolio",
        "Un visiteur a (re)discuté avec ISSA :\n\n" + transcript.text + "\n\n— " + new Date().toLocaleString("fr-FR")
      );
    }
  }

  /* -------- Déclencheurs -------- */
  let idleTimer = null;
  function scheduleIdle() { clearTimeout(idleTimer); idleTimer = setTimeout(sendSummary, INACTIVITY_MS); }

  function trackSections() {
    const secs = document.querySelectorAll("section[id]");
    if (!secs.length || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting && e.target.id) sectionsSeen.add(e.target.id); });
    }, { threshold: 0.4 });
    secs.forEach(function (s) { io.observe(s); });
  }

  function watchChat() {
    const box = document.getElementById("jw-messages");
    if (!box) return false;
    new MutationObserver(function () { chatOpened = true; scheduleIdle(); }).observe(box, { childList: true });
    const launcher = document.getElementById("jesus-launcher");
    if (launcher) launcher.addEventListener("click", function () { chatOpened = true; });
    const closeBtn = document.querySelector(".jw-close");
    if (closeBtn) closeBtn.addEventListener("click", sendSummary);
    return true;
  }
  function whenChatReady(tries) {
    if (watchChat()) return;
    if (tries <= 0) return;
    setTimeout(function () { whenChatReady(tries - 1); }, 400);
  }

  /* départ / mise en arrière-plan = moment idéal pour envoyer le résumé */
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") sendSummary(); });
  window.addEventListener("pagehide", sendSummary);
  /* filet de sécurité : si le visiteur reste longtemps sans rien faire */
  scheduleIdle();

  function start() { trackSections(); whenChatReady(30); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
