/* ============================================================================
   JESUS — moteur du chatbot (portage JavaScript de chatbot/jesus_chatbot.py)
   Tourne 100% dans le navigateur : réponses instantanées, aucune API externe.
   Source de vérité : chatbot/knowledge_base.json (exporté vers js/kb.js).
   ============================================================================ */

(function () {
  "use strict";

  /* ---------- Étape 1 : détection de langue ---------- */
  const FR_HINTS = new Set(("quel quelle quels quelles qui est quoi combien ou où comment pourquoi quand le la les un une des du de et il elle sur avec dans son sa ses parle moi dis donne cest stage projet projets duree durée entreprise equipe équipe compétences competences parcours études etudes formation langues bonjour salut merci").split(" "));
  const EN_HINTS = new Set(("what who which how when where why is are was the a an of and his her about tell me did does do with on in at long many internship internships project projects skills company team duration education background languages hello hi thanks please can you").split(" "));

  function detectLanguage(text) {
    const words = (text.toLowerCase().match(/[a-zà-ÿ']+/g)) || [];
    let fr = 0, en = 0;
    for (const w of words) { if (FR_HINTS.has(w)) fr++; if (EN_HINTS.has(w)) en++; }
    return en > fr ? "en" : "fr";
  }

  /* ---------- Étape 2 : normalisation ---------- */
  function normalize(text) {
    return text.toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ").trim();
  }

  /* ---------- Étape 3 : entités (mêmes alias que le moteur Python) ---------- */
  const ENTITY_ALIASES = {
    capgemini: ["capgemini", "capgemini engineering", "mg2", "stage ingenieur", "engineering internship", "fem", "elements finis", "finite element", "mecanique computationnelle", "computational mechanics", "peugeot", "pointnet", "gemini"],
    jesa: ["jesa", "jorf lasfar", "stage d observation", "observation internship", "ahf", "acide fluorhydrique", "hydrofluoric", "ocp", "worley", "sogea", "phileas", "innovx", "safety walk", "hse", "stage d initiation"],
    drone: ["drone", "bi rotor", "birotor", "bimoteur", "bi moteur", "banc d essai", "test bench", "maintenance predictive", "predictive maintenance", "detection de defauts", "fault detection", "arduino", "drone ai"],
    mir100: ["mir100", "mir 100", "agv", "jumeau numerique mir", "logistique", "logistics", "robot mobile", "cobot", "bras ur", "qr code", "priorisation", "mission"],
    salle_connectee: ["salle connectee", "salle informatique", "connected classroom", "classroom", "gi iads", "giads", "esp32", "esp8266", "laravel", "salle intelligente", "smart room", "industrie 4 0 salle", "lampe", "lamp"],
    multi_agents: ["multi agents", "multi agent", "multiagents", "cartographie", "mapping", "surveillance", "slam", "yolo", "yolov8", "webots", "e puck", "epuck", "swarm", "robots cooperatifs"],
    cat_emotion: ["chat", "chats", "cat", "cats", "emotion", "emotions", "felin", "miaulement", "meow", "cat emotion", "sante des chats", "tkinter"],
    portfolio_ia: ["portfolio", "site web", "website", "site", "le site", "ce site", "this site", "comment le site", "comment ce site", "comment est fait le site", "comment il est fait", "comment tu es fait", "construit", "construction", "construction du site", "how are you built", "how is the site", "how the site", "how was the site", "how was it built", "ce chatbot", "this chatbot", "toi meme", "yourself", "supabase", "groq", "cloudflare", "assistant ia", "ai assistant", "ce projet", "this project", "site actuel"],
    education: ["parcours", "etudes", "formation", "formations", "scolaire", "ecole", "education", "school", "studies", "background", "ensam", "arts et metiers", "bac", "baccalaureat", "prepa", "preparatoire", "diplome", "degree", "aix en provence", "meknes"],
    skills: ["competences", "skills", "maitrise", "technologies", "stack", "outils", "tools", "langages", "sait faire", "capable"],
    languages: ["langues", "languages", "arabe", "arabic", "francais", "french", "anglais", "english", "espagnol", "spanish", "parle quelles"],
    certifications: ["certification", "certifications", "certificat", "certificats", "certificate", "mitx", "edx", "coursera", "ibm", "lean six sigma", "yellow belt", "eclee", "agile", "scrum"],
    extracurricular: ["parascolaire", "extrascolaire", "club", "clubs", "associatif", "association", "alhayat", "caravan", "pompage solaire", "solar", "extracurricular", "volunteer", "benevolat"],
    contact: ["contact", "contacter", "email", "mail", "meil", "emai", "e mail", "adresse mail", "adresse email", "courriel", "gmail", "telephone", "telephon", "telefone", "numero", "numero de tel", "phone", "num", "tel", "tele", "gsm", "portable", "mobile", "whatsapp", "whatsap", "wtsp", "appeler", "call", "linkedin", "linked in", "lkdn", "github", "git hub", "joindre", "reach", "coordonnees", "adresse", "localisation", "ville", "habite", "reside"],
    objective: ["alternance", "apprenticeship", "recherche", "looking for", "disponible", "available", "objectif", "objective", "embauche", "recruter", "hire"],
    about: ["qui est issa", "qui es tu", "who is issa", "presente", "presentation", "profil", "profile", "about", "a propos", "lamkharbech", "issa", "lui", "him"],
    projects_list: ["projets", "projects", "realisations", "portfolio", "travaux", "works"],
    internships_list: ["stages", "internships", "experiences", "experience professionnelle", "work experience", "entreprises", "companies"]
  };

  /* ---------- Étape 4 : intentions ---------- */
  const INTENT_KEYWORDS = {
    duration: ["duree", "combien de temps", "how long", "duration", "periode", "period", "quand", "when", "date", "dates", "mois", "months", "lasted"],
    company: ["entreprise", "societe", "company", "employeur", "employer", "chez qui", "chez quelle", "where did", "organisation", "organization"],
    team: ["equipe", "team", "groupe", "group", "seul", "alone", "solo", "binome", "avec qui", "with whom", "membres", "members", "combien de personnes", "how many people", "individuel", "individual", "encadre", "supervised", "encadrant"],
    technologies: ["technologie", "technologies", "technos", "outils", "tools", "stack", "langage", "language utilise", "framework", "librairies", "libraries", "utilise quoi", "built with", "developpe avec"],
    metrics: ["resultat", "resultats", "results", "metriques", "metrics", "performance", "performances", "accuracy", "precision", "score", "kpi", "chiffres"],
    cv_status: ["cv", "resume", "specifie", "mentionne", "figure", "listed", "specified"],
    description: ["decris", "describe", "detail", "details", "explique", "explain", "parle moi", "tell me about", "contenu", "content", "quoi exactement", "en quoi consiste", "what is", "c est quoi", "raconte", "resume", "resumer", "resume moi", "synthese", "synthetise", "en bref", "bref", "en gros", "grandes lignes", "quelques mots", "apercu", "overview", "summarize", "summarise", "sum up", "in short", "in brief"]
  };

  const KB = window.JESUS_KB || (typeof JESUS_KB !== "undefined" ? JESUS_KB : null);
  if (!KB) { console.error("JESUS_KB introuvable : chargez js/kb.js avant js/jesus.js"); return; }

  const aliasIndex = [];
  for (const [entity, aliases] of Object.entries(ENTITY_ALIASES)) {
    for (const a of aliases) aliasIndex.push([normalize(a), entity]);
  }
  aliasIndex.sort((x, y) => y[0].length - x[0].length);

  const t = (field, lang) => (field && typeof field === "object" && !Array.isArray(field)) ? (field[lang] || field.fr || "") : field;
  const item = (kind, id) => KB[kind].find(x => x.id === id) || null;
  const PROJECT_IDS = new Set(KB.projects.map(p => p.id));
  const STAGE_IDS = new Set(KB.internships.map(s => s.id));

  function findEntities(normQ) {
    const found = [];
    const padded = ` ${normQ} `;
    for (const [alias, entity] of aliasIndex) {
      if (padded.includes(` ${alias} `) || (alias.length > 5 && normQ.includes(alias))) {
        if (!found.includes(entity)) found.push(entity);
      }
    }
    return found;
  }

  function findIntents(normQ) {
    const out = [];
    for (const [intent, kws] of Object.entries(INTENT_KEYWORDS)) {
      if (kws.some(k => normQ.includes(normalize(k)))) out.push(intent);
    }
    return out;
  }

  /* Lien du site affiché en Markdown : le texte visible est « lamkharbechissa.com »
     mais le lien pointe vers l'URL réelle (GitHub Pages). Rendu par mdToHtml. */
  function siteLink(p) {
    return `[${p.live_label || "lamkharbechissa.com"}](${p.live_url})`;
  }

  /* ---------- Fiches ---------- */
  function projectCard(p, lang, intents) {
    const L = lang === "fr";
    const lines = [`🚀 **${t(p.name, lang)}**`, `📌 ${t(p.context, lang)}`];
    lines.push((L ? "🗓️ Période : " : "🗓️ Period: ") + t(p.period, lang) + " — " + (L ? "durée : " : "duration: ") + t(p.duration, lang));
    lines.push("👥 " + t(p.team_type, lang) + (p.team && p.team.length ? " — " + p.team.join(", ") : ""));
    if (p.supervisors && p.supervisors.length) lines.push((L ? "🎓 Encadré par : " : "🎓 Supervised by: ") + p.supervisors.join(", "));
    lines.push((L ? "📄 Spécifié dans le CV : " : "📄 Listed on the CV: ") + (p.in_cv ? (L ? "oui" : "yes") : (L ? "non" : "no")));
    if (p.live_url) lines.push((L ? "🌐 Site en ligne : " : "🌐 Live site: ") + siteLink(p));
    if (!intents.length || intents.includes("description")) lines.push("", t(p.description, lang));
    /* « Comment le site a été construit » (uniquement pour le projet portfolio) */
    if (p.how_built && (!intents.length || intents.includes("description"))) lines.push("", t(p.how_built, lang));
    lines.push("", (L ? "🛠️ Technologies : " : "🛠️ Technologies: ") + p.technologies.join(", "));
    lines.push((L ? "📊 Résultats : " : "📊 Results: ") + p.metrics[lang].join(" · "));
    return lines.join("\n");
  }

  function internshipCard(s, lang, intents) {
    const L = lang === "fr";
    const lines = [`💼 **${t(s.title, lang)}**`];
    lines.push((L ? "🏷️ Type : " : "🏷️ Type: ") + t(s.type, lang));
    lines.push((L ? "🏢 Entreprise : " : "🏢 Company: ") + t(s.company, lang));
    lines.push((L ? "🗓️ Période : " : "🗓️ Period: ") + t(s.period, lang) + " — " + (L ? "durée : " : "duration: ") + t(s.duration, lang));
    if (!intents.length || intents.includes("description")) lines.push("", t(s.description, lang));
    if (intents.includes("company")) lines.push("", t(s.company_details, lang));
    lines.push("", (L ? "🛠️ Environnement : " : "🛠️ Environment: ") + s.technologies.join(", "));
    lines.push((L ? "📊 Points clés : " : "📊 Highlights: ") + s.metrics[lang].join(" · "));
    return lines.join("\n");
  }

  /* ---------- Quelle coordonnée précise est demandée ? ----------
     Comprend les abréviations et le langage familier : « num », « tél »,
     « gsm », « portable », « whatsapp » = numéro de téléphone ; « mail »,
     « courriel », « gmail » = email ; etc. Renvoie null si l'utilisateur
     veut TOUTES les coordonnées (ex. « comment te contacter ? »). */
  function contactField(normQ) {
    const p = ` ${normQ} `;
    const any = (...ws) => ws.some(w => p.includes(` ${w} `) || (w.length > 4 && normQ.includes(w)));
    if (any("numero", "num", "tel", "tele", "telephone", "telephon", "telefone", "gsm", "portable", "mobile", "whatsapp", "whatsap", "wtsp", "appeler", "call", "phone")) return "phone";
    if (any("email", "e mail", "mail", "meil", "emai", "courriel", "gmail", "ecrire")) return "email";
    if (any("linkedin", "linked in", "lkdn")) return "linkedin";
    if (any("github", "git hub")) return "github";
    if (any("localisation", "adresse", "habite", "ville", "reside", "location", "city", "based")) return "location";
    return null;
  }

  /* ---------- Réponses ciblées ---------- */
  function answerFor(entity, lang, intents, normQ) {
    const L = lang === "fr";
    normQ = normQ || "";

    if (PROJECT_IDS.has(entity)) {
      const p = item("projects", entity);
      const name = t(p.name, lang);
      if (intents.length && !intents.includes("description")) {
        const bits = [];
        if (intents.includes("duration"))
          bits.push(L ? `Le projet « ${name} » s'est déroulé sur la période : ${t(p.period, lang)} (durée : ${t(p.duration, lang)}).`
                      : `The project “${name}” took place over: ${t(p.period, lang)} (duration: ${t(p.duration, lang)}).`);
        if (intents.includes("team")) {
          let msg = L ? `C'est un ${t(p.team_type, lang).toLowerCase()}` : `It is a ${t(p.team_type, lang).toLowerCase()}`;
          if (p.team && p.team.length) msg += L ? `, réalisé par : ${p.team.join(", ")}` : `, carried out by: ${p.team.join(", ")}`;
          if (p.supervisors && p.supervisors.length) msg += L ? `. Encadrement : ${p.supervisors.join(", ")}.` : `. Supervised by: ${p.supervisors.join(", ")}.`;
          bits.push(msg);
        }
        if (intents.includes("technologies"))
          bits.push((L ? "Technologies utilisées : " : "Technologies used: ") + p.technologies.join(", ") + ".");
        if (intents.includes("metrics"))
          bits.push((L ? "Résultats obtenus : " : "Results achieved: ") + p.metrics[lang].join(" · ") + ".");
        if (intents.includes("cv_status"))
          bits.push(p.in_cv ? (L ? "Oui, ce projet est spécifié dans le CV d'Issa." : "Yes, this project is listed on Issa's CV.")
                            : (L ? "Non, ce projet n'est pas spécifié dans le CV d'Issa — il figure dans son dossier de projets." : "No, this project is not listed on Issa's CV — it appears in his project folder."));
        if (intents.includes("company"))
          bits.push(L ? `« ${name} » est un projet académique (${t(p.context, lang)}), pas un stage en entreprise.`
                      : `“${name}” is an academic project (${t(p.context, lang)}), not a company internship.`);
        if (bits.length) return bits.join("\n\n");
      }
      return projectCard(p, lang, intents);
    }

    if (STAGE_IDS.has(entity)) {
      const s = item("internships", entity);
      if (intents.length && !intents.includes("description")) {
        const bits = [];
        if (intents.includes("duration"))
          bits.push(L ? `Ce stage chez ${t(s.company, lang)} a duré ${t(s.duration, lang)} (${t(s.period, lang)}).`
                      : `This internship at ${t(s.company, lang)} lasted ${t(s.duration, lang)} (${t(s.period, lang)}).`);
        if (intents.includes("company")) bits.push(t(s.company, lang) + ". " + t(s.company_details, lang));
        if (intents.includes("technologies")) bits.push((L ? "Environnement : " : "Environment: ") + s.technologies.join(", ") + ".");
        if (intents.includes("metrics")) bits.push(s.metrics[lang].join(" · "));
        if (intents.includes("cv_status")) bits.push(L ? "Oui, ce stage est spécifié dans le CV d'Issa." : "Yes, this internship is listed on Issa's CV.");
        if (bits.length) return bits.join("\n\n");
      }
      return internshipCard(s, lang, intents);
    }

    switch (entity) {
      case "about": {
        const p = KB.profile;
        return `👋 **${p.name}** — ${t(p.title, lang)}\n\n${t(p.summary, lang)}\n\n🎯 ${t(p.objective, lang)}`;
      }
      case "education": {
        const rows = KB.education.map(e => `• ${t(e.degree, lang)} — ${t(e.school, lang)} (${t(e.period, lang)})`);
        return (L ? "🎓 **Parcours scolaire d'Issa :**\n" : "🎓 **Issa's educational background:**\n") + rows.join("\n");
      }
      case "skills": {
        const out = [L ? "🧠 **Compétences d'Issa (telles que listées dans ses CV) :**" : "🧠 **Issa's skills (as listed on his CVs):**", ""];
        for (const cat of Object.values(KB.skills)) out.push(`**${t(cat.label, lang)}** : ${cat.items.join(", ")}`);
        return out.join("\n");
      }
      case "languages": {
        const rows = KB.profile.languages_spoken.map(x => `• ${t(x.name, lang)} : ${t(x.level, lang)}`);
        return (L ? "🗣️ **Langues parlées :**\n" : "🗣️ **Spoken languages:**\n") + rows.join("\n");
      }
      case "certifications": {
        const rows = KB.certifications.map(c => `• ${c.name} — ${t(c.issuer, lang)} (${t(c.date, lang)})`);
        return (L ? "📜 **Licences et certifications :**\n" : "📜 **Licenses and certifications:**\n") + rows.join("\n");
      }
      case "extracurricular": {
        const rows = KB.extracurricular.map(x => `• ${t(x.role, lang)} | ${t(x.org, lang)} (${t(x.date, lang)}) — ${t(x.description, lang)}`);
        return (L ? "🤝 **Activités parascolaires :**\n" : "🤝 **Extracurricular activities:**\n") + rows.join("\n");
      }
      case "contact": {
        const c = KB.profile.contact;
        /* Si l'utilisateur ne demande QU'UNE seule coordonnée, on ne donne
           QUE celle-là (rien d'autre), exactement comme demandé. */
        const field = contactField(normQ);
        if (field === "phone")
          return L ? `📞 Le numéro de téléphone d'Issa : **${c.phone}**` : `📞 Issa's phone number: **${c.phone}**`;
        if (field === "email")
          return L ? `✉️ L'adresse email d'Issa : **${c.email}**` : `✉️ Issa's email address: **${c.email}**`;
        if (field === "linkedin")
          return L ? `🔗 Le profil LinkedIn d'Issa : ${c.linkedin}` : `🔗 Issa's LinkedIn profile: ${c.linkedin}`;
        if (field === "github")
          return L ? `💻 Le GitHub d'Issa : ${c.github}` : `💻 Issa's GitHub: ${c.github}`;
        if (field === "location")
          return L ? `📍 Localisation d'Issa : **${t(c.location, lang)}**` : `📍 Issa's location: **${t(c.location, lang)}**`;
        /* Sinon : toutes les coordonnées. */
        return L
          ? `📫 **Contact :**\n• Email : ${c.email}\n• Téléphone : ${c.phone}\n• Localisation : ${t(c.location, lang)}\n• LinkedIn : ${c.linkedin}${c.github ? `\n• GitHub : ${c.github}` : ""}`
          : `📫 **Contact:**\n• Email: ${c.email}\n• Phone: ${c.phone}\n• Location: ${t(c.location, lang)}\n• LinkedIn: ${c.linkedin}${c.github ? `\n• GitHub: ${c.github}` : ""}`;
      }
      case "objective":
        return "🎯 " + t(KB.profile.objective, lang);
      case "projects_list": {
        const rows = KB.projects.map(p => `• **${t(p.name, lang)}** — ${t(p.period, lang)} · ${t(p.team_type, lang)}`);
        const tail = L ? "\n\n💡 Demandez-moi les détails d'un projet (équipe, durée, technologies, résultats) !"
                       : "\n\n💡 Ask me for the details of any project (team, duration, technologies, results)!";
        return (L ? "🚀 **Les projets d'Issa :**\n" : "🚀 **Issa's projects:**\n") + rows.join("\n") + tail;
      }
      case "internships_list": {
        const rows = KB.internships.map(s => `• **${t(s.title, lang)}** — ${t(s.company, lang)} · ${t(s.period, lang)} (${t(s.duration, lang)})`);
        const tail = L ? "\n\n💡 Demandez-moi les détails d'un stage (entreprise, durée, contenu) !"
                       : "\n\n💡 Ask me for the details of any internship (company, duration, content)!";
        return (L ? "💼 **Les stages d'Issa :**\n" : "💼 **Issa's internships:**\n") + rows.join("\n") + tail;
      }
    }
    return null;
  }

  /* ---------- Fallback fuzzy ---------- */
  function fuzzyBest(normQ, lang) {
    let qtok = new Set(normQ.split(" "));
    for (const w of [...FR_HINTS, ...EN_HINTS]) qtok.delete(normalize(w));
    if (!qtok.size) return null;
    let bestScore = 0, bestAnswer = null;
    const score = blob => { const st = new Set(blob.split(" ")); let n = 0; for (const w of qtok) if (st.has(w)) n++; return n; };
    for (const p of KB.projects) {
      const s = score(normalize(`${t(p.name, lang)} ${t(p.description, lang)} ${p.technologies.join(" ")}`));
      if (s > bestScore) { bestScore = s; bestAnswer = projectCard(p, lang, []); }
    }
    for (const st_ of KB.internships) {
      const s = score(normalize(`${t(st_.title, lang)} ${t(st_.description, lang)}`));
      if (s > bestScore) { bestScore = s; bestAnswer = internshipCard(st_, lang, []); }
    }
    return bestScore >= 2 ? bestAnswer : null;
  }

  function greeting(lang, fallback) {
    if (fallback) return unknownReply(lang);
    if (lang === "fr") {
      return "🤖 Bonjour ! Je suis **ISSA**, l'assistant personnel d'Issa Lamkharbech. Je connais en détail ses projets, ses stages, ses compétences et son parcours. Essayez par exemple :\n• « Qui est Issa ? »\n• « Parle-moi du stage chez Capgemini »\n• « Le projet drone était-il en groupe ? »\n• « Quelles sont ses compétences en IA ? »\n• « Quel est son parcours scolaire ? »";
    }
    return "🤖 Hello! I'm **ISSA**, Issa Lamkharbech's personal assistant. I know his projects, internships, skills and background in detail. Try for example:\n• “Who is Issa?”\n• “Tell me about the Capgemini internship”\n• “Was the drone project a group project?”\n• “What are his AI skills?”\n• “What is his educational background?”";
  }

  /* ---------- Réponse « je ne sais pas » — VARIÉE à chaque fois ----------
     Quand l'info demandée n'est pas connue, ISSA répond franchement « aucune
     idée / je ne sais pas », JAMAIS « je n'ai pas cette info dans le dossier ».
     On tire une formulation au hasard (sans répéter la précédente) et on
     propose de rebondir sur ce qu'ISSA connaît. */
  const UNKNOWN = {
    fr: [
      "🤔 Alors là, aucune idée ! Ça ne fait pas partie de ce que je connais sur Issa.",
      "😅 Honnêtement, je ne sais pas — ce point-là m'échappe complètement.",
      "🤷 Aucune idée là-dessus, désolé ! Je n'ai rien de fiable à te dire sur ce sujet.",
      "🙈 Je sèche complètement sur cette question, je préfère être honnête avec toi.",
      "🤔 Mystère total pour moi ! Je ne voudrais rien inventer.",
      "😬 Là tu me colles — je n'en ai pas la moindre idée."
    ],
    en: [
      "🤔 No idea, honestly! That's not something I know about Issa.",
      "😅 I really don't know — that one's beyond me.",
      "🤷 No clue on that one, sorry! I've got nothing reliable to tell you here.",
      "🙈 I'm totally drawing a blank on this, I'd rather be honest with you.",
      "🤔 That's a mystery to me! I don't want to make anything up.",
      "😬 You've got me there — I genuinely have no idea."
    ]
  };
  let _lastUnknown = -1;
  function unknownReply(lang) {
    const pool = UNKNOWN[lang === "fr" ? "fr" : "en"];
    let i = Math.floor(Math.random() * pool.length);
    if (i === _lastUnknown) i = (i + 1) % pool.length;
    _lastUnknown = i;
    const tail = lang === "fr"
      ? "\n\nEn revanche, je peux tout te dire sur Issa : ses **projets**, ses **stages**, ses **compétences**, son **parcours** ou son **contact**. Que veux-tu savoir ? 🙂"
      : "\n\nBut I can tell you anything about Issa: his **projects**, **internships**, **skills**, **education** or **contact**. What would you like to know? 🙂";
    return pool[i] + tail;
  }

  /* ---------- Point d'entrée public ---------- */
  function reply(question) {
    const lang = detectLanguage(question);
    const normQ = normalize(question);
    if (!normQ || ["bonjour", "salut", "hello", "hi", "hey", "coucou"].includes(normQ)) return greeting(lang, false);
    if (/(merci|thank)/.test(normQ)) return lang === "fr" ? "Avec plaisir ! 😊 Autre chose sur le parcours d'Issa ?" : "You're welcome! 😊 Anything else about Issa's background?";

    let entities = findEntities(normQ);
    const intents = findIntents(normQ);
    if (entities.some(e => PROJECT_IDS.has(e) || STAGE_IDS.has(e))) {
      entities = entities.filter(e => PROJECT_IDS.has(e) || STAGE_IDS.has(e));
    }

    /* Demande de RÉSUMÉ / vue d'ensemble sans sujet précis
       (« résume », « en bref », « en résumé », « en gros », « tldr »,
       « encore », « plus »…) → on donne d'emblée un résumé du profil. */
    const SUMMARY_RE = /\b(resume|resumer|resumes|synthese|syntheses|synthetise|apercu|survol|bref|tldr|recap|recapitule|recapituler|resumons|summary|summarize|summarise|overview|gist|nutshell|encore|davantage|continue|plus)\b/;
    if (!entities.length && SUMMARY_RE.test(normQ)) {
      return answerFor("about", lang, [], normQ);
    }

    const answers = [];
    for (const ent of entities.slice(0, 3)) {
      const a = answerFor(ent, lang, intents, normQ);
      if (a) answers.push(a);
    }
    if (answers.length) return answers.join("\n\n———\n\n");

    return fuzzyBest(normQ, lang) || greeting(lang, true);
  }

  /* ---------- Markdown minimal (gras + puces + liens) → HTML sûr ---------- */
  /* Rendu Markdown minimal → HTML SÛR (protection XSS).
     On échappe TOUS les caractères dangereux (& < > " ') AVANT toute mise en
     forme, de sorte qu'aucune entrée (même une réponse LLM manipulée par un
     visiteur malveillant) ne puisse injecter de balise ou casser un attribut. */
  function mdToHtml(text) {
    const esc = String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
    return esc
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      /* liens Markdown [texte](url) : le texte visible peut différer de l'URL
         (ex. « lamkharbechissa.com » pointant vers l'URL réelle GitHub Pages).
         Uniquement http/https. À faire AVANT l'auto-lien des URL brutes. */
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s()<>"']+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      /* auto-lien des URL brutes restantes (jamais celles déjà dans un href :
         le caractère précédent ne doit être ni «"» ni «>» ni «=») */
      .replace(/(^|[^"'>=])(https?:\/\/[^\s<>"']+)/g,
        '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>')
      .replace(/\n/g, "<br>");
  }

  /* ==========================================================================
     WIDGET DE CHAT — injecté dans la page (bouton flottant + fenêtre)
     ========================================================================== */
  function buildWidget() {
    const wrap = document.createElement("div");
    wrap.id = "jesus-widget";
    wrap.innerHTML = `
      <button id="jesus-launcher" aria-label="Ouvrir le chat avec ISSA">
        <span class="jl-icon">💬</span>
        <span class="jl-label">Discuter avec ISSA</span>
        <span class="jl-pulse"></span>
      </button>
      <div id="jesus-window" class="jesus-hidden" role="dialog" aria-label="Chatbot ISSA">
        <div class="jw-header">
          <div class="jw-avatar">IA</div>
          <div class="jw-title">
            <strong>ISSA</strong>
            <span class="jw-status"><span class="jw-dot"></span><span data-jesus-i18n="status">En ligne — répond instantanément</span></span>
          </div>
          <button class="jw-icon-btn jw-history-btn" aria-label="Historique des conversations" title="Historique" hidden>🕑</button>
          <button class="jw-icon-btn jw-new-btn" aria-label="Nouvelle conversation" title="Nouvelle conversation" hidden>✚</button>
          <button class="jw-close" aria-label="Fermer">×</button>
        </div>
        <div class="jw-history-panel" id="jw-history-panel" hidden>
          <div class="jw-history-head"><span class="jw-history-title">Mes conversations</span><button class="jw-history-close" aria-label="Fermer l'historique">×</button></div>
          <div class="jw-history-list" id="jw-history-list"></div>
        </div>
        <div class="jw-messages" id="jw-messages"></div>
        <div class="jw-suggestions" id="jw-suggestions"></div>
        <form class="jw-inputbar" id="jw-form">
          <input id="jw-input" type="text" autocomplete="off"
                 placeholder="Posez une question sur Issa… / Ask about Issa…" aria-label="Votre question">
          <button type="submit" aria-label="Envoyer">➤</button>
        </form>
      </div>`;
    document.body.appendChild(wrap);

    const launcher = wrap.querySelector("#jesus-launcher");
    const win = wrap.querySelector("#jesus-window");
    const closeBtn = wrap.querySelector(".jw-close");
    const messages = wrap.querySelector("#jw-messages");
    const form = wrap.querySelector("#jw-form");
    const input = wrap.querySelector("#jw-input");
    const suggestions = wrap.querySelector("#jw-suggestions");
    const historyBtn = wrap.querySelector(".jw-history-btn");
    const newBtn = wrap.querySelector(".jw-new-btn");
    const historyPanel = wrap.querySelector("#jw-history-panel");
    const historyList = wrap.querySelector("#jw-history-list");
    const historyCloseBtn = wrap.querySelector(".jw-history-close");
    const HIST = window.ISSAHistory;

    /* persistance (Supabase) — silencieuse si non configurée */
    function persist(role, content) {
      if (HIST && HIST.enabled) HIST.addMessage(role, content, currentLang());
    }

    const SUGG = {
      fr: ["Qui est Issa ?", "Ses stages", "Ses projets", "Ses compétences", "Son parcours scolaire", "Le contacter"],
      en: ["Who is Issa?", "His internships", "His projects", "His skills", "His education", "Contact him"]
    };

    function currentLang() {
      return (document.documentElement.getAttribute("data-lang") || "fr");
    }

    function renderSuggestions() {
      /* le label du bouton flottant suit la langue du site */
      const lbl = wrap.querySelector(".jl-label");
      if (lbl) lbl.textContent = currentLang() === "fr" ? "Discuter avec ISSA" : "Chat with ISSA";
      suggestions.innerHTML = "";
      for (const s of SUGG[currentLang()]) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "jw-chip";
        b.textContent = s;
        b.addEventListener("click", () => { input.value = s; form.dispatchEvent(new Event("submit")); });
        suggestions.appendChild(b);
      }
    }

    function addMessage(text, who) {
      const div = document.createElement("div");
      div.className = "jw-msg " + who;
      if (who === "bot") {
        div.innerHTML = `<div class="jw-msg-avatar">IA</div><div class="jw-bubble">${mdToHtml(text)}</div>`;
      } else {
        div.innerHTML = `<div class="jw-bubble">${mdToHtml(text)}</div>`;
      }
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
    }

    async function botReply(q) {
      /* indicateur « écrit… » */
      const typing = document.createElement("div");
      typing.className = "jw-msg bot";
      typing.innerHTML = `<div class="jw-msg-avatar">IA</div><div class="jw-bubble jw-typing"><span></span><span></span><span></span></div>`;
      messages.appendChild(typing);
      messages.scrollTop = messages.scrollHeight;

      /* MODE LLM + RAG (conversationnel) si configuré, sinon moteur local */
      const rag = window.JesusRAG;
      if (rag && rag.llmAvailable()) {
        const lang = detectLanguage(q);
        /* bulle vide remplie au fil du streaming */
        const div = document.createElement("div");
        div.className = "jw-msg bot";
        div.innerHTML = `<div class="jw-msg-avatar">IA</div><div class="jw-bubble"></div>`;
        const bubble = div.querySelector(".jw-bubble");
        let started = false, full = "";
        try {
          full = await rag.ask(q, lang, delta => {
            if (!started) { typing.remove(); messages.appendChild(div); started = true; }
            bubble.textContent += delta;
            messages.scrollTop = messages.scrollHeight;
          });
          bubble.innerHTML = mdToHtml(full);   /* mise en forme finale */
          messages.scrollTop = messages.scrollHeight;
          persist("assistant", full);
          return;
        } catch (err) {
          /* échec LLM → repli transparent sur le moteur local */
          console.warn("ISSA : LLM indisponible, repli local —", err.message);
          if (started) div.remove();
        }
      }

      /* MOTEUR LOCAL (instantané, toujours disponible) */
      setTimeout(() => {
        typing.remove();
        const ans = reply(q);
        addMessage(ans, "bot");
        persist("assistant", ans);
      }, 300);
    }

    let opened = false;
    function openWin() {
      win.classList.remove("jesus-hidden");
      launcher.classList.add("jl-hidden");
      if (!opened) {
        opened = true;
        addMessage(greeting(currentLang(), false), "bot");
        renderSuggestions();
      }
      input.focus();
    }
    function closeWin() {
      win.classList.add("jesus-hidden");
      launcher.classList.remove("jl-hidden");
    }

    launcher.addEventListener("click", openWin);
    closeBtn.addEventListener("click", closeWin);
    form.addEventListener("submit", e => {
      e.preventDefault();
      const q = input.value.trim();
      if (!q) return;

      /* Commande secrète « /key » : active le mode LLM sans éditer de fichier.
         La clé est stockée dans le localStorage de CE navigateur uniquement
         (jamais envoyée ailleurs qu'à l'API). « /key off » la supprime. */
      if (q.toLowerCase().startsWith("/key")) {
        input.value = "";
        const val = q.slice(4).trim();
        try {
          if (!val || val === "off") {
            localStorage.removeItem("jesus_groq_key");
            addMessage("🔌 Mode LLM désactivé — je repasse sur mon moteur local instantané.", "bot");
          } else {
            localStorage.setItem("jesus_groq_key", val);
            addMessage("🧠 **Mode LLM activé !** Je discute maintenant comme ChatGPT (Llama 3.3 70B via Groq), toujours strictement fidèle au dossier d'Issa. Posez-moi une question ! ✨", "bot");
          }
        } catch (_) {
          addMessage("⚠️ Impossible d'enregistrer la clé dans ce navigateur.", "bot");
        }
        return;
      }

      addMessage(q, "user");
      input.value = "";
      persist("user", q);

      /* GARDE-FOU : demande de tâche hors-sujet (code, poème, traduction…)
         → refus immédiat, sans appeler le LLM (fiable à 100%). */
      const rag = window.JesusRAG;
      if (rag && rag.isOffTopicTask && rag.isOffTopicTask(q)) {
        const ans = rag.refusal(detectLanguage(q));
        addMessage(ans, "bot");
        persist("assistant", ans);
        return;
      }

      botReply(q);
    });

    /* ===================== HISTORIQUE DES CONVERSATIONS ===================== */
    function fmtDate(iso) {
      try {
        const d = new Date(iso);
        return d.toLocaleDateString(currentLang() === "fr" ? "fr-FR" : "en-US",
          { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
      } catch (_) { return ""; }
    }

    async function refreshHistoryList() {
      if (!(HIST && HIST.enabled)) return;
      const L = currentLang() === "fr";
      const convos = await HIST.list();
      historyList.innerHTML = "";
      if (!convos.length) {
        historyList.innerHTML = `<div class="jw-history-empty">${L ? "Aucune conversation pour l'instant." : "No conversation yet."}</div>`;
        return;
      }
      for (const c of convos) {
        const row = document.createElement("div");
        row.className = "jw-history-item" + (c.id === HIST.currentId ? " active" : "");
        row.innerHTML = `<div class="jw-hi-main"><div class="jw-hi-title"></div>
          <div class="jw-hi-date">${fmtDate(c.updated_at)}</div></div>
          <button class="jw-hi-del" aria-label="Supprimer" title="${L ? "Supprimer" : "Delete"}">🗑</button>`;
        row.querySelector(".jw-hi-title").textContent = c.title || (L ? "Conversation" : "Conversation");
        row.querySelector(".jw-hi-main").addEventListener("click", () => openConversation(c.id));
        row.querySelector(".jw-hi-del").addEventListener("click", async (e) => {
          e.stopPropagation();
          await HIST.remove(c.id);
          if (HIST.currentId === c.id) startNewConversation(true);
          refreshHistoryList();
        });
        historyList.appendChild(row);
      }
    }

    async function openConversation(id) {
      if (!(HIST && HIST.enabled)) return;
      const msgs = await HIST.open(id);
      messages.innerHTML = "";
      for (const m of msgs) addMessage(m.content, m.role === "user" ? "user" : "bot");
      /* restaure la mémoire du LLM pour pouvoir CONTINUER la conversation */
      if (window.JesusRAG && window.JesusRAG.setHistory) window.JesusRAG.setHistory(msgs);
      historyPanel.hidden = true;
      suggestions.style.display = "none";
      input.focus();
    }

    function startNewConversation(silent) {
      if (HIST) HIST.currentId = null;
      if (window.JesusRAG && window.JesusRAG.resetConversation) window.JesusRAG.resetConversation();
      messages.innerHTML = "";
      addMessage(greeting(currentLang(), false), "bot");
      renderSuggestions();
      suggestions.style.display = "";
      historyPanel.hidden = true;
      if (!silent) input.focus();
    }

    if (historyBtn) historyBtn.addEventListener("click", async () => {
      const willShow = historyPanel.hidden;
      historyPanel.hidden = !willShow;
      if (willShow) await refreshHistoryList();
    });
    if (historyCloseBtn) historyCloseBtn.addEventListener("click", () => { historyPanel.hidden = true; });
    if (newBtn) newBtn.addEventListener("click", () => startNewConversation());

    /* Initialise la persistance : si Supabase est configuré, on montre les
       boutons historique/nouveau ; sinon le chat reste tel quel (sans DB). */
    (async function initHistory() {
      if (!HIST) return;
      const ok = await HIST.init();
      if (ok) {
        historyBtn.hidden = false;
        newBtn.hidden = false;
      }
    })();

    /* Ouvre le chat depuis n'importe quel élément [data-open-jesus] de la page */
    document.querySelectorAll("[data-open-jesus]").forEach(el =>
      el.addEventListener("click", e => { e.preventDefault(); openWin(); }));

    /* Le changement de langue du site rafraîchit les suggestions */
    document.addEventListener("jesus:langchange", renderSuggestions);
  }

  window.Jesus = { reply, detectLanguage, findEntities, normalize, greeting };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildWidget);
  } else {
    buildWidget();
  }
})();
