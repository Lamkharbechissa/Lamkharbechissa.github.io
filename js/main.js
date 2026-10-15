/* ============================================================================
   ISSA LAMKHARBECH — Portfolio : logique du site
   - Bilingue FR/EN : tout le contenu vient de JESUS_KB (la même base que le
     chatbot ISSA) ; ce fichier ne contient que les libellés d'interface.
   - Rendu : à propos, parcours, stages, projets (filtres statut + catégorie,
     fiches en modale accessible), compétences, certifications, contact.
   - Thème clair/sombre : js/theme.js (chargé dans <head>) ; ici on ne fait que
     relier le bouton de la nav.
   ============================================================================ */

(function () {
  "use strict";
  const KB = window.JESUS_KB || (typeof JESUS_KB !== "undefined" ? JESUS_KB : null);
  if (!KB) { console.error("JESUS_KB introuvable : chargez js/kb.js avant js/main.js"); return; }
  const $ = (s, c) => (c || document).querySelector(s);
  const $$ = (s, c) => Array.from((c || document).querySelectorAll(s));
  const t = (field, lang) => (field && typeof field === "object" && !Array.isArray(field)) ? (field[lang] || field.fr || "") : (field == null ? "" : field);

  let LANG = "fr";
  try { LANG = localStorage.getItem("issa-lang") === "en" ? "en" : "fr"; } catch (e) { /* stockage bloqué */ }

  /* ------------------------------------------------ dictionnaire interface
     Les jetons {availability}, {availability_lc}, {positioning}, {location},
     {projects} et {hero_desc} sont remplacés au rendu par les valeurs de la base
     de connaissances (JESUS_KB.profile / projects) : une seule source de vérité. */
  const I18N = {
    fr: {
      skip_link: "Aller au contenu", nav_label: "Navigation principale",
      nav_home: "Accueil", nav_about: "Qui est Issa ?", nav_edu: "Parcours",
      nav_stages: "Stages", nav_projects: "Projets", nav_skills: "Compétences",
      nav_contact: "Contact",
      theme_toggle: "Basculer le thème sombre",
      theme_to_dark: "Passer au thème sombre", theme_to_light: "Passer au thème clair",
      doc_title: "Issa Lamkharbech — Élève-ingénieur Arts et Métiers | Adoption IA · Ingénierie · Conseil",
      hero_kicker: "{availability}",
      hero_hello: "Bonjour, je suis",
      hero_role: "Élève-ingénieur Arts et Métiers — {positioning}",
      hero_desc: "{hero_desc}",
      hero_location: "{location}",
      hero_btn_projects: "Découvrir mes projets", hero_btn_chat: "Discuter avec ISSA",
      stat_projects: "Projets réalisés ou en cours", stat_stages: "Stages en entreprise",
      stat_certifs: "Certifications", stat_langs: "Langues parlées",
      about_tag: "À propos", about_title: "Qui est Issa ?",
      about_sub: "Un profil à l'interface de l'IA, de l'ingénierie et du conseil.",
      about_h3: "Du cadrage des besoins à des outils d'IA utilisés au quotidien",
      about_obj_label: "Objectif",
      edu_tag: "Formation", edu_title: "Mon parcours scolaire",
      edu_sub: "Du cycle préparatoire intégré de l'ENSAM Meknès au double diplôme d'ingénieur Arts et Métiers (Aix-en-Provence, puis Paris).",
      stages_tag: "Expériences", stages_title: "Mes stages en entreprise",
      stages_sub: "Des expériences industrielles complémentaires : l'adoption de l'IA en ingénierie chez Capgemini Engineering et la gestion de construction chez JESA.",
      stage_env: "Environnement", stage_results: "Points clés",
      projects_tag: "Portfolio", projects_title: "Mes projets",
      projects_sub: "{projects} projets détaillés — plateforme multi-agents AegisAI, conformité AI Act, maintenance prédictive, robotique et jumeaux numériques. Filtrez par statut ou par catégorie, puis ouvrez une fiche pour tout savoir.",
      filter_status: "Statut", filter_cat: "Catégorie", filter_all: "Tous",
      status_done: "Terminé", status_ongoing: "En cours", status_planned: "À venir",
      cat_other: "Autre",
      proj_count: "{n} projets · {m} affichés", proj_count_one: "1 projet · 1 affiché",
      proj_show_more: "Afficher les {n} autres projets", proj_show_less: "Réduire la liste",
      proj_empty: "Aucun projet ne correspond à ce filtre.",
      proj_more: "Voir les détails", proj_group: "Groupe", proj_solo: "Individuel",
      link_site: "Voir le site",
      modal_close: "Fermer", modal_team: "Organisation",
      modal_context: "Contexte", modal_role: "Rôle d'Issa", modal_desc: "Description",
      modal_highlights: "Points forts", modal_how: "Comment il a été construit",
      modal_links: "Liens", modal_img_alt: "Aperçu du projet",
      modal_tech: "Technologies",
      modal_metrics: "Résultats & métriques", modal_period: "Période", modal_duration: "Durée",
      skills_tag: "Expertise", skills_title: "Mes compétences",
      skills_sub: "Toutes les compétences listées dans mes CV, organisées par domaine.",
      certif_title: "Licences & certifications", extra_title: "Vie associative",
      langs_title: "Langues", cert_link: "Voir le certificat (nouvel onglet)",
      contact_tag: "Contact", contact_title: "Travaillons ensemble !",
      contact_sub: "Je recherche un {availability_lc}, à l'interface de l'IA, de l'ingénierie et du conseil. Discutons de vos projets — ou posez vos questions à ISSA, mon assistant IA.",
      contact_chat: "Poser une question à ISSA",
      form_title: "Laissez-moi un message",
      form_sub: "Écrivez-moi directement depuis le site : je reçois votre message et vous réponds vite.",
      form_name: "Votre nom", form_email: "Votre email", form_message: "Votre message",
      form_send: "Envoyer le message",
      form_sending: "Envoi en cours…",
      form_ok: "Merci ! Votre message a bien été envoyé. Je vous répondrai vite.",
      form_err: "L'envoi a échoué. Réessayez ou écrivez-moi directement par email.",
      form_fill: "Merci de remplir votre nom, un email valide et un message.",
      form_or: "ou contactez-moi directement",
      form_quick_mail: "Par email", form_quick_sms: "Par SMS",
      cc_mail: "Email", cc_phone: "Téléphone", cc_loc: "Localisation", cc_li: "LinkedIn",
      footer_top: "Haut de page", footer_links: "Liens",
      footer_privacy: "Confidentialité : ce site mesure de façon anonyme la date et la durée de visite, les sections consultées, la provenance, la langue, le type de navigateur et d'appareil (système, ordinateur/mobile) ainsi que l'activité (souris, toucher, défilement, clics, nombre de frappes — jamais leur contenu) afin de distinguer visiteurs humains et robots ; ce résumé et les conversations avec ISSA sont envoyés par email à Issa (via FormSubmit). Aucun cookie publicitaire, aucun accès n'est restreint.",
      jesus_status: "En ligne — répond instantanément"
    },
    en: {
      skip_link: "Skip to content", nav_label: "Main navigation",
      nav_home: "Home", nav_about: "Who is Issa?", nav_edu: "Education",
      nav_stages: "Internships", nav_projects: "Projects", nav_skills: "Skills",
      nav_contact: "Contact",
      theme_toggle: "Toggle dark theme",
      theme_to_dark: "Switch to dark theme", theme_to_light: "Switch to light theme",
      doc_title: "Issa Lamkharbech — Arts et Métiers engineering student | AI adoption · Engineering · Consulting",
      hero_kicker: "{availability}",
      hero_hello: "Hi, I am",
      hero_role: "Arts et Métiers engineering student — {positioning}",
      hero_desc: "{hero_desc}",
      hero_location: "{location}",
      hero_btn_projects: "Explore my projects", hero_btn_chat: "Chat with ISSA",
      stat_projects: "Completed or ongoing projects", stat_stages: "Company internships",
      stat_certifs: "Certifications", stat_langs: "Spoken languages",
      about_tag: "About", about_title: "Who is Issa?",
      about_sub: "A profile at the interface of AI, engineering and consulting.",
      about_h3: "From scoping the needs to AI tools used every day",
      about_obj_label: "Goal",
      edu_tag: "Education", edu_title: "My educational background",
      edu_sub: "From the ENSAM Meknès integrated preparatory cycle to the Arts et Métiers double engineering degree (Aix-en-Provence, then Paris).",
      stages_tag: "Experience", stages_title: "My internships",
      stages_sub: "Complementary industrial experiences: AI adoption in engineering at Capgemini Engineering and construction management at JESA.",
      stage_env: "Environment", stage_results: "Highlights",
      projects_tag: "Portfolio", projects_title: "My projects",
      projects_sub: "{projects} detailed projects — the AegisAI multi-agent platform, AI Act compliance, predictive maintenance, robotics and digital twins. Filter by status or category, then open a project to know everything.",
      filter_status: "Status", filter_cat: "Category", filter_all: "All",
      status_done: "Completed", status_ongoing: "Ongoing", status_planned: "Upcoming",
      cat_other: "Other",
      proj_count: "{n} projects · {m} shown", proj_count_one: "1 project · 1 shown",
      proj_show_more: "Show {n} more projects", proj_show_less: "Show fewer projects",
      proj_empty: "No project matches this filter.",
      proj_more: "View details", proj_group: "Group", proj_solo: "Individual",
      link_site: "Visit site",
      modal_close: "Close", modal_team: "Setup",
      modal_context: "Context", modal_role: "Issa's role", modal_desc: "Description",
      modal_highlights: "Highlights", modal_how: "How it was built",
      modal_links: "Links", modal_img_alt: "Project preview",
      modal_tech: "Technologies",
      modal_metrics: "Results & metrics", modal_period: "Period", modal_duration: "Duration",
      skills_tag: "Expertise", skills_title: "My skills",
      skills_sub: "All the skills listed on my CVs, organized by domain.",
      certif_title: "Licenses & certifications", extra_title: "Extracurricular",
      langs_title: "Languages", cert_link: "View the certificate (new tab)",
      contact_tag: "Contact", contact_title: "Let's work together!",
      contact_sub: "I'm looking for a {availability_lc}, at the interface of AI, engineering and consulting. Let's talk — or ask ISSA, my AI assistant, anything about me.",
      contact_chat: "Ask ISSA a question",
      form_title: "Leave me a message",
      form_sub: "Write to me directly from the site: I receive your message and reply quickly.",
      form_name: "Your name", form_email: "Your email", form_message: "Your message",
      form_send: "Send message",
      form_sending: "Sending…",
      form_ok: "Thank you! Your message has been sent. I'll reply soon.",
      form_err: "Sending failed. Please retry or email me directly.",
      form_fill: "Please fill in your name, a valid email and a message.",
      form_or: "or reach me directly",
      form_quick_mail: "By email", form_quick_sms: "By SMS",
      cc_mail: "Email", cc_phone: "Phone", cc_loc: "Location", cc_li: "LinkedIn",
      footer_top: "Back to top", footer_links: "Links",
      footer_privacy: "Privacy: this site anonymously measures visit date and duration, sections viewed, referring page, language, browser and device type (OS, desktop/mobile), as well as activity (mouse, touch, scrolling, clicks, number of keystrokes — never their content), to tell human visitors from robots; this summary and conversations with ISSA are emailed to Issa (via FormSubmit). No advertising cookies, and no access is restricted.",
      jesus_status: "Online — instant answers"
    }
  };

  /* Valeurs de repli si une ancienne kb.js (sans availability / positioning) est servie */
  const PROFILE_FALLBACK = {
    fr: {
      availability: "Stage de fin d'études de six mois à partir de début février 2027",
      positioning: "Adoption IA · Ingénierie · Conseil",
      hero_desc: "Élève-ingénieur Arts et Métiers (Bac+5, grade de Master, dernière année) — à l'interface de l'IA, de l'ingénierie et du conseil. Du cadrage des besoins à la réalisation d'outils utilisables par des non-experts : modèles prédictifs, systèmes multi-agents et mesure de la valeur."
    },
    en: {
      availability: "Six-month end-of-studies internship starting early February 2027",
      positioning: "AI adoption · Engineering · Consulting",
      hero_desc: "Arts et Métiers engineering student (Bac+5, Master's level, final year) — at the interface of AI, engineering and consulting. From scoping the needs to delivering tools that non-experts can use: predictive models, multi-agent systems and value measurement."
    }
  };

  /* icônes (sprite SVG de index.html) */
  const CAT_ICONS = { genai_agents: "i-network", ml_dl: "i-chart", robotics_twins: "i-robot", iot_web: "i-cpu", other: "i-factory" };
  const SKILL_ICONS = { genai_llms: "i-sparkles", data_ml: "i-chart", data_engineering: "i-database", dev: "i-code", cloud_devops: "i-cloud", industry40: "i-factory", ai_governance: "i-shield", management: "i-clipboard", soft_skills: "i-smile" };
  const ic = (id, extra) => `<svg class="ic${extra ? " " + extra : ""}" aria-hidden="true"><use href="#${id}"/></svg>`;

  /* ordre et état des statuts de projet */
  const STATUS_ORDER = ["ongoing", "done", "planned"];
  const PAGE_SIZE = 6;
  const PF = { status: "all", category: "all", expanded: false }; /* conservé entre deux changements de langue */

  /* largeur des barres de langues : déduite du niveau CECRL écrit dans la KB */
  const CEFR_PCT = { A1: 25, A2: 38, B1: 55, B2: 72, C1: 88, C2: 96 };
  function langPct(level) {
    const s = String(level || "");
    if (/maternelle|native/i.test(s)) return 100;
    const m = s.match(/\b([ABC][12])\b/);
    return m ? CEFR_PCT[m[1]] : 50;
  }

  /* ------------------------------------------------ valeurs issues de la KB */
  const ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ESC_MAP[c]);
  const tx = (field) => esc(t(field, LANG));
  const lcFirst = s => s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
  const safeUrl = u => (typeof u === "string" && /^https:\/\//i.test(u)) ? u : "";
  function profileValue(key) {
    const v = t(KB.profile && KB.profile[key], LANG);
    return v || PROFILE_FALLBACK[LANG][key] || PROFILE_FALLBACK.fr[key] || "";
  }
  /* description du hero = titre KB + 2e phrase du résumé KB (« Du cadrage… ») */
  function heroDesc() {
    const title = t(KB.profile.title, LANG);
    const sentences = String(t(KB.profile.summary, LANG) || "").split(/\.\s+/);
    let second = sentences[1];
    if (!title || !second) return PROFILE_FALLBACK[LANG].hero_desc;
    if (!/\.$/.test(second)) second += ".";
    return title.replace(/\.$/, "") + ". " + second;
  }
  const statusKey = p => {
    const k = p.status && (typeof p.status === "object" ? p.status.key : p.status);
    return STATUS_ORDER.indexOf(k) >= 0 ? k : "done";
  };
  const catKey = p => {
    const k = p.category && (typeof p.category === "object" ? p.category.key : p.category);
    return k ? String(k).replace(/[^a-z0-9_-]/gi, "") : "other";
  };
  const catLabel = p => (p.category && typeof p.category === "object" && t(p.category, LANG)) || I18N[LANG].cat_other;
  function kbTokens() {
    const availability = profileValue("availability");
    return {
      availability: esc(availability),
      availability_lc: esc(lcFirst(availability)),
      positioning: esc(profileValue("positioning")),
      location: esc(t(KB.profile.contact && KB.profile.contact.location, LANG)),
      projects: String(KB.projects.length),
      hero_desc: esc(heroDesc())
    };
  }
  function fill(str, tokens) {
    return typeof str === "string" ? str.replace(/\{(\w+)\}/g, (m, k) => (tokens[k] !== undefined ? tokens[k] : m)) : str;
  }

  /* ----------------------------------------------------------- i18n statique */
  function applyI18n() {
    const dict = I18N[LANG];
    const tokens = kbTokens();
    $$("[data-i18n]").forEach(el => {
      const k = el.getAttribute("data-i18n");
      if (typeof dict[k] === "string") el.innerHTML = fill(dict[k], tokens);
    });
    $$("[data-i18n-aria]").forEach(el => {
      const k = el.getAttribute("data-i18n-aria");
      if (typeof dict[k] === "string") el.setAttribute("aria-label", dict[k]);
    });
    $$("[data-i18n-title]").forEach(el => {
      const k = el.getAttribute("data-i18n-title");
      if (typeof dict[k] === "string") el.setAttribute("title", dict[k]);
    });
    $$("[data-i18n-ph]").forEach(el => {
      const k = el.getAttribute("data-i18n-ph");
      if (dict[k] !== undefined) el.setAttribute("placeholder", dict[k]);
    });
    if (typeof dict.doc_title === "string") document.title = dict.doc_title;
    document.documentElement.setAttribute("lang", LANG);
    document.documentElement.setAttribute("data-lang", LANG);
    $$(".lang-switch button").forEach(b => {
      const on = b.dataset.lang === LANG;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(on));
    });
    const st = $("[data-jesus-i18n='status']");
    if (st) st.textContent = dict.jesus_status;
    syncTheme();
  }

  /* ------------------------------------------------------------ thème (nav) */
  function syncTheme() {
    const tt = $("#theme-toggle");
    if (!tt || !window.ISSATheme) return;
    const dark = window.ISSATheme.current() === "dark";
    const dict = I18N[LANG];
    tt.setAttribute("aria-pressed", String(dark));
    tt.setAttribute("aria-label", dict.theme_toggle);
    tt.setAttribute("title", dark ? dict.theme_to_light : dict.theme_to_dark);
  }

  /* --------------------------------------------------------- rendu dynamique */
  function renderKpis() {
    const values = {
      projects: (KB.projects || []).length,   /* tous les projets de la base */
      internships: (KB.internships || []).length,
      certifications: (KB.certifications || []).length,
      languages: ((KB.profile && KB.profile.languages_spoken) || []).length
    };
    $$(".stat .num[data-stat]").forEach(el => {
      const v = values[el.dataset.stat];
      if (typeof v === "number") { el.textContent = String(v); el.dataset.target = String(v); }
    });
  }

  function renderAbout() {
    const sum = $("#about-summary"), obj = $("#about-objective"), badges = $("#about-badges");
    if (sum) sum.textContent = t(KB.profile.summary, LANG);
    if (obj) obj.textContent = t(KB.profile.objective, LANG);
    if (!badges) return;
    badges.innerHTML = "";
    const hb = (KB.profile.hobbies && KB.profile.hobbies[LANG]) || [];
    hb.forEach(h => {
      const b = document.createElement("span");
      b.className = "badge"; b.textContent = h; badges.appendChild(b);
    });
  }

  function renderEducation() {
    const box = $("#timeline");
    if (!box) return;
    box.innerHTML = "";
    (KB.education || []).forEach((e, i) => {
      const li = document.createElement("li");
      li.className = "tl-item reveal";
      li.setAttribute("data-delay", String(Math.min(i, 3)));
      li.innerHTML = `
        <span class="tl-dot" aria-hidden="true"></span>
        <div class="tl-card">
          <span class="tl-period">${tx(e.period)}</span>
          <h4>${tx(e.degree)}</h4>
          <div class="where">${tx(e.school)}</div>
        </div>`;
      box.appendChild(li);
    });
  }

  function renderInternships() {
    const box = $("#stage-grid");
    if (!box) return;
    const dict = I18N[LANG];
    box.innerHTML = "";
    (KB.internships || []).forEach((s, i) => {
      const card = document.createElement("article");
      card.className = "tile span-6 stage-card reveal";
      card.setAttribute("data-delay", String(i + 1));
      const metrics = (s.metrics && s.metrics[LANG]) || [];
      card.innerHTML = `
        <div class="stage-top">
          <span class="badge-status is-done">${tx(s.type)}</span>
          <span class="stage-duration">${tx(s.duration)} · ${tx(s.period)}</span>
        </div>
        <h3>${tx(s.title)}</h3>
        <div class="stage-company">${ic("i-building")}<span>${tx(s.company)}</span></div>
        <p class="stage-desc">${tx(s.description)}</p>
        <div>
          <h4 class="sub-h">${dict.stage_env}</h4>
          <div class="chips">${(s.technologies || []).map(x => `<span class="chip">${esc(x)}</span>`).join("")}</div>
        </div>
        ${metrics.length ? `<div><h4 class="sub-h">${dict.stage_results}</h4>
        <div class="metric-row">${metrics.map(m => `<span class="metric">${esc(m)}</span>`).join("")}</div></div>` : ""}`;
      box.appendChild(card);
    });
  }

  /* ----------------------------------------------------------------- projets */
  function shortDesc(p) {
    const d = t(p.description, LANG);
    const cut = d.indexOf(". ", 120);
    return cut > 0 ? d.slice(0, cut + 1) : (d.length > 180 ? d.slice(0, 180) + "…" : d);
  }
  /* période courte pour la carte : avant la 1re parenthèse ou le 1er « ; » */
  const shortPeriod = p => String(t(p.period, LANG)).split(/\s*[(;]/)[0].trim();
  /* puce techno courte : sans les précisions entre parenthèses */
  function shortTech(s) {
    const v = String(s).replace(/\s*\([^)]*\)/g, "").replace(/\s{2,}/g, " ").trim();
    const parts = v.split(" / ");
    /* « libellé FR / English label » : on garde la langue affichée */
    if (parts.length === 2 && parts.every(x => /\s/.test(x.trim()))) return parts[LANG === "en" ? 1 : 0].trim();
    return v;
  }
  function teamLabel(p) {
    const size = Number(p.team_size);
    if (!size) return "";
    const dict = I18N[LANG];
    return size > 1 ? dict.proj_group + " · " + size : dict.proj_solo;
  }
  /* liens d'un projet : uniquement https:// (tout le reste est ignoré) */
  function projectLinks(p) {
    const out = [], seen = {};
    const add = (label, url) => {
      const u = safeUrl(url);
      if (!u || seen[u]) return;
      seen[u] = 1; out.push({ label: label || u.replace(/^https:\/\//, ""), url: u });
    };
    if (p.live_url) add(I18N[LANG].link_site, p.live_url);
    if (Array.isArray(p.links)) p.links.forEach(l => l && add(t(l.label, LANG), l.url));
    else if (p.links && typeof p.links === "object") Object.keys(p.links).forEach(k => add(k, p.links[k]));
    return out;
  }
  const byId = id => KB.projects.find(p => p.id === id);
  function sortedProjects() {
    /* ordre de la KB (projets phares d'abord), les projets « à venir » en dernier */
    return KB.projects.map((p, i) => ({ p, i }))
      .sort((a, b) => ((statusKey(a.p) === "planned") - (statusKey(b.p) === "planned")) || (a.i - b.i))
      .map(o => o.p);
  }

  function renderFilters() {
    const dict = I18N[LANG];
    const sBox = $("#pf-status"), cBox = $("#pf-cat");
    if (!sBox || !cBox) return;
    const statuses = STATUS_ORDER.filter(k => KB.projects.some(p => statusKey(p) === k));
    const cats = [];
    KB.projects.forEach(p => { const k = catKey(p); if (!cats.some(c => c.key === k)) cats.push({ key: k, label: catLabel(p) }); });
    if (PF.status !== "all" && statuses.indexOf(PF.status) < 0) PF.status = "all";
    if (PF.category !== "all" && !cats.some(c => c.key === PF.category)) PF.category = "all";
    const chip = (filter, value, label, dot) =>
      `<button type="button" class="fchip" data-filter="${filter}" data-value="${esc(value)}" aria-pressed="false">${dot ? '<span class="fdot" aria-hidden="true"></span>' : ""}<span>${esc(label)}</span><span class="fcount"></span></button>`;
    sBox.innerHTML = chip("status", "all", dict.filter_all) + statuses.map(k => chip("status", k, dict["status_" + k], true)).join("");
    cBox.innerHTML = chip("category", "all", dict.filter_all) + cats.map(c => chip("category", c.key, c.label)).join("");
  }

  function renderProjects() {
    const box = $("#proj-grid");
    if (!box) return;
    const dict = I18N[LANG];
    box.innerHTML = "";
    sortedProjects().forEach((p, i) => {
      const status = statusKey(p), cat = catKey(p);
      const img = safeImg(p.image);
      const tech = (p.technologies || []).map(shortTech).filter(Boolean);
      const shown = tech.slice(0, 3), extra = tech.length - shown.length;
      const team = teamLabel(p);
      const live = safeUrl(p.live_url);
      const card = document.createElement("article");
      card.className = "tile proj-card reveal";
      card.dataset.id = p.id;
      card.dataset.status = status;
      card.dataset.category = cat;
      card.setAttribute("data-delay", String((i % 3) + 1));
      card.innerHTML = `
        <div class="proj-thumb${img ? "" : " proj-thumb--empty"}">
          ${img ? `<img src="${esc(img)}" width="1200" height="675" loading="lazy" decoding="async" alt="">`
                : `<span class="ph-ic">${ic(CAT_ICONS[cat] || "i-code")}</span>`}
        </div>
        <div class="proj-body">
          <div class="proj-top">
            <span class="badge-status is-${status}">${dict["status_" + status]}</span>
            <span class="pm">${ic(CAT_ICONS[cat] || "i-code")}${esc(catLabel(p))}</span>
            ${team ? `<span class="pm">${ic("i-group")}${esc(team)}</span>` : ""}
          </div>
          <h3><button type="button" class="proj-open" aria-haspopup="dialog" aria-controls="modal-overlay">${tx(p.name)}</button></h3>
          <p class="short">${esc(shortDesc(p))}</p>
          ${shown.length ? `<div class="chips">${shown.map(x => `<span class="chip">${esc(x)}</span>`).join("")}${extra > 0 ? `<span class="chip chip--more">+${extra}</span>` : ""}</div>` : ""}
          <div class="proj-foot">
            <span class="proj-period">${esc(shortPeriod(p))}</span>
            <span class="proj-more" aria-hidden="true">${dict.proj_more} ${ic("i-arrow")}</span>
          </div>
          ${live ? `<div class="proj-links"><a class="proj-link" href="${esc(live)}" target="_blank" rel="noopener">${ic("i-ext")}${dict.link_site}</a></div>` : ""}
        </div>`;
      box.appendChild(card);
    });
    applyFilters(false);
  }
  /* image de projet : chemin relatif du site uniquement (jamais d'URL externe) */
  function safeImg(src) {
    return (typeof src === "string" && /^img\/[\w./-]+\.(png|jpe?g|webp|avif)$/i.test(src) && src.indexOf("..") < 0) ? src : "";
  }

  function applyFilters(fromUser) {
    const dict = I18N[LANG];
    const cards = $$("#proj-grid .proj-card");
    const matchS = c => PF.status === "all" || c.dataset.status === PF.status;
    const matchC = c => PF.category === "all" || c.dataset.category === PF.category;
    const matched = cards.filter(c => matchS(c) && matchC(c));
    const limit = PF.expanded ? Infinity : PAGE_SIZE;
    cards.forEach(c => { c.hidden = true; });
    matched.forEach((c, i) => {
      c.hidden = i >= limit;
      if (fromUser && !c.hidden) c.classList.add("visible");
    });
    /* compteurs à facettes : statut calculé sur la catégorie active, et inversement */
    $$("#proj-filters .fchip").forEach(b => {
      const f = b.dataset.filter, v = b.dataset.value;
      const on = (f === "status" ? PF.status : PF.category) === v;
      b.setAttribute("aria-pressed", String(on));
      const n = cards.filter(c => f === "status"
        ? matchC(c) && (v === "all" || c.dataset.status === v)
        : matchS(c) && (v === "all" || c.dataset.category === v)).length;
      const cnt = b.querySelector(".fcount");
      if (cnt) cnt.textContent = String(n);
      /* puce de statut sans aucun projet (ex. « À venir » quand aucun projet
         n'est planifié) : masquée, sauf si c'est le filtre actif */
      if (f === "status" && v !== "all") b.hidden = n === 0 && !on;
    });
    const shownN = matched.filter(c => !c.hidden).length;
    const count = $("#proj-count");
    if (count) count.textContent = (matched.length === 1 ? dict.proj_count_one : dict.proj_count)
      .replace("{n}", String(matched.length)).replace("{m}", String(shownN));
    const empty = $("#proj-empty");
    if (empty) empty.hidden = matched.length > 0;
    const more = $("#proj-more-btn");
    if (more) {
      const rest = matched.length - PAGE_SIZE;
      more.hidden = rest <= 0;
      more.setAttribute("aria-expanded", String(PF.expanded));
      more.textContent = PF.expanded ? dict.proj_show_less : dict.proj_show_more.replace("{n}", String(rest));
    }
  }

  /* ------------------------------------------------------------ modale projet */
  let lastFocus = null;
  function openModal(p, trigger) {
    if (!p) return;
    const dict = I18N[LANG];
    const overlay = $("#modal-overlay"), title = $("#modal-title"), body = $("#modal-content");
    if (!overlay || !body) return;
    const status = statusKey(p), cat = catKey(p);
    const img = safeImg(p.image);
    const team = t(p.team_type, LANG);
    const statusText = t(p.status, LANG) || dict["status_" + status];
    const hl = (p.highlights && p.highlights[LANG]) || [];
    const metrics = (p.metrics && p.metrics[LANG]) || [];
    const links = projectLinks(p);
    const role = t(p.role, LANG), how = t(p.how_built, LANG), context = t(p.context, LANG);
    if (title) title.textContent = t(p.name, LANG);
    body.innerHTML = `
      ${img ? `<img class="modal-thumb" src="${esc(img)}" width="1200" height="675" decoding="async" alt="${esc(dict.modal_img_alt + " — " + t(p.name, LANG))}">` : ""}
      <div class="proj-top">
        <span class="badge-status is-${status}">${esc(statusText)}</span>
        <span class="pm">${ic(CAT_ICONS[cat] || "i-code")}${esc(catLabel(p))}</span>
      </div>
      <dl class="facts">
        <div><dt>${dict.modal_period}</dt><dd>${tx(p.period)}</dd></div>
        ${t(p.duration, LANG) ? `<div><dt>${dict.modal_duration}</dt><dd>${tx(p.duration)}</dd></div>` : ""}
        ${team ? `<div><dt>${dict.modal_team}</dt><dd>${esc(team)}</dd></div>` : ""}
      </dl>
      ${context ? `<h4>${dict.modal_context}</h4><p>${esc(context)}</p>` : ""}
      ${role ? `<h4>${dict.modal_role}</h4><p>${esc(role)}</p>` : ""}
      <h4>${dict.modal_desc}</h4><p class="desc">${tx(p.description)}</p>
      ${hl.length ? `<h4>${dict.modal_highlights}</h4><ul class="hl-list">${hl.map(h => `<li>${esc(h)}</li>`).join("")}</ul>` : ""}
      ${how ? `<h4>${dict.modal_how}</h4><p>${esc(how)}</p>` : ""}
      ${(p.technologies || []).length ? `<h4>${dict.modal_tech}</h4><div class="chips">${p.technologies.map(x => `<span class="chip">${esc(x)}</span>`).join("")}</div>` : ""}
      ${metrics.length ? `<h4>${dict.modal_metrics}</h4><div class="metric-row">${metrics.map(m => `<span class="metric">${esc(m)}</span>`).join("")}</div>` : ""}
      ${links.length ? `<h4>${dict.modal_links}</h4><div class="proj-links">${links.map(l => `<a class="proj-link" href="${esc(l.url)}" target="_blank" rel="noopener">${ic("i-ext")}${esc(l.label)}</a>`).join("")}</div>` : ""}`;
    lastFocus = trigger || document.activeElement;
    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    const scroller = $(".modal-body", overlay);
    if (scroller) scroller.scrollTop = 0;
    const close = $("#modal-close");
    if (close) close.focus({ preventScroll: true });
  }

  function closeModal() {
    const overlay = $("#modal-overlay");
    if (!overlay || !overlay.classList.contains("open")) return;
    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
    lastFocus = null;
  }

  /* piège à focus : Tab / Maj+Tab restent dans la modale */
  function trapFocus(e) {
    if (e.key !== "Tab") return;
    const modal = $("#modal-overlay .modal");
    const f = $$('button, a[href], [tabindex]:not([tabindex="-1"])', modal).filter(el => !el.hidden && el.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === modal)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* ------------------------------------------------------------- compétences */
  function renderSkills() {
    const box = $("#skill-grid");
    if (!box) return;
    box.innerHTML = "";
    Object.entries(KB.skills || {}).forEach(([key, cat], i) => {
      const card = document.createElement("div");
      card.className = "tile skill-card reveal";
      card.setAttribute("data-delay", String((i % 3) + 1));
      const items = (key === "soft_skills" && cat["items_" + LANG]) ? cat["items_" + LANG] : (cat.items || []);
      card.innerHTML = `
        <div class="sk-row"><span class="sk-ic">${ic(SKILL_ICONS[key] || "i-sparkles")}</span><h3>${tx(cat.label)}</h3><span class="count">${items.length}</span></div>
        <div class="chips">${items.map(x => `<span class="chip">${esc(x)}</span>`).join("")}</div>`;
      box.appendChild(card);
    });
  }

  function renderCertifsExtra() {
    const dict = I18N[LANG];
    const cbox = $("#certif-list");
    if (cbox) {
      cbox.innerHTML = "";
      (KB.certifications || []).forEach(c => {
        const url = safeUrl(c.url);
        const name = url
          ? `<a href="${esc(url)}" target="_blank" rel="noopener" title="${esc(dict.cert_link)}">${esc(c.name)}</a>`
          : esc(c.name);
        cbox.insertAdjacentHTML("beforeend", `
          <div class="list-row">
            <div class="lr-ic">${ic("i-cert")}</div>
            <div><strong>${name}</strong><small>${tx(c.issuer)} — ${tx(c.date)}</small></div>
          </div>`);
      });
    }
    const ebox = $("#extra-list");
    if (ebox) {
      ebox.innerHTML = "";
      (KB.extracurricular || []).forEach(x => {
        ebox.insertAdjacentHTML("beforeend", `
          <div class="list-row">
            <div class="lr-ic">${ic("i-group")}</div>
            <div><strong>${tx(x.role)} — ${tx(x.org)}</strong><small>${tx(x.date)} · ${tx(x.description)}</small></div>
          </div>`);
      });
    }
    const lbox = $("#lang-bars");
    if (lbox) {
      lbox.innerHTML = "";
      (KB.profile.languages_spoken || []).forEach(l => {
        const lvl = t(l.level, LANG), name = t(l.name, LANG);
        const pct = langPct(lvl);
        lbox.insertAdjacentHTML("beforeend", `
          <div class="lang-bar">
            <div class="lb-top"><span>${esc(name)}</span><span>${esc(lvl)}</span></div>
            <div class="lb-track" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${esc(name + " — " + lvl)}"><div class="lb-fill" data-pct="${pct}"></div></div>
          </div>`);
      });
    }
  }

  function renderContact() {
    const c = KB.profile.contact || {};
    const email = c.email || "issa.pfe@gmail.com";
    const phone = String(c.phone || "");
    const setTxt = (sel, v) => { const el = $(sel); if (el) el.textContent = v; };
    setTxt("#cc-mail small", email);
    setTxt("#cc-phone small", phone);
    setTxt("#cc-loc small", t(c.location, LANG));
    const mail = $("#cc-mail"), tel = $("#cc-phone"), li = $("#cc-li");
    if (mail) mail.setAttribute("href", "mailto:" + email);
    if (tel) tel.setAttribute("href", "tel:" + phone.replace(/\s/g, ""));
    if (li && safeUrl(c.linkedin)) li.setAttribute("href", c.linkedin);
    /* boutons rapides email / SMS directement depuis le site */
    const phoneIntl = phone.replace(/\s/g, "").replace(/^0/, "+33");
    const qm = $("#cf-quick-mail"), qs = $("#cf-quick-sms");
    if (qm) qm.setAttribute("href", "mailto:" + email + "?subject=" +
      encodeURIComponent(LANG === "fr" ? "Contact depuis votre portfolio" : "Contact from your portfolio"));
    if (qs) qs.setAttribute("href", "sms:" + phoneIntl);
  }

  function renderAll() {
    applyI18n();
    renderAbout();
    renderEducation();
    renderInternships();
    renderKpis();
    renderFilters();
    renderProjects();
    renderSkills();
    renderCertifsExtra();
    renderContact();
    observeReveals();
    document.dispatchEvent(new Event("jesus:langchange"));
  }

  /* ------------------------------------------------------------- animations */
  let revealObserver;
  function reveal(el) {
    el.classList.add("visible");
    el.querySelectorAll(".lb-fill").forEach(f => { f.style.width = f.dataset.pct + "%"; });
  }
  function observeReveals() {
    if (revealObserver) revealObserver.disconnect();
    const els = $$(".reveal, .list-card");
    if (!("IntersectionObserver" in window)) { els.forEach(reveal); return; }
    revealObserver = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (en.isIntersecting) { reveal(en.target); revealObserver.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    els.forEach(el => { if (!el.classList.contains("visible")) revealObserver.observe(el); else reveal(el); });
  }

  /* -------------------------------------------------------------- démarrage */
  document.addEventListener("DOMContentLoaded", () => {
    /* nav : ombre + progression + section active */
    const nav = $(".nav");
    const progress = $("#scroll-progress");
    const sections = $$("section[id]");
    const navA = $$(".nav-links a");
    const navLinks = $("#nav-links"), burger = $("#burger");
    let ticking = false;
    function onScroll() {
      ticking = false;
      const y = window.scrollY;
      if (nav) nav.classList.toggle("scrolled", y > 8);
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      if (progress) progress.style.width = (max > 0 ? (h.scrollTop / max * 100) : 0) + "%";
      let cur = "";
      sections.forEach(s => { if (y >= s.offsetTop - 88) cur = s.id; });
      navA.forEach(a => {
        const on = a.getAttribute("href") === "#" + cur;
        a.classList.toggle("active", on);
        if (on) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
      });
    }
    window.addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
    onScroll();

    /* burger mobile */
    function setMenu(open) {
      if (!navLinks || !burger) return;
      navLinks.classList.toggle("open", open);
      burger.setAttribute("aria-expanded", String(open));
    }
    if (burger) burger.addEventListener("click", () => setMenu(!navLinks.classList.contains("open")));
    navA.forEach(a => a.addEventListener("click", () => setMenu(false)));

    /* switch langue */
    $$(".lang-switch button").forEach(b =>
      b.addEventListener("click", () => {
        if (b.dataset.lang === LANG) return;
        LANG = b.dataset.lang === "en" ? "en" : "fr";
        try { localStorage.setItem("issa-lang", LANG); } catch (e) { /* stockage bloqué */ }
        closeModal();
        renderAll();
      }));

    /* thème clair / sombre */
    const tt = $("#theme-toggle");
    if (tt) {
      tt.addEventListener("click", () => { if (window.ISSATheme) window.ISSATheme.toggle(); });
      document.addEventListener("issa:theme", syncTheme);
    }

    /* filtres projets + ouverture des fiches (délégation : survit aux re-rendus) */
    const filters = $("#proj-filters");
    if (filters) filters.addEventListener("click", e => {
      const b = e.target.closest(".fchip");
      if (!b) return;
      PF[b.dataset.filter === "status" ? "status" : "category"] = b.dataset.value;
      PF.expanded = false;
      applyFilters(true);
    });
    const more = $("#proj-more-btn");
    if (more) more.addEventListener("click", () => { PF.expanded = !PF.expanded; applyFilters(true); });
    const grid = $("#proj-grid");
    if (grid) grid.addEventListener("click", e => {
      if (e.target.closest(".proj-link")) return;
      const card = e.target.closest(".proj-card");
      if (!card) return;
      openModal(byId(card.dataset.id), $(".proj-open", card));
    });

    /* modale */
    const overlay = $("#modal-overlay");
    if (overlay) {
      overlay.addEventListener("click", e => { if (e.target === overlay) closeModal(); });
      const m = $(".modal", overlay);
      if (m) m.addEventListener("keydown", trapFocus);
    }
    const mc = $("#modal-close");
    if (mc) mc.addEventListener("click", closeModal);
    document.addEventListener("keydown", e => {
      if (e.key !== "Escape") return;
      if (overlay && overlay.classList.contains("open")) closeModal();
      else if (navLinks && navLinks.classList.contains("open")) { setMenu(false); if (burger) burger.focus(); }
    });

    setupContactForm();
    renderAll();
  });

  /* -------------------------------------------------- formulaire de contact */
  function setupContactForm() {
    const form = $("#contact-form");
    if (!form) return;
    const status = $("#cf-status");
    const CFG = window.JESUS_CONFIG || {};

    form.addEventListener("submit", async e => {
      e.preventDefault();
      const dict = I18N[LANG];
      /* anti-spam : si le champ honeypot (invisible) est rempli, c'est un robot.
         On fait comme si tout allait bien, mais on n'envoie rien. */
      const honey = $("#cf-honey");
      if (honey && honey.value) {
        status.className = "cf-status ok"; status.textContent = dict.form_ok; form.reset(); return;
      }
      const name = $("#cf-name").value.trim();
      const email = $("#cf-email").value.trim();
      const message = $("#cf-message").value.trim();
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      if (!name || !emailOk || !message) {
        status.className = "cf-status err"; status.textContent = dict.form_fill; return;
      }

      const btn = form.querySelector(".cf-submit");
      const prev = btn.textContent;
      btn.disabled = true; btn.textContent = dict.form_sending;
      status.className = "cf-status"; status.textContent = "";

      const to = CFG.contactEmail || (KB.profile.contact && KB.profile.contact.email) || "issa.pfe@gmail.com";
      let delivered = false;

      /* (1) EMAIL DIRECT vers la boîte Gmail d'Issa — via FormSubmit.co :
             gratuit, AUCUNE clé requise (juste l'email). Le message arrive
             directement dans la boîte de réception d'Issa. (La toute première
             fois, Issa reçoit un email de confirmation à valider une fois.) */
      try {
        const res = await fetch("https://formsubmit.co/ajax/" + encodeURIComponent(to), {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({
            name, email, message,
            _subject: `📬 Nouveau message portfolio — ${name}`,
            _template: "table",
          }),
        });
        const data = await res.json();
        if (data && (data.success === true || data.success === "true")) delivered = true;
      } catch (_) { /* réseau indisponible : replis ci-dessous */ }

      /* (2) Web3Forms en plus, si une clé est configurée (optionnel). */
      const key = (CFG.web3formsKey || "").trim();
      if (!delivered && key) {
        try {
          const res = await fetch("https://api.web3forms.com/submit", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({
              access_key: key, name, email, message,
              subject: `Nouveau message portfolio — ${name}`,
              from_name: "Portfolio Issa Lamkharbech",
            }),
          });
          const data = await res.json();
          if (data.success) delivered = true;
        } catch (_) {}
      }

      /* (3) Boîte de réception in-site (Supabase) si configurée : Issa la
             consulte aussi via #boite-issa. */
      const HIST = window.ISSAHistory;
      if (HIST && HIST.sendInboxMessage) {
        try { const r = await HIST.sendInboxMessage(name, email, message); if (r.ok) delivered = true; } catch (_) {}
      }

      btn.disabled = false; btn.textContent = prev;

      if (delivered) {
        status.className = "cf-status ok"; status.textContent = dict.form_ok;
        form.reset();
        return;
      }

      /* (4) Repli universel : ouvre le logiciel de messagerie du visiteur. */
      const subject = encodeURIComponent(`Message de ${name} — portfolio`);
      const body = encodeURIComponent(`${message}\n\n— ${name} (${email})`);
      window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
      status.className = "cf-status ok"; status.textContent = dict.form_ok;
    });
  }
})();
