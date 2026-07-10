/* ============================================================================
   SÉCURITÉ FRONT-END — chargé en TOUT PREMIER (avant tout autre script)
   ----------------------------------------------------------------------------
   1. Force le HTTPS : si la page est ouverte en http:// sur le vrai domaine,
      on redirige immédiatement vers https:// (on épargne localhost pour le
      développement). La politique CSP « upgrade-insecure-requests » (dans
      index.html) complète en forçant toutes les sous-ressources en HTTPS.
   2. Anti-clickjacking : si le site est chargé dans une iframe étrangère
      (tentative de « framing » pour piéger le visiteur), on s'en échappe.
      La directive CSP « frame-ancestors 'none' » bloque déjà cela ; ceci est
      une seconde barrière pour les très vieux navigateurs.
   ============================================================================ */
(function () {
  "use strict";

  var host = location.hostname;
  var isLocal = host === "localhost" || host === "127.0.0.1" || host === "";

  /* 1. HTTPS obligatoire en production */
  if (!isLocal && location.protocol === "http:") {
    location.replace(
      "https://" + location.host + location.pathname + location.search + location.hash
    );
    return;
  }

  /* 2. Anti-clickjacking : ne jamais s'exécuter dans l'iframe d'un autre site */
  try {
    if (window.top !== window.self && !isLocal) {
      window.top.location = window.self.location.href;
    }
  } catch (e) {
    /* accès cross-origin bloqué = on est bien dans une iframe étrangère */
    document.documentElement.style.display = "none";
  }
})();
