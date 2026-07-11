/* ============================================================================
   ISSA LAMKHARBECH — Portfolio : logique du site
   - Bilingue FR/EN (tout le contenu vient de JESUS_KB, la même base que Jesus)
   - Animations : preloader, reveal au scroll, compteurs, machine à écrire,
     timeline, barres de langues, modals projets, ruban défilant.
   ============================================================================ */

(function () {
  "use strict";
  const KB = window.JESUS_KB || (typeof JESUS_KB !== "undefined" ? JESUS_KB : null);
  if (!KB) { console.error("JESUS_KB introuvable : chargez js/kb.js avant js/main.js"); return; }
  const $ = (s, c) => (c || document).querySelector(s);
  const $$ = (s, c) => Array.from((c || document).querySelectorAll(s));
  const t = (field, lang) => (field && typeof field === "object" && !Array.isArray(field)) ? (field[lang] || field.fr || "") : field;

  let LANG = localStorage.getItem("issa-lang") || "fr";

  /* ------------------------------------------------ dictionnaire interface */
  const I18N = {
    fr: {
      nav_home: "Accueil", nav_about: "Qui est Issa ?", nav_edu: "Parcours",
      nav_stages: "Stages", nav_projects: "Projets", nav_skills: "Compétences",
      nav_contact: "Contact", nav_chat: "Parler à ISSA 💬",
      hero_kicker: "Disponible pour une alternance — septembre 2026",
      hero_hello: "Bonjour, je suis",
      hero_desc: "Élève ingénieur Arts et Métiers spécialisé en Intelligence Artificielle, robotique et systèmes industriels intelligents. Je conçois des solutions GenAI, des jumeaux numériques et des systèmes temps réel pour l'industrie.",
      hero_btn_projects: "Découvrir mes projets", hero_btn_chat: "Discuter avec ISSA 💬",
      stat_projects: "Projets réalisés", stat_stages: "Stages en entreprise",
      stat_certifs: "Certifications", stat_langs: "Langues parlées",
      card_sub: "Élève ingénieur ENSAM — AI Engineer",
      card_li1: "Aix-en-Provence, France", card_li2: "IA Générative, LLMs & RAG",
      card_li3: "Jumeaux numériques & robotique", card_li4: "Alternance dès septembre 2026",
      about_tag: "À propos", about_title: "Qui est Issa ?",
      about_sub: "Un profil à la croisée de l'IA, de la robotique et de l'Industrie 4.0.",
      about_h3: "Ingénieur en devenir, passionné d'IA appliquée à l'industrie",
      about_obj_label: "Objectif :",
      af1: "IA Générative & LLMs", af2: "Robotique & Jumeaux numériques",
      edu_tag: "Formation", edu_title: "Mon parcours scolaire",
      edu_sub: "Des classes préparatoires ENSAM au double diplôme Arts et Métiers à Aix-en-Provence.",
      stages_tag: "Expériences", stages_title: "Mes stages en entreprise",
      stages_sub: "Deux expériences industrielles complémentaires : l'ingénierie IA chez Capgemini Engineering et la gestion de projet de construction chez JESA.",
      stage_env: "Environnement", stage_results: "Points clés",
      projects_tag: "Portfolio", projects_title: "Mes projets",
      projects_sub: "Cinq projets détaillés — IA embarquée, jumeaux numériques, systèmes multi-agents et Deep Learning. Cliquez sur un projet pour tout savoir.",
      proj_more: "Voir les détails", proj_group: "Groupe", proj_solo: "Individuel",
      proj_cv_yes: "Spécifié au CV", proj_cv_no: "Hors CV",
      modal_team: "Équipe", modal_sup: "Encadrement", modal_tech: "Technologies",
      modal_metrics: "Résultats & métriques", modal_period: "Période", modal_duration: "Durée",
      skills_tag: "Expertise", skills_title: "Mes compétences",
      skills_sub: "Toutes les compétences listées dans mes CV, organisées par domaine.",
      certif_title: "Licences & certifications", extra_title: "Vie associative",
      langs_title: "Langues",
      contact_tag: "Contact", contact_title: "Travaillons ensemble !",
      contact_sub: "Je recherche une alternance d'un an en IA, Data Science et Industrie 4.0 à partir de septembre 2026. Discutons de vos projets — ou posez vos questions à ISSA, mon assistant IA.",
      contact_chat: "Poser une question à ISSA",
      form_title: "✉️ Laissez-moi un message",
      form_sub: "Écrivez-moi directement depuis le site : je reçois votre message et vous réponds vite.",
      form_name: "Votre nom", form_email: "Votre email", form_message: "Votre message…",
      form_send: "Envoyer le message",
      form_sending: "Envoi en cours…",
      form_ok: "✅ Merci ! Votre message a bien été envoyé. Je vous répondrai vite.",
      form_err: "⚠️ L'envoi a échoué. Réessayez ou écrivez-moi directement par email.",
      form_fill: "Merci de remplir votre nom, un email valide et un message.",
      form_or: "ou contactez-moi directement",
      form_quick_mail: "Par email", form_quick_sms: "Par SMS",
      cc_mail: "Email", cc_phone: "Téléphone", cc_loc: "Localisation", cc_li: "LinkedIn",
      footer_made: "Conçu avec", footer_by: "— Portfolio d'Issa Lamkharbech",
      jesus_status: "En ligne — répond instantanément",
      roles: ["Élève ingénieur Arts et Métiers", "AI Engineer — GenAI & LLMs", "Data Science & Machine Learning", "Robotique & Jumeaux numériques", "Industrie 4.0"]
    },
    en: {
      nav_home: "Home", nav_about: "Who is Issa?", nav_edu: "Education",
      nav_stages: "Internships", nav_projects: "Projects", nav_skills: "Skills",
      nav_contact: "Contact", nav_chat: "Talk to ISSA 💬",
      hero_kicker: "Available for an apprenticeship — September 2026",
      hero_hello: "Hi, I am",
      hero_desc: "Arts et Métiers engineering student specialized in Artificial Intelligence, robotics and intelligent industrial systems. I build GenAI solutions, digital twins and real-time systems for industry.",
      hero_btn_projects: "Explore my projects", hero_btn_chat: "Chat with ISSA 💬",
      stat_projects: "Completed projects", stat_stages: "Company internships",
      stat_certifs: "Certifications", stat_langs: "Spoken languages",
      card_sub: "ENSAM engineering student — AI Engineer",
      card_li1: "Aix-en-Provence, France", card_li2: "Generative AI, LLMs & RAG",
      card_li3: "Digital twins & robotics", card_li4: "Apprenticeship from September 2026",
      about_tag: "About", about_title: "Who is Issa?",
      about_sub: "A profile at the crossroads of AI, robotics and Industry 4.0.",
      about_h3: "Engineer in the making, passionate about AI applied to industry",
      about_obj_label: "Goal:",
      af1: "Generative AI & LLMs", af2: "Robotics & Digital twins",
      edu_tag: "Education", edu_title: "My educational background",
      edu_sub: "From ENSAM preparatory classes to the Arts et Métiers double degree in Aix-en-Provence.",
      stages_tag: "Experience", stages_title: "My internships",
      stages_sub: "Two complementary industrial experiences: AI engineering at Capgemini Engineering and construction project management at JESA.",
      stage_env: "Environment", stage_results: "Highlights",
      projects_tag: "Portfolio", projects_title: "My projects",
      projects_sub: "Five detailed projects — embedded AI, digital twins, multi-agent systems and Deep Learning. Click any project to know everything.",
      proj_more: "View details", proj_group: "Group", proj_solo: "Individual",
      proj_cv_yes: "Listed on CV", proj_cv_no: "Not on CV",
      modal_team: "Team", modal_sup: "Supervision", modal_tech: "Technologies",
      modal_metrics: "Results & metrics", modal_period: "Period", modal_duration: "Duration",
      skills_tag: "Expertise", skills_title: "My skills",
      skills_sub: "All the skills listed on my CVs, organized by domain.",
      certif_title: "Licenses & certifications", extra_title: "Extracurricular",
      langs_title: "Languages",
      contact_tag: "Contact", contact_title: "Let's work together!",
      contact_sub: "I'm looking for a one-year apprenticeship in AI, Data Science and Industry 4.0 starting September 2026. Let's talk — or ask ISSA, my AI assistant, anything about me.",
      contact_chat: "Ask ISSA a question",
      form_title: "✉️ Leave me a message",
      form_sub: "Write to me directly from the site: I receive your message and reply quickly.",
      form_name: "Your name", form_email: "Your email", form_message: "Your message…",
      form_send: "Send message",
      form_sending: "Sending…",
      form_ok: "✅ Thank you! Your message has been sent. I'll reply soon.",
      form_err: "⚠️ Sending failed. Please retry or email me directly.",
      form_fill: "Please fill in your name, a valid email and a message.",
      form_or: "or reach me directly",
      form_quick_mail: "By email", form_quick_sms: "By SMS",
      cc_mail: "Email", cc_phone: "Phone", cc_loc: "Location", cc_li: "LinkedIn",
      footer_made: "Built with", footer_by: "— Issa Lamkharbech's portfolio",
      jesus_status: "Online — instant answers",
      roles: ["Arts et Métiers engineering student", "AI Engineer — GenAI & LLMs", "Data Science & Machine Learning", "Robotics & Digital twins", "Industry 4.0"]
    }
  };

  const PROJ_ICONS = { drone: "🚁", mir100: "🤖", salle_connectee: "🏫", multi_agents: "🛰️", cat_emotion: "🐱", portfolio_ia: "💬" };
  const SKILL_ICONS = { genai_llms: "🧠", data_ml: "📊", data_engineering: "🔧", dev: "💻", cloud_devops: "☁️", industry40: "🏭", management: "📋", soft_skills: "🤝" };
  const LANG_PCT = { "Langue maternelle": 100, "Native language": 100, "Niveau C1 (excellent)": 88, "C1 level (excellent)": 88, "Niveau B2 (professionnel)": 72, "B2 level (professional)": 72, "Niveau A1": 25, "A1 level": 25 };

  /* ----------------------------------------------------------- i18n statique */
  function applyI18n() {
    const dict = I18N[LANG];
    $$("[data-i18n]").forEach(el => {
      const k = el.getAttribute("data-i18n");
      if (dict[k] !== undefined) el.innerHTML = dict[k];
    });
    $$("[data-i18n-ph]").forEach(el => {
      const k = el.getAttribute("data-i18n-ph");
      if (dict[k] !== undefined) el.setAttribute("placeholder", dict[k]);
    });
    document.documentElement.setAttribute("lang", LANG);
    document.documentElement.setAttribute("data-lang", LANG);
    $$(".lang-switch button").forEach(b => b.classList.toggle("on", b.dataset.lang === LANG));
    const st = $("[data-jesus-i18n='status']");
    if (st) st.textContent = dict.jesus_status;
  }

  /* --------------------------------------------------------- rendu dynamique */
  function renderAbout() {
    $("#about-summary").textContent = t(KB.profile.summary, LANG);
    $("#about-objective").textContent = t(KB.profile.objective, LANG);
    const badges = $("#about-badges");
    badges.innerHTML = "";
    const hb = KB.profile.hobbies[LANG] || [];
    [...hb].forEach(h => {
      const b = document.createElement("span");
      b.className = "badge"; b.textContent = h; badges.appendChild(b);
    });
  }

  function renderEducation() {
    const box = $("#timeline");
    box.innerHTML = "";
    const icons = ["🎓", "⚙️", "📐", "🏫"];
    KB.education.forEach((e, i) => {
      const div = document.createElement("div");
      div.className = "tl-item reveal";
      div.innerHTML = `
        <div class="tl-dot">${icons[i] || "🎓"}</div>
        <div class="tl-card">
          <span class="tl-period">${t(e.period, LANG)}</span>
          <h4>${t(e.degree, LANG)}</h4>
          <div class="where">${t(e.school, LANG)}</div>
        </div>`;
      box.appendChild(div);
    });
  }

  function renderInternships() {
    const box = $("#stage-grid");
    box.innerHTML = "";
    KB.internships.forEach((s, i) => {
      const card = document.createElement("article");
      card.className = "stage-card reveal";
      card.setAttribute("data-delay", String(i + 1));
      card.innerHTML = `
        <div class="stage-top">
          <span class="stage-type">${t(s.type, LANG)}</span>
          <span class="stage-duration">⏱ ${t(s.duration, LANG)} · ${t(s.period, LANG)}</span>
        </div>
        <h3>${t(s.title, LANG)}</h3>
        <div class="stage-company">🏢 ${t(s.company, LANG)}</div>
        <p class="stage-desc">${t(s.description, LANG)}</p>
        <div>
          <h4 style="font-size:.85rem;margin-bottom:8px;">${I18N[LANG].stage_env}</h4>
          <div class="chips">${s.technologies.map(x => `<span class="chip">${x}</span>`).join("")}</div>
        </div>
        <div class="metric-row">${s.metrics[LANG].map(m => `<span class="metric">${m}</span>`).join("")}</div>`;
      box.appendChild(card);
    });
  }

  function shortDesc(p) {
    const d = t(p.description, LANG);
    const cut = d.indexOf(". ", 120);
    return cut > 0 ? d.slice(0, cut + 1) : d.slice(0, 180) + "…";
  }

  function renderProjects() {
    const box = $("#proj-grid");
    box.innerHTML = "";
    KB.projects.forEach((p, i) => {
      const card = document.createElement("article");
      card.className = "proj-card reveal";
      card.setAttribute("data-delay", String((i % 3) + 1));
      const group = (p.team && p.team.length > 1);
      card.innerHTML = `
        <div class="proj-banner pb-${i + 1}">${PROJ_ICONS[p.id] || "🚀"}</div>
        <div class="proj-body">
          <div class="proj-meta">
            <span class="pm">${t(p.period, LANG)}</span>
            <span class="pm">${group ? I18N[LANG].proj_group + " · " + p.team.length : I18N[LANG].proj_solo}</span>
            <span class="pm ${p.in_cv ? "" : "warm"}">${p.in_cv ? I18N[LANG].proj_cv_yes : I18N[LANG].proj_cv_no}</span>
          </div>
          <h3>${t(p.name, LANG)}</h3>
          <p class="short">${shortDesc(p)}</p>
          <span class="proj-more">${I18N[LANG].proj_more} <span>→</span></span>
        </div>`;
      card.addEventListener("click", () => openModal(p));
      box.appendChild(card);
    });
  }

  function openModal(p) {
    const dict = I18N[LANG];
    const overlay = $("#modal-overlay");
    $("#modal-content").innerHTML = `
      <h3>${PROJ_ICONS[p.id] || "🚀"} ${t(p.name, LANG)}</h3>
      <div class="proj-meta">
        <span class="pm">${dict.modal_period} : ${t(p.period, LANG)}</span>
        <span class="pm">${dict.modal_duration} : ${t(p.duration, LANG)}</span>
        <span class="pm">${t(p.team_type, LANG)}</span>
        <span class="pm ${p.in_cv ? "" : "warm"}">${p.in_cv ? dict.proj_cv_yes : dict.proj_cv_no}</span>
      </div>
      <div class="chips" style="margin-bottom:6px;"><span class="chip">📌 ${t(p.context, LANG)}</span></div>
      <p class="desc">${t(p.description, LANG)}</p>
      ${p.team && p.team.length ? `<h4>👥 ${dict.modal_team}</h4>
        <div class="team-list">${p.team.map(m => `<span class="team-pill"><span class="tp-av">${m.split(" ").map(w => w[0]).slice(0, 2).join("")}</span>${m}</span>`).join("")}</div>` : ""}
      ${p.supervisors && p.supervisors.length ? `<h4>🎓 ${dict.modal_sup}</h4>
        <div class="team-list">${p.supervisors.map(m => `<span class="team-pill">${m}</span>`).join("")}</div>` : ""}
      <h4>🛠️ ${dict.modal_tech}</h4>
      <div class="chips">${p.technologies.map(x => `<span class="chip">${x}</span>`).join("")}</div>
      <h4>📊 ${dict.modal_metrics}</h4>
      <div class="metric-row">${p.metrics[LANG].map(m => `<span class="metric">${m}</span>`).join("")}</div>`;
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    $("#modal-overlay").classList.remove("open");
    document.body.style.overflow = "";
  }

  function renderSkills() {
    const box = $("#skill-grid");
    box.innerHTML = "";
    Object.entries(KB.skills).forEach(([key, cat], i) => {
      const card = document.createElement("div");
      card.className = "skill-card reveal";
      card.setAttribute("data-delay", String((i % 3) + 1));
      const items = (key === "soft_skills" && cat["items_" + LANG]) ? cat["items_" + LANG] : cat.items;
      card.innerHTML = `
        <div class="sk-ic">${SKILL_ICONS[key] || "✨"}</div>
        <h3>${t(cat.label, LANG)}</h3>
        <div class="chips">${items.map(x => `<span class="chip">${x}</span>`).join("")}</div>`;
      box.appendChild(card);
    });
  }

  function renderMarquee() {
    const track = $("#marquee-track");
    const skills = [];
    Object.values(KB.skills).forEach(cat => skills.push(...cat.items.slice(0, 4)));
    const seq = skills.map(s => `<span>${s}</span>`).join("");
    track.innerHTML = seq + seq; /* doublé pour la boucle infinie */
  }

  function renderCertifsExtra() {
    const cbox = $("#certif-list");
    cbox.innerHTML = "";
    KB.certifications.forEach(c => {
      cbox.insertAdjacentHTML("beforeend", `
        <div class="list-row">
          <div class="lr-ic">📜</div>
          <div><strong>${c.name}</strong><small>${t(c.issuer, LANG)} — ${t(c.date, LANG)}</small></div>
        </div>`);
    });
    const ebox = $("#extra-list");
    ebox.innerHTML = "";
    KB.extracurricular.forEach(x => {
      ebox.insertAdjacentHTML("beforeend", `
        <div class="list-row">
          <div class="lr-ic">🤝</div>
          <div><strong>${t(x.role, LANG)} — ${t(x.org, LANG)}</strong><small>${t(x.date, LANG)} · ${t(x.description, LANG)}</small></div>
        </div>`);
    });
    const lbox = $("#lang-bars");
    lbox.innerHTML = "";
    KB.profile.languages_spoken.forEach(l => {
      const lvl = t(l.level, LANG);
      const pct = LANG_PCT[lvl] || 50;
      lbox.insertAdjacentHTML("beforeend", `
        <div class="lang-bar">
          <div class="lb-top"><span>${t(l.name, LANG)}</span><span>${lvl}</span></div>
          <div class="lb-track"><div class="lb-fill" data-pct="${pct}"></div></div>
        </div>`);
    });
  }

  function renderContact() {
    const c = KB.profile.contact;
    $("#cc-mail small").textContent = c.email;
    $("#cc-phone small").textContent = c.phone;
    $("#cc-loc small").textContent = t(c.location, LANG);
    $("#cc-mail").setAttribute("href", "mailto:" + c.email);
    $("#cc-phone").setAttribute("href", "tel:" + c.phone.replace(/\s/g, ""));
    $("#cc-li").setAttribute("href", c.linkedin);
    /* boutons rapides email / SMS directement depuis le site */
    const phoneIntl = c.phone.replace(/\s/g, "").replace(/^0/, "+33");
    const qm = $("#cf-quick-mail"), qs = $("#cf-quick-sms");
    if (qm) qm.setAttribute("href", "mailto:" + c.email + "?subject=" +
      encodeURIComponent(LANG === "fr" ? "Contact depuis votre portfolio" : "Contact from your portfolio"));
    if (qs) qs.setAttribute("href", "sms:" + phoneIntl);
  }

  function renderAll() {
    applyI18n();
    renderAbout();
    renderEducation();
    renderInternships();
    renderProjects();
    renderSkills();
    renderMarquee();
    renderCertifsExtra();
    renderContact();
    observeReveals();
    restartTyping();
    document.dispatchEvent(new Event("jesus:langchange"));
  }

  /* ------------------------------------------------------------- animations */
  let revealObserver;
  function observeReveals() {
    if (revealObserver) revealObserver.disconnect();
    revealObserver = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (en.isIntersecting) {
          en.target.classList.add("visible");
          /* barres de langues */
          en.target.querySelectorAll(".lb-fill").forEach(f => f.style.width = f.dataset.pct + "%");
          revealObserver.unobserve(en.target);
        }
      });
    }, { threshold: 0.12 });
    $$(".reveal").forEach(el => revealObserver.observe(el));
    $$(".list-card").forEach(el => revealObserver.observe(el));
  }

  /* compteurs animés */
  function animateCounters() {
    $$(".stat .num").forEach(el => {
      const target = parseInt(el.dataset.target, 10);
      let cur = 0;
      const step = Math.max(1, Math.round(target / 40));
      const tick = () => {
        cur = Math.min(target, cur + step);
        el.textContent = cur;
        if (cur < target) requestAnimationFrame(tick);
      };
      const io = new IntersectionObserver(en => {
        if (en[0].isIntersecting) { tick(); io.disconnect(); }
      });
      io.observe(el);
    });
  }

  /* machine à écrire */
  let typeTimer;
  function restartTyping() {
    clearTimeout(typeTimer);
    const el = $("#typed");
    if (!el) return;
    const roles = I18N[LANG].roles;
    let ri = 0, ci = 0, deleting = false;
    (function loop() {
      const word = roles[ri];
      el.textContent = word.slice(0, ci);
      if (!deleting) {
        if (ci++ < word.length) { typeTimer = setTimeout(loop, 55); }
        else { deleting = true; typeTimer = setTimeout(loop, 1700); }
      } else {
        if (ci-- > 0) { typeTimer = setTimeout(loop, 28); }
        else { deleting = false; ri = (ri + 1) % roles.length; typeTimer = setTimeout(loop, 350); }
      }
    })();
  }

  /* -------------------------------------------------------------- démarrage */
  document.addEventListener("DOMContentLoaded", () => {
    /* preloader : on le masque PUIS on le retire complètement du DOM, sinon il
       resterait un calque invisible (pointer-events) qui bloque les clics et la
       saisie — notamment dans le chat. */
    setTimeout(() => {
      const pl = $("#preloader");
      if (!pl) return;
      pl.classList.add("done");
      setTimeout(() => { if (pl && pl.parentNode) pl.remove(); }, 800);
    }, 700);

    /* nav : ombre + progression + section active */
    const nav = $(".nav");
    const progress = $("#scroll-progress");
    const sections = $$("section[id]");
    const navA = $$(".nav-links a");
    window.addEventListener("scroll", () => {
      nav.classList.toggle("scrolled", window.scrollY > 40);
      const h = document.documentElement;
      progress.style.width = (h.scrollTop / (h.scrollHeight - h.clientHeight) * 100) + "%";
      let cur = "";
      sections.forEach(s => { if (window.scrollY >= s.offsetTop - 220) cur = s.id; });
      navA.forEach(a => a.classList.toggle("active", a.getAttribute("href") === "#" + cur));
    }, { passive: true });

    /* burger mobile */
    $("#burger").addEventListener("click", () => $("#nav-links").classList.toggle("open"));
    navA.forEach(a => a.addEventListener("click", () => $("#nav-links").classList.remove("open")));

    /* switch langue */
    $$(".lang-switch button").forEach(b =>
      b.addEventListener("click", () => {
        LANG = b.dataset.lang;
        localStorage.setItem("issa-lang", LANG);
        renderAll();
      }));

    /* modal */
    $("#modal-overlay").addEventListener("click", e => { if (e.target.id === "modal-overlay") closeModal(); });
    $("#modal-close").addEventListener("click", closeModal);
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

    setupContactForm();
    renderAll();
    animateCounters();
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

      let delivered = false;

      /* (1) Boîte de réception intégrée au site (Supabase) : le message est
             enregistré et consultable par Issa depuis la boîte admin in-site. */
      const HIST = window.ISSAHistory;
      if (HIST && HIST.enabled && HIST.sendInboxMessage) {
        const r = await HIST.sendInboxMessage(name, email, message);
        if (r.ok) delivered = true;
      }

      /* (2) Email (optionnel) via Web3Forms si une clé est configurée. */
      const key = (CFG.web3formsKey || "").trim();
      if (key) {
        try {
          const res = await fetch("https://api.web3forms.com/submit", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({
              access_key: key, name, email, message,
              subject: `Nouveau message portfolio — ${name}`,
              from_name: "Portfolio Issa Lamkharbech"
            })
          });
          const data = await res.json();
          if (data.success) delivered = true;
        } catch (_) { /* on garde le repli mailto ci-dessous */ }
      }

      btn.disabled = false; btn.textContent = prev;

      if (delivered) {
        status.className = "cf-status ok"; status.textContent = dict.form_ok;
        form.reset();
        return;
      }

      /* (3) Repli universel : ouvre le logiciel de messagerie du visiteur. */
      const to = CFG.contactEmail || "issa.alternance@gmail.com";
      const subject = encodeURIComponent(`Message de ${name} — portfolio`);
      const body = encodeURIComponent(`${message}\n\n— ${name} (${email})`);
      window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
      status.className = "cf-status ok"; status.textContent = dict.form_ok;
    });
  }
})();
