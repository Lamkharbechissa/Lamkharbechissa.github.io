/* ============================================================================
   ISSA — Notifications par email (résumé de visite + conversations)
   ----------------------------------------------------------------------------
   Objectif : vous prévenir dans votre Gmail (via FormSubmit) SANS noyer votre
   boîte. Au lieu d'un email à chaque chargement de page, on envoie UN SEUL
   email « résumé » par visiteur (au plus 1 / 24 h, sauf robot certain), au
   moment où il quitte le site (ou après 30 s de VRAIE inactivité, page
   affichée), contenant :
     • un VERDICT « 🙂 Humain probable / 🤖 Robot probable / ❓ Indéterminé »
       avec un indice humain sur 100 et les indices qui l'expliquent,
     • ce qu'il a fait (sections consultées, durée, provenance, langue,
       navigateur, type d'appareil),
     • et SA CONVERSATION avec ISSA s'il a discuté.

   Le verdict repose sur des signaux PASSIFS et anonymes (mouvements de souris,
   défilement, toucher, nombre de frappes — jamais les touches —, marqueurs
   d'automatisation du navigateur). Rien n'est bloqué, aucun défi n'est imposé
   au visiteur : c'est un indice, pas une preuve (un robot déterminé peut imiter
   un humain).

   Seuls les robots qui EXÉCUTENT JavaScript peuvent être signalés (rendu
   Googlebot / bingbot, Google-InspectionTool, Lighthouse, navigateurs
   automatisés). Les aperçus de liens (WhatsApp, LinkedIn, Slack…) et la
   plupart des robots d'IA / SEO ne lisent que le HTML : ce script ne s'exécute
   pas chez eux, ils n'apparaissent jamais dans ces emails. Les robots
   certains sont signalés dès le chargement du script (ils ferment souvent la
   page sans événement de départ), avec un second essai vers ~3 s.

   Si le visiteur relance une nouvelle conversation plus tard dans les 24 h
   (après l'envoi du résumé), cette conversation est quand même envoyée (sans
   doublon). Ainsi TOUTES les conversations arrivent dans votre Gmail.

   Tests en local (localhost, 127.0.0.1, adresses du réseau local 192.168.x.x /
   10.x.x.x, nom de PC sans point, fichier…) : AUCUN email n'est envoyé, sauf
   si notifyOnLocalhost = true. Aperçu sans envoi, dans la console :
     ISSAVisit.verdict()   → verdict courant
     ISSAVisit.preview()   → { subject, body } de l'email qui partirait

   Réglages : config.js -> notifyOnVisit, notifyOnChat, notifyBots,
   notifyOnLocalhost, notifyHosts, notifyEmail.
   ============================================================================ */
(function () {
  "use strict";
  const CFG = window.JESUS_CONFIG || {};
  const EMAIL = String(CFG.notifyEmail || CFG.contactEmail || "").trim();
  const ON_VISIT = CFG.notifyOnVisit !== false;
  const ON_CHAT = CFG.notifyOnChat !== false;
  const NOTIFY_BOTS = CFG.notifyBots !== false;
  if (!EMAIL || (!ON_VISIT && !ON_CHAT)) return;

  const ENDPOINT = "https://formsubmit.co/ajax/" + encodeURIComponent(EMAIL);
  const VISIT_THROTTLE_MS = 24 * 60 * 60 * 1000;   // 1 résumé / 24 h (sauf robot certain)
  const THROTTLE_KEY = "issa_last_visit_notify";
  const BOT_THROTTLE_MS = 6 * 60 * 60 * 1000;      // même robot (même profil) : 1 email / 6 h
  const BOT_KEY_PREFIX = "issa_last_bot_notify_";
  const INACTIVITY_MS = 30000;                     // envoi après 30 s SANS activité (page affichée)
  const EARLY_BOT_MS = 3000;                       // second essai robots certains : ~3 s
  const SHORT_VISIT_MS = 8000;                     // < 8 s visibles sans interaction = suspect
  const HISTORY_TIMEOUT_MS = 3000;                 // lecture de l'historique bornée
  const CAP = 400;                                 // taille max des ensembles mémorisés

  /* -------- 1. Garde-fou : pas d'email pendant les tests locaux -------- */
  const HOST = (function () {
    try { return String(location.hostname || "").toLowerCase().replace(/^\[|\]$/g, ""); } catch (_) { return ""; }
  })();
  const PROD_HOSTS = Array.isArray(CFG.notifyHosts) ? CFG.notifyHosts.map(function (h) { return String(h).toLowerCase(); }) : [];
  const IS_LOCAL = (function () {
    try {
      if (PROD_HOSTS.indexOf(HOST) !== -1) return false;           // hôte de production déclaré
      if (location.protocol === "file:") return true;
      const h = HOST;
      return h === "" || h === "localhost" || h === "0.0.0.0" || h === "::1" || h === "::" ||
        h.indexOf(".") === -1 && h.indexOf(":") === -1 ||          // nom de PC sans point (DESKTOP-XXXX)
        /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^169\.254\./.test(h) ||
        /^(fe80|fc|fd)[0-9a-f]*:/.test(h) ||                       // IPv6 locale / privée
        /\.(local|localhost|lan|home|internal|test)$/.test(h);
    } catch (_) { return true; }
  })();
  const SEND_ALLOWED = !IS_LOCAL || CFG.notifyOnLocalhost === true;
  if (!SEND_ALLOWED) {
    try { console.info("[ISSA] Test local : aucun email de notification n'est envoyé (notifyOnLocalhost = false). Aperçu : ISSAVisit.preview()"); } catch (_) {}
  }

  /* -------- horloge : début de la NAVIGATION (pas l'exécution du script) -------- */
  const scriptPerfT0 = (function () { try { return performance.now(); } catch (_) { return 0; } })();
  const scriptStartedAt = Date.now();
  let startedAt = (function () {
    try {
      const nav = (performance.getEntriesByType && performance.getEntriesByType("navigation")[0]) || {};
      const origin = performance.timeOrigin || (Date.now() - performance.now());
      const t = Math.round(origin + (nav.activationStart || 0));
      return (t > 0 && t <= scriptStartedAt) ? t : scriptStartedAt;
    } catch (_) { return scriptStartedAt; }
  })();
  const sectionsSeen = new Set();
  let chatOpened = false;
  let sent = false;                                // résumé de visite déjà envoyé (cette session)

  function lsGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }

  function sendEmail(subject, message) {
    if (!SEND_ALLOWED) return Promise.resolve();
    try {
      return fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        keepalive: true,
        body: JSON.stringify({ name: "Portfolio ISSA", email: EMAIL, _subject: subject, _template: "box", message }),
      }).catch(function () {});
    } catch (_) { return Promise.resolve(); }
  }

  /* ======================================================================
     2. Collecte PASSIVE des signaux (jamais bloquante, jamais preventDefault)
     ====================================================================== */
  const UA = String((navigator && navigator.userAgent) || "");

  const S = {
    moves: 0, posSet: new Set(), dirChanges: 0,   // souris
    ax: null, ay: null, vx: 0, vy: 0,              // point d'ancrage + dernier vecteur
    segs: 0, linearSegs: 0, mouseT0: 0, mouseT1: 0, // segments ≥ 6 px, segments identiques (CDP)
    clicks: 0, touches: 0, wheels: 0,
    scrollSet: new Set(),                          // positions de défilement (toutes)
    scrollInputSet: new Set(),                     // positions dues à molette / toucher / clavier
    scrollBrowseSet: new Set(),                    // positions ≥ 1 s après l'affichage
    earlyScroll: false, earlyInput: 0,             // actions faites AVANT l'exécution du script
    keys: 0, fields: 0, focusMoves: 0, chatUsed: false,
    untrusted: 0,                                  // événements simulés (isTrusted === false)
    firstInteractionAt: 0,
    lastPointerAt: 0, lastPointerTarget: null, lastKeyAt: 0, lastScrollInputAt: 0,
    zeroWindow: false, zeroScreen: false,
  };
  let lastActivity = startedAt;

  function addCapped(set, v) { if (set.size < CAP) set.add(v); }

  /* --- visibilité : un onglet ouvert en arrière-plan n'est pas « inactif » --- */
  function isVisibleNow() {
    try { return document.visibilityState === "visible" && !document.prerendering; } catch (_) { return false; }
  }
  const wasPrerendering = (function () { try { return !!document.prerendering; } catch (_) { return false; } })();
  const loadedHidden = !isVisibleNow();
  let visibleMs = 0;
  let visibleSince = loadedHidden ? 0 : startedAt;
  let everVisible = !loadedHidden;
  let firstVisibleAt = loadedHidden ? 0 : startedAt;

  function coarsePointer() {
    try { return !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches); } catch (_) { return false; }
  }
  function measureWindow() {
    if (!isVisibleNow()) return;                   // mesuré seulement quand la page est affichée
    try { if (window.outerWidth === 0 || window.outerHeight === 0) S.zeroWindow = true; } catch (_) {}
    try { if (screen && (screen.width === 0 || screen.height === 0)) S.zeroScreen = true; } catch (_) {}
  }
  function updateVisibility() {
    const now = Date.now();
    if (isVisibleNow()) {
      if (!visibleSince) {
        visibleSince = now;
        lastActivity = now;                        // l'inactivité ne compte qu'à partir de l'affichage
      }
      if (!everVisible) {
        everVisible = true; firstVisibleAt = now;
        if (wasPrerendering && !sent) startedAt = now;   // pré-rendu activé : la visite commence ici
        measureWindow();
      }
    } else if (visibleSince) {
      visibleMs += now - visibleSince;
      visibleSince = 0;
    }
  }
  function visibleTime() { return visibleMs + (visibleSince ? Date.now() - visibleSince : 0); }

  function markInteraction() {
    const now = Date.now();
    if (!S.firstInteractionAt) S.firstInteractionAt = now;
    lastActivity = now;
  }

  /* --- gestionnaires d'événements (tous passifs, protégés par try/catch) --- */
  function onMouseMove(e) {
    if (!e.isTrusted) { S.untrusted++; return; }
    S.moves++;
    const ts = e.timeStamp || 0;
    if (!S.mouseT0) S.mouseT0 = ts || 1;
    S.mouseT1 = ts;
    const x = Math.round(e.clientX), y = Math.round(e.clientY);
    addCapped(S.posSet, x + "," + y);
    if (S.ax === null) { S.ax = x; S.ay = y; }
    else {
      const dx = x - S.ax, dy = y - S.ay;
      if (Math.abs(dx) + Math.abs(dy) >= 6) {      // segments ≥ 6 px : ignore l'arrondi au pixel
        S.segs++;
        if (S.vx || S.vy) {
          const norm = Math.hypot(dx, dy) * Math.hypot(S.vx, S.vy);
          if (norm > 0 && (dx * S.vx + dy * S.vy) / norm < 0.94) S.dirChanges++;   // virage > ~20°
          /* déplacement identique au précédent : interpolation de programme (CDP), pas une main */
          if (Math.abs(dx - S.vx) <= 1 && Math.abs(dy - S.vy) <= 1) S.linearSegs++;
        }
        S.vx = dx; S.vy = dy; S.ax = x; S.ay = y;
      }
    }
    if (S.posSet.size >= 2) markInteraction();
  }
  function onPointerDown(e) {
    if (!e.isTrusted) { S.untrusted++; return; }
    S.lastPointerAt = Date.now(); S.lastPointerTarget = e.target || null;
    if (e.pointerType === "touch") S.touches++;    // un geste tactile n'est pas un clic de souris
    else S.clicks++;                               // souris, stylet (ou type inconnu)
    markInteraction();
  }
  function onClick(e) {
    if (!e.isTrusted) { S.untrusted++; return; }
    const t = e.target;
    if (t && t.closest && t.closest(".jw-chip")) S.chatUsed = true;   // suggestion du chat
    markInteraction();
  }
  function onTouch(e) {
    if (!e.isTrusted) { S.untrusted++; return; }
    S.touches++;
    if (e.type === "touchmove") S.lastScrollInputAt = Date.now();
    S.lastPointerAt = Date.now(); S.lastPointerTarget = e.target || null;
    markInteraction();
  }
  function onWheel(e) {
    if (!e.isTrusted) { S.untrusted++; return; }
    S.wheels++;
    S.lastScrollInputAt = Date.now();
    markInteraction();
  }
  function onScroll(e) {
    if (!e.isTrusted) { S.untrusted++; return; }
    const now = Date.now();
    const y = Math.round(window.scrollY || window.pageYOffset || 0);
    addCapped(S.scrollSet, y);
    /* seul un défilement provoqué par molette / toucher / clavier compte comme action :
       window.scrollTo, l'ancre d'un lien ou la restauration ne comptent pas */
    if (S.lastScrollInputAt && now - S.lastScrollInputAt <= 1000) addCapped(S.scrollInputSet, y);
    /* lecture au lecteur d'écran / clavier consommé : défilement ≥ 1 s après l'affichage */
    if (firstVisibleAt && isVisibleNow() && now - firstVisibleAt >= 1000) {
      addCapped(S.scrollBrowseSet, y);
      lastActivity = now;                          // la personne lit encore : pas « inactive »
    }
  }
  function onKey(e) {
    if (!e.isTrusted) { S.untrusted++; return; }
    S.lastKeyAt = Date.now();
    S.lastScrollInputAt = S.lastKeyAt;             // flèches, Espace, Page↓ font défiler
    if (e.repeat) { lastActivity = S.lastKeyAt; return; }   // touche maintenue : comptée une fois
    S.keys++;                                      // on compte, on ne lit JAMAIS la touche
    markInteraction();
  }
  function onFocusIn(e) {
    const t = e.target;
    if (!t || !t.matches || !t.matches("a[href], button, summary, [tabindex], input, textarea, select")) return;
    if (!e.isTrusted) { S.untrusted++; return; }
    const now = Date.now();
    const isField = t.matches("input, textarea, select");
    const byPointer = now - S.lastPointerAt <= 500 && S.lastPointerTarget &&
      (S.lastPointerTarget === t || (t.contains && t.contains(S.lastPointerTarget)));
    const byKey = now - S.lastKeyAt <= 500;
    if (isField && (byPointer || byKey)) S.fields++;   // le visiteur a lui-même choisi le champ
    else if (now - S.lastPointerAt <= 1000) return;    // focus dû à un clic (déjà compté) ou au site
    else S.focusMoves++;                           // navigation au clavier / lecteur d'écran
    markInteraction();
  }
  function onSubmit(e) {
    const t = e.target;
    if (!e.isTrusted || !t || t.id !== "jw-form") return;
    S.chatUsed = true;                             // message envoyé à ISSA
    markInteraction();
  }

  const LISTEN_OPT = { passive: true, capture: true };
  function listen(target, type, fn) {
    try { target.addEventListener(type, function (e) { try { fn(e); } catch (_) {} }, LISTEN_OPT); } catch (_) {}
  }
  listen(window, "mousemove", onMouseMove);
  listen(window, "pointerdown", onPointerDown);
  listen(window, "click", onClick);
  listen(window, "touchstart", onTouch);
  listen(window, "touchmove", onTouch);
  listen(window, "wheel", onWheel);
  listen(window, "scroll", onScroll);
  listen(window, "keydown", onKey);
  listen(document, "focusin", onFocusIn);
  listen(document, "submit", onSubmit);
  listen(document, "prerenderingchange", updateVisibility);
  measureWindow();

  /* --- actions faites PENDANT le chargement, avant que ce script ne tourne --- */
  try {
    new PerformanceObserver(function (list) {
      try {
        list.getEntries().forEach(function (en) {
          if (en.startTime >= scriptPerfT0) return;  // déjà vu par les écouteurs
          S.earlyInput++;
          if (!S.firstInteractionAt) S.firstInteractionAt = Math.round((performance.timeOrigin || startedAt) + en.startTime) || Date.now();
        });
      } catch (_) {}
    }).observe({ type: "first-input", buffered: true });
  } catch (_) {}
  try {
    const nav = (performance.getEntriesByType && performance.getEntriesByType("navigation")[0]) || {};
    if (nav.type === "navigate" && !location.hash && (window.scrollY || window.pageYOffset || 0) > 0) {
      S.earlyScroll = true;                        // a défilé avant la fin du chargement
      if (!S.firstInteractionAt) S.firstInteractionAt = Date.now();
    }
  } catch (_) {}

  /* ======================================================================
     Marqueurs d'automatisation / robots connus (agent utilisateur)
     ====================================================================== */
  const SEARCH = "moteur de recherche", PREVIEW = "aperçu de lien", SEO = "outil SEO", AI = "robot d'IA";
  const KNOWN_BOTS = [                             // ordre important (Telegram se dit « like TwitterBot »)
    ["TelegramBot", PREVIEW, /\bTelegramBot\b/i], ["Slackbot", PREVIEW, /\bSlackbot\b/i],
    ["WhatsApp", PREVIEW, /^WhatsApp\//i],         // le vrai robot n'envoie PAS « Mozilla/ »
    ["Discordbot", PREVIEW], ["facebookexternalhit", PREVIEW], ["LinkedInBot", PREVIEW], ["Twitterbot", PREVIEW],
    ["GPTBot", AI], ["OAI-SearchBot", AI], ["ChatGPT-User", AI], ["ClaudeBot", AI],
    ["PerplexityBot", AI], ["CCBot", AI], ["Bytespider", AI], ["Amazonbot", AI],
    ["AhrefsBot", SEO], ["SemrushBot", SEO], ["MJ12bot", SEO], ["DotBot", SEO],
    ["Applebot", SEARCH], ["bingbot", SEARCH], ["DuckDuckBot", SEARCH], ["YandexBot", SEARCH],
    ["Baiduspider", SEARCH], ["PetalBot", SEARCH], ["Google-InspectionTool", SEARCH], ["Googlebot", SEARCH],
  ];
  const AUTOMATION_RE = /(HeadlessChrome|PhantomJS|Puppeteer|Playwright|Selenium|Lighthouse)/i;
  const GENERIC_BOT_RE = /\b([a-z0-9_-]*bot|crawler|spider|crawl|slurp|preview|fetch(?:er)?)\b/i;

  function knownBot() {
    const low = UA.toLowerCase();
    for (let i = 0; i < KNOWN_BOTS.length; i++) {
      const b = KNOWN_BOTS[i];
      const hit = b[2] ? b[2].test(UA) : low.indexOf(b[0].toLowerCase()) !== -1;
      if (hit) return { name: b[0], type: b[1] };
    }
    return null;
  }

  function isIPadDesktop() {
    try { return /Macintosh/.test(UA) && navigator.maxTouchPoints > 1; } catch (_) { return false; }
  }
  function isDesktopUATablet() {                   // Android « site pour ordinateur », Samsung DeX…
    try {
      return navigator.maxTouchPoints > 1 && coarsePointer() && /X11; Linux|Macintosh/.test(UA) && !/CrOS/.test(UA);
    } catch (_) { return false; }
  }
  function deviceType() {
    if (/iPad|Tablet|PlayBook|Silk/i.test(UA) || (/Android/i.test(UA) && !/Mobile/i.test(UA)) || isIPadDesktop() || isDesktopUATablet()) return "tablette";
    if (/Mobi|iPhone|iPod|Android|Windows Phone/i.test(UA)) return "mobile";
    return "ordinateur";
  }

  /* globales laissées par les outils d'automatisation (ChromeDriver, PhantomJS…) */
  function automationGlobal() {
    const w = window;
    try { if (Object.keys(w).some(function (k) { return /^\$?cdc_/.test(k); })) return "ChromeDriver"; } catch (_) {}
    try { if (Object.keys(document).some(function (k) { return /^\$?cdc_/.test(k); })) return "ChromeDriver"; } catch (_) {}
    try { if (w.domAutomation || w.domAutomationController) return "domAutomation"; } catch (_) {}
    try { if (w.callPhantom || w._phantom) return "PhantomJS"; } catch (_) {}
    try { if (w.__nightmare) return "Nightmare"; } catch (_) {}
    try { if (w.__playwright__binding__ || w.__pwInitScripts) return "Playwright"; } catch (_) {}
    try { if (document.documentElement && document.documentElement.hasAttribute("webdriver")) return "Selenium"; } catch (_) {}
    return null;
  }

  /* strong = marqueurs forts (robot quasi certain) ; weak = indices mineurs ;
     generic = l'agent utilisateur contient un mot de robot générique.
     withWindow = false : uniquement les marqueurs fixes dès le chargement. */
  function markers(withWindow) {
    const strong = [], weak = [];
    let generic = null;
    const mobile = deviceType() !== "ordinateur";
    try { if (navigator.webdriver === true) strong.push("navigateur piloté par un programme (webdriver)"); } catch (_) {}
    const auto = UA.match(AUTOMATION_RE);
    if (auto) {
      const name = auto[1];
      if (/headless|phantom/i.test(name)) strong.push("navigateur sans interface (" + name + ")");
      else if (/lighthouse/i.test(name)) strong.push("outil d'audit automatique (Lighthouse)");
      else strong.push("outil d'automatisation (" + name + ")");
    }
    const uad = (function () { try { return navigator.userAgentData || null; } catch (_) { return null; } })();
    const brands = (function () { try { return (uad && uad.brands) || []; } catch (_) { return []; } })();
    try {
      if (brands.some(function (b) { return /Headless/i.test(b.brand); }) && !auto) strong.push("navigateur sans interface (HeadlessChrome)");
    } catch (_) {}
    const ag = automationGlobal();
    if (ag) strong.push("outil d'automatisation (" + ag + ")");
    const gen = UA.match(GENERIC_BOT_RE);
    if (gen && !/cubot/i.test(gen[1])) generic = "s'annonce comme robot (« " + gen[1] + " »)";
    if (withWindow !== false) {
      /* indice faible seulement : certaines vues intégrées (applis, webviews) rapportent 0 pour de vrais visiteurs */
      if (S.zeroWindow) weak.push("fenêtre de taille nulle");
      if (S.zeroScreen) weak.push("écran de taille nulle");
    }
    try { if (!navigator.languages || navigator.languages.length === 0) weak.push("aucune langue déclarée par le navigateur"); } catch (_) {}
    const cm = UA.match(/Chrome\/(\d+)/);
    const chromeDesktop = !!cm && !/HeadlessChrome/.test(UA) && !mobile;
    if (chromeDesktop) {
      try { if (!window.chrome) weak.push("objet window.chrome absent alors qu'il se dit Chrome"); } catch (_) {}
      try {
        const pdfOff = navigator.pdfViewerEnabled === false;     // PDF ouverts à l'extérieur : liste vide normale
        if (!pdfOff && !coarsePointer() && navigator.plugins && navigator.plugins.length === 0) weak.push("aucun plugin (Chrome de bureau)");
      } catch (_) {}
      try {
        const secure = window.isSecureContext === true && location.protocol === "https:";
        if (secure && parseInt(cm[1], 10) >= 100 && (!uad || !brands.length)) weak.push("agent utilisateur modifié (client hints absents)");
        const chromium = brands.filter(function (b) { return /^Chromium$/i.test(b.brand); })[0];
        if (chromium && parseInt(chromium.version, 10) !== parseInt(cm[1], 10)) weak.push("version du navigateur incohérente");
      } catch (_) {}
    }
    return { strong: strong, weak: weak, generic: generic };
  }

  /* robot certain : nom de robot explicite, webdriver, headless, outil d'automatisation
     (le mot générique « bot » seul ne suffit pas pour un envoi anticipé) */
  function highConfidenceBot(withWindow) {
    try { return !!knownBot() || markers(withWindow).strong.length > 0; } catch (_) { return false; }
  }

  /* ======================================================================
     3. Verdict
     ====================================================================== */
  function secs(ms) { return Math.max(0, Math.round(ms / 1000)); }
  function fmtDuration(ms) {
    const s = secs(ms);
    return s < 60 ? s + " s" : Math.floor(s / 60) + " min " + (s % 60) + " s";
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, Math.round(v))); }

  function visitVerdict() {
    measureWindow();
    const visMs = visibleTime();
    const known = knownBot();
    const m = markers(true);
    const device = deviceType();

    const mouseSpanOk = !S.mouseT0 || !S.mouseT1 || (S.mouseT1 - S.mouseT0 >= 300);
    const mouseHuman = S.moves >= 10 && S.posSet.size >= 8 && S.dirChanges >= 3 &&
      S.segs >= 8 && S.linearSegs / S.segs < 0.6 && mouseSpanOk;
    const mouseMoved = S.posSet.size >= 3;
    const scrolled = S.scrollInputSet.size >= 2 || S.earlyScroll;
    const typed = S.keys >= 3;
    /* défilement + action qu'un programme ne produit pas en un seul geste */
    const scrollPlus = (S.scrollInputSet.size >= 2 && (S.wheels >= 2 || S.touches > 0 || mouseHuman || S.keys >= 3)) ||
      S.earlyScroll;
    const browsed = S.scrollBrowseSet.size >= 3;
    const interacted = S.firstInteractionAt > 0;
    const humanEvidence = mouseHuman || S.touches > 0 || scrollPlus || typed || S.chatUsed;
    const trustedCount = S.moves + S.clicks + S.touches + S.wheels + S.keys + S.fields + S.focusMoves +
      S.earlyInput + (S.chatUsed ? 1 : 0);

    /* --- indices lisibles (positifs) --- */
    const pos = [];
    if (mouseHuman) pos.push("a bougé la souris");
    else if (mouseMoved) pos.push("souris déplacée sans trajectoire naturelle");
    if (S.touches) pos.push("a touché l'écran");
    if (S.earlyScroll) pos.push("a fait défiler pendant le chargement");
    if (scrollPlus && S.scrollInputSet.size >= 2) pos.push("a fait défiler la page");
    else if (S.wheels) pos.push("a utilisé la molette");
    else if (browsed) pos.push("a parcouru la page (défilement)");
    if (S.keys) pos.push("a utilisé le clavier (" + S.keys + (S.keys > 1 ? " touches)" : " touche)"));
    if (S.chatUsed) pos.push("a utilisé le chat");
    if (S.clicks) pos.push(S.clicks > 1 ? "a cliqué (" + S.clicks + " fois)" : "a cliqué");
    if (S.fields) pos.push("a cliqué dans un champ de formulaire");
    if (S.focusMoves) pos.push("navigation au clavier / lecteur d'écran (" + S.focusMoves + ")");
    if (S.earlyInput) pos.push("a agi pendant le chargement");
    if (interacted) pos.push("première interaction après " + secs(S.firstInteractionAt - (firstVisibleAt || startedAt)) + " s");
    const ctx = [];
    if (S.untrusted) ctx.push(S.untrusted + " événement(s) simulé(s) (non humains)");
    if (loadedHidden) ctx.push("ouvert dans un onglet en arrière-plan");

    /* --- score brut (0-100, probabilité d'humain) --- */
    let raw = 40;
    if (mouseHuman) raw += 25; else if (mouseMoved) raw += 8;
    if (S.touches) raw += 25;
    if (scrollPlus || S.wheels) raw += 12; else if (S.scrollInputSet.size >= 2 || browsed) raw += 5;
    if (typed) raw += 12; else if (S.keys) raw += 4;
    if (S.chatUsed) raw += 15;
    if (S.clicks) raw += 5;
    if (S.fields) raw += 5;
    if (S.focusMoves || S.earlyInput) raw += 5;
    if (visMs >= 20000) raw += 5;
    if (sectionsSeen.size >= 3) raw += 5;
    raw -= 10 * m.weak.length;
    if (S.untrusted) raw -= 10;
    if (S.untrusted > trustedCount) raw -= 20;
    if (!interacted && everVisible) raw -= (visMs < SHORT_VISIT_MS ? 30 : 10);
    raw -= 40 * (m.strong.length + (m.generic ? 1 : 0));
    raw = clamp(raw, 0, 100);

    function result(kind, reasons, botName, certain) {
      const band = kind === "human" ? [60, 100] : kind === "bot" ? [0, 25] : [30, 59];
      const label = kind === "human" ? "🙂 Humain probable"
        : kind === "bot" ? (botName ? "🤖 Robot identifié : " + botName : "🤖 Robot probable")
        : "❓ Indéterminé";
      const seen = new Set();
      const uniq = reasons.filter(function (r) { if (!r || seen.has(r)) return false; seen.add(r); return true; }).slice(0, 8);
      return {
        kind: kind, label: label, emoji: kind === "human" ? "🙂" : kind === "bot" ? "🤖" : "❓",
        score: botName ? 0 : clamp(raw, band[0], band[1]),
        reasons: uniq, botName: botName || null,
        certain: kind === "bot" && !!certain,      // robot certain (pas seulement une heuristique)
      };
    }

    /* agent utilisateur de robot, mais vraies interactions humaines dans un vrai navigateur
       (ex. jeton ajouté par une application) : on ne conclut pas « robot » */
    const realHumanInput = /^Mozilla\//.test(UA) && (S.touches > 0 || mouseHuman);
    const demoteUA = realHumanInput && !m.strong.length;
    if ((known || m.generic) && demoteUA) {
      return result("unknown", ["agent utilisateur de robot mais interactions humaines réelles",
        known ? "se présente comme " + known.name : m.generic].concat(pos, m.weak, ctx));
    }
    /* a. robot connu (moteur de recherche, aperçu de lien, IA, SEO) */
    if (known) return result("bot", ["robot identifié : " + known.name + " (" + known.type + ")"], known.name, true);
    /* b. marqueur fort d'automatisation (ou mot « bot » dans l'agent utilisateur) */
    const strong = m.strong.concat(m.generic ? [m.generic] : []);
    if (strong.length) {
      const idle = (!interacted && everVisible) ? ["aucune interaction en " + secs(visMs) + " s"] : [];
      return result("bot", strong.concat(idle, m.weak, ctx, pos), null, true);
    }
    /* c. uniquement des événements simulés */
    if (S.untrusted > 0 && !interacted) return result("bot", ["uniquement des événements simulés (" + S.untrusted + ")"].concat(m.weak, ctx));
    /* c'. majorité d'événements simulés (le site lui-même n'en produit pas) */
    if (S.untrusted >= 10 && S.untrusted > 3 * trustedCount && !mouseHuman && !S.touches) {
      return result("bot", ["majorité d'événements simulés (" + S.untrusted + ")"].concat(pos, m.weak, ctx));
    }
    /* d. preuves humaines réelles */
    if (humanEvidence) {
      if (S.untrusted >= 20 && S.untrusted > trustedCount) {
        return result("unknown", pos.concat(["beaucoup d'événements simulés (" + S.untrusted + ")"], m.weak, ctx));
      }
      if (raw < 45) return result("unknown", pos.concat(["indices humains trop faibles"], m.weak, ctx));
      return result("human", pos.concat(m.weak, ctx));
    }
    /* e. aucune interaction */
    if (!interacted) {
      if (!everVisible) return result("unknown", ["onglet jamais affiché à l'écran"].concat(m.weak, ctx));
      const none = "aucune interaction en " + secs(visMs) + " s";
      if (browsed && m.weak.length < 2) {
        return result("unknown", ["a parcouru la page (défilement) sans autre action", none].concat(m.weak, ctx));
      }
      const corroborated = m.weak.length >= 1 || S.untrusted > 0;
      if (m.weak.length >= 2 || (visMs < SHORT_VISIT_MS && (corroborated || device === "ordinateur"))) {
        return result("bot", [none].concat(m.weak, ctx));
      }
      if (visMs < SHORT_VISIT_MS) {
        return result("unknown", [none + " (visite très courte : robot discret ou visiteur pressé)"].concat(m.weak, ctx));
      }
      return result("unknown", [none + " (lecture possible sans toucher la page)"].concat(m.weak, ctx));
    }
    /* f. quelques interactions, mais pas assez pour conclure */
    if (m.weak.length >= 2) return result("bot", pos.concat(m.weak, ctx));
    return result("unknown", pos.concat(["interactions trop rares pour conclure"], m.weak, ctx));
  }

  /* le verdict ne doit JAMAIS empêcher l'envoi d'une conversation */
  function safeVerdict() {
    try { return visitVerdict(); } catch (_) {
      return { kind: "unknown", label: "❓ Indéterminé", emoji: "❓", score: 50, reasons: ["verdict indisponible"], botName: null, certain: false };
    }
  }

  /* ======================================================================
     4. Contenu des emails
     ====================================================================== */
  function osStr() {
    let m;
    if (/Windows NT/.test(UA)) return "Windows";
    if ((m = UA.match(/Android (\d+)/))) return "Android " + m[1];
    if (/Android/.test(UA)) return "Android";
    if ((m = UA.match(/iPhone OS (\d+)/))) return "iOS " + m[1];
    if (/iPhone|iPod/.test(UA)) return "iOS";
    if ((m = UA.match(/iPad.*? OS (\d+)/))) return "iPadOS " + m[1];
    if (/Macintosh|Mac OS X/.test(UA)) return isIPadDesktop() ? "iPadOS" : "macOS";
    if (/CrOS/.test(UA)) return "ChromeOS";
    if (/Linux/.test(UA)) return isDesktopUATablet() ? "Android (mode ordinateur)" : "Linux";
    return "système inconnu";
  }
  function browserStr() {
    let m, b;
    const known = knownBot();
    if (known) return known.name + " (" + known.type + ")";
    if ((m = UA.match(/HeadlessChrome\/(\d+)/))) b = "Chrome sans interface " + m[1];
    else if (/FBAN|FBAV/.test(UA)) b = "Facebook (navigateur intégré)";
    else if (/Instagram/.test(UA)) b = "Instagram (navigateur intégré)";
    else if (/LinkedInApp/.test(UA)) b = "LinkedIn (navigateur intégré)";
    else if (/WhatsApp/.test(UA)) b = "WhatsApp (navigateur intégré)";
    else if ((m = UA.match(/(?:EdgA|EdgiOS|Edg)\/(\d+)/))) b = "Edge " + m[1];
    else if ((m = UA.match(/(?:OPR|OPiOS)\/(\d+)/))) b = "Opera " + m[1];
    else if ((m = UA.match(/SamsungBrowser\/(\d+)/))) b = "Samsung Internet " + m[1];
    else if ((m = UA.match(/(?:Firefox|FxiOS)\/(\d+)/))) b = "Firefox " + m[1];
    else if ((m = UA.match(/(?:CriOS|Chrome)\/(\d+)/))) b = "Chrome " + m[1];
    else if ((m = UA.match(/Version\/(\d+)[\d.]*\s+(?:Mobile\/\S+\s+)?Safari\//))) b = "Safari " + m[1];
    else if (/Safari\//.test(UA)) b = "Safari";
    else b = "navigateur inconnu";
    return b + " sur " + osStr();
  }

  function subjectFor(v, withChat) {
    let s;
    if (v.kind === "bot" && v.botName) s = "🤖 Robot identifié (" + v.botName + ") — visite de votre portfolio";
    else if (v.kind === "bot") s = "🤖 Robot probable — nouvelle visite sur votre portfolio";
    else if (v.kind === "human") s = "🙂 Humain probable — nouvelle visite sur votre portfolio";
    else s = "❓ Visiteur indéterminé — nouvelle visite sur votre portfolio";
    return withChat ? s + " + conversation ISSA" : s;
  }
  function verdictLine(v) { return "🧪 Verdict : " + v.label + " (indice humain : " + v.score + "/100)"; }

  function buildVisitEmail(v, transcriptText) {
    try {
      const now = Date.now();
      const total = now - startedAt;
      const vis = visibleTime();
      let duration = fmtDuration(total);
      if (loadedHidden || total - vis >= 5000) duration += " (dont " + fmtDuration(vis) + " à l'écran)";
      if (now - scriptStartedAt < 1000) duration += " (envoi anticipé)";
      let body =
        "🔔 Un visiteur a consulté votre portfolio.\n" +
        verdictLine(v) + "\n" +
        "🔎 Indices : " + (v.reasons.length ? v.reasons.join(" · ") : "—") + "\n" +
        "🖥️ Navigateur : " + browserStr() + "\n" +
        "📱 Appareil : " + deviceType() + "\n\n" +
        "🕒 Date : " + new Date().toLocaleString("fr-FR") + "\n" +
        "⏱️ Durée de visite : " + duration + "\n" +
        "🌐 Provenance : " + (document.referrer || "accès direct") + "\n" +
        "🗣️ Langue navigateur : " + (navigator.language || "?") + "\n" +
        "📄 Sections vues : " + (sectionsSeen.size ? Array.from(sectionsSeen).join(", ") : "—") + "\n" +
        "💬 A discuté avec ISSA : " + (chatOpened ? "oui" : "non");
      if (transcriptText) body += "\n\n———  CONVERSATION AVEC ISSA  ———\n\n" + transcriptText;
      return { subject: subjectFor(v, !!transcriptText), body: body };
    } catch (_) {
      /* repli minimal : la conversation part toujours */
      let body = "🔔 Un visiteur a consulté votre portfolio.\n— " + new Date().toLocaleString("fr-FR");
      if (transcriptText) body += "\n\n———  CONVERSATION AVEC ISSA  ———\n\n" + transcriptText;
      return {
        subject: (transcriptText ? "💬 Nouvelle visite + conversation ISSA" : "🔔 Nouvelle visite") + " sur votre portfolio",
        body: body,
      };
    }
  }

  /* -------- Transcript de la conversation en cours (dé-dupliqué) -------- */
  async function getNewTranscript() {
    const H = window.ISSAHistory;
    if (!ON_CHAT || !H || !H.currentId) return null;
    let msgs = [];
    try {
      /* lecture bornée : un historique distant bloqué ne doit pas geler les envois suivants
         (null = « pas maintenant », la conversation sera retentée au prochain déclencheur) */
      msgs = await Promise.race([
        Promise.resolve(H.messages(H.currentId)),
        new Promise(function (r) { setTimeout(function () { r(null); }, HISTORY_TIMEOUT_MS); }),
      ]);
    } catch (_) { return null; }
    if (!msgs || !msgs.some(function (m) { return m.role === "user"; })) return null;
    const key = "issa_sent_" + H.currentId;
    const already = parseInt(lsGet(key) || "0", 10);
    if (msgs.length <= already) return null;         // rien de nouveau
    return {
      key: key, count: msgs.length,
      text: msgs.map(function (m) { return (m.role === "user" ? "👤 Visiteur" : "🤖 ISSA") + " : " + m.content; }).join("\n\n"),
    };
  }

  /* -------- Envoi du résumé complet (visite + conversation) -------- */
  async function doSendSummary() {
    const transcript = await getNewTranscript();
    const v = safeVerdict();
    const isBot = v.kind === "bot";

    /* Cas 1 : le résumé de visite n'a pas encore été envoyé (cette session) */
    if (ON_VISIT && !sent) {
      const last = parseInt(lsGet(THROTTLE_KEY) || "0", 10);
      /* 24 h pour tout le monde, sauf robot certain (identifié / automatisé) */
      const throttled = !v.certain && (Date.now() - last < VISIT_THROTTLE_MS);
      /* robot certain réutilisant le même profil (moniteur, CI…) : 1 email / 6 h */
      const botKey = BOT_KEY_PREFIX + String(v.botName || "auto").replace(/[^\w-]/g, "");
      const botThrottled = isBot && (Date.now() - parseInt(lsGet(botKey) || "0", 10) < BOT_THROTTLE_MS);
      const muted = isBot && !NOTIFY_BOTS;          // notifyBots = false : robots non signalés
      if (!throttled && !botThrottled && !muted) {
        sent = true;
        if (isBot) lsSet(botKey, String(Date.now()));
        else lsSet(THROTTLE_KEY, String(Date.now()));
        if (transcript) lsSet(transcript.key, String(transcript.count));   // conv marquée envoyée
        const mail = buildVisitEmail(v, transcript ? transcript.text : null);
        sendEmail(mail.subject, mail.body);
        return;
      }
    }

    /* Cas 2 : résumé déjà parti (ou non dû), mais NOUVELLE conversation
       -> on l'envoie quand même (aucune conversation perdue) */
    if (transcript) {
      lsSet(transcript.key, String(transcript.count));
      let line = "";
      try { line = verdictLine(v) + "\n"; } catch (_) {}
      sendEmail(
        "💬 Nouvelle conversation avec ISSA sur votre portfolio",
        "Un visiteur a (re)discuté avec ISSA.\n" + line + "\n" +
        transcript.text + "\n\n— " + new Date().toLocaleString("fr-FR")
      );
    }
  }

  /* les envois sont mis en file : jamais deux résumés en parallèle */
  let queue = Promise.resolve();
  function sendSummary() {
    if (!SEND_ALLOWED) return queue;                 // test local : rien n'est envoyé ni marqué
    queue = queue.then(doSendSummary).catch(function () {});
    return queue;
  }

  /* ======================================================================
     5. Déclencheurs
     ====================================================================== */
  /* a. vraie inactivité (page affichée) : le minuteur se ré-arme tant que le visiteur agit */
  let idleTimer = null;
  function armIdle(ms) { clearTimeout(idleTimer); idleTimer = setTimeout(onIdle, ms); }
  function scheduleIdle() { lastActivity = Date.now(); armIdle(INACTIVITY_MS); }
  function onIdle() {
    idleTimer = null;
    if (!isVisibleNow()) { armIdle(INACTIVITY_MS); return; }  // onglet caché : on ne juge pas
    const quiet = Date.now() - lastActivity;
    if (quiet < INACTIVITY_MS) { armIdle(INACTIVITY_MS - quiet); return; }
    sendSummary();
  }

  function trackSections() {
    const els = document.querySelectorAll("section[id]");
    if (!els.length || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting && e.target.id) sectionsSeen.add(e.target.id); });
    }, { threshold: 0.4 });
    els.forEach(function (el) { io.observe(el); });
  }

  function watchChat() {
    const box = document.getElementById("jw-messages");
    if (!box) return false;
    new MutationObserver(function () { chatOpened = true; scheduleIdle(); }).observe(box, { childList: true });
    const launcher = document.getElementById("jesus-launcher");
    if (launcher) launcher.addEventListener("click", function () { chatOpened = true; });
    const closeBtn = document.querySelector(".jw-close");
    if (closeBtn) closeBtn.addEventListener("click", function () { sendSummary(); });   /* c. fermeture du chat */
    return true;
  }
  function whenChatReady(tries) {
    if (watchChat()) return;
    if (tries <= 0) return;
    setTimeout(function () { whenChatReady(tries - 1); }, 400);
  }

  /* c. mise en arrière-plan : on envoie, SAUF si le verdict n'est qu'un « robot
     probable » heuristique (ex. simple changement d'onglet / d'appli en < 8 s) :
     on attend alors plus d'indices (retour sur la page, départ, inactivité) */
  document.addEventListener("visibilitychange", function () {
    updateVisibility();
    if (document.visibilityState !== "hidden") return;
    let defer = false;
    if (!sent) { try { const v = visitVerdict(); defer = v.kind === "bot" && !v.certain; } catch (_) {} }
    if (!defer) sendSummary();                     // (résumé déjà parti : envoie une conversation nouvelle)
  });
  /* départ réel de la page : envoi immédiat, quel que soit le verdict */
  window.addEventListener("pagehide", function () { updateVisibility(); sendSummary(); });
  /* a. filet de sécurité : 30 s sans aucune activité, page affichée */
  armIdle(INACTIVITY_MS);
  /* b. robots certains, second essai (~3 s) : marqueurs mesurés plus tard (fenêtre nulle…) */
  setTimeout(function () {
    try { measureWindow(); if (!sent && highConfidenceBot(true)) sendSummary(); } catch (_) {}
  }, EARLY_BOT_MS);

  /* 6. Outil de test (aucun envoi réseau) */
  try {
    window.ISSAVisit = Object.freeze({
      verdict: safeVerdict,
      preview: function () { const mail = buildVisitEmail(safeVerdict(), null); return { subject: mail.subject, body: mail.body }; },
    });
  } catch (_) {}

  function start() { trackSections(); whenChatReady(60); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();

  /* b. robots certains : envoi IMMÉDIAT, sans minuteur (un robot qui ferme le
     navigateur après 1-2 s ne déclenche ni pagehide ni minuteur) */
  try { if (highConfidenceBot(false)) sendSummary(); } catch (_) {}
})();
