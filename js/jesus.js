/* ============================================================================
   JESUS — moteur du chatbot (portage JavaScript de chatbot/jesus_chatbot.py)
   Tourne 100% dans le navigateur : réponses instantanées, aucune API externe.
   Source de vérité : chatbot/knowledge_base.json (exporté vers js/kb.js).
   Miroir EXACT du moteur Python : mêmes alias, mêmes intentions, mêmes
   gabarits (vérifié par « python chatbot/jesus_chatbot.py --test »).
   ============================================================================ */

(function () {
  "use strict";

  /* ---------- Étape 1 : détection de langue ---------- */
  const FR_HINTS = new Set(("quel quelle quels quelles qui est quoi combien ou où comment pourquoi quand le la les un une des du de et il elle sur avec dans son sa ses parle moi dis donne cest stage projet projets duree durée entreprise equipe équipe compétences competences parcours études etudes formation langues bonjour salut merci je j j'ai ai tu toi te suis es sont fais fait faire peux veux montre raconte résume résumé présente mon ma mes ton ta tes nous vous que qu'il qu'est c'est n'est s'il lui pas ne aussi très faim soif fatigué sérieux âge blague recette quoi en au aux ce cette ces dispo bosse court étudié été était déjà phrases trois candidat travaillé chats émotions gars mec personne jeune appelles nom vit quartier arrondissement postal salaire souhaité démarrer commencer peut force meilleur autres jamais connaît compétence").split(" "));
  const EN_HINTS = new Set(("what who which how when where why is are was the a an of and his her about tell me did does do with on in at long many internship internships project projects skills company team duration education background languages hello hi thanks please can you i im i'm i've my your give show should we he him it's what's who's he's don't doesn't isn't summary hungry bored tired write previous hire why joke recipe weather overview nutshell tldr tl you're they're we're that's there's let's i'd i'll into explain translate from for to by has have had any some much more most very just it this that be been will would could know think want need like work working works right now best good thank salary expectations few lines sum up made faster thx or price today quick rundown short city busy keeping these days start apart sets candidates bring value add proactive independent autonomous buy cost power meme make image fun code speak other else then accuracy model cat audio get got kind engineer field specialise specialize specialty story accomplishments accomplished detail oriented meticulous organised organized communicator things simply led lead ever own car name u r guy others").split(" "));

  /* Apostrophes isolées ignorées (« 'good ») ; un mot élidé inconnu
     (« you're ») compte par ses morceaux (« you »). Égalité → français. */
  /* [mots-outils FR, mots-outils EN] d'un texte — même décompte que detectLanguage */
  function langCounts(text) {
    /* passage ENTRE GUILLEMETS (« what's 'stage' in English? ») = citation : ignoré, sauf s'il ne reste rien */
    const low = String(text).toLowerCase().replace(/’/g, "'");
    const pat = /[a-zà-ÿ]+(?:'[a-zà-ÿ]+)*/g;
    const words = low.replace(new RegExp(CLASSIFIER.quoted_raw_re, "g"), " ").match(pat) || low.match(pat) || [];
    /* mots de contenu propres à une langue (détection SEULEMENT, sans devenir des mots-outils) */
    const lwFr = new Set(CLASSIFIER.lang_words.fr), lwEn = new Set(CLASSIFIER.lang_words.en);
    let fr = 0, en = 0;
    for (const w of words) {
      const parts = (FR_HINTS.has(w) || EN_HINTS.has(w) || !w.includes("'")) ? [w] : w.split("'");
      for (const p of parts) { if (FR_HINTS.has(p) || lwFr.has(p)) fr++; if (EN_HINTS.has(p) || lwEn.has(p)) en++; }
    }
    return [fr, en];
  }
  function detectLanguage(text) {
    const [fr, en] = langCounts(text);
    return en > fr ? "en" : "fr";
  }

  /* ---------- Étape 2 : normalisation ---------- */
  /* (regex, remplacement) de CLASSIFIER.symbol_map, compilés après CLASSIFIER */
  let SYMBOLS = null;
  /* Les noms d'outils faits de symboles (« C++ », « C# », « CI/CD », « .NET ») sont protégés AVANT le
     nettoyage (CLASSIFIER.symbol_map : « c++ » → « cplusplus »), côté question comme côté base / alias. */
  function normalize(text) {
    let s = String(text).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (SYMBOLS) for (const [rx, rep] of SYMBOLS) s = s.replace(rx, rep);
    return s.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  }

  /* ---------- Étape 3 : entités (mêmes alias que le moteur Python) ----------
     Alias normalisés (minuscules, sans accents ni ponctuation). Aucun mot
     générique isolé (« agent », « projet »…). « alternance » /
     « apprenticeship » ne servent qu'à reconnaître la question : la réponse
     décrit toujours profile.objective / profile.availability. */
  const ENTITY_ALIASES = {
    capgemini: ["capgemini", "capgemini engineering", "mg2", "mg2 engineering", "stage ingenieur", "engineering internship", "fem", "elements finis", "finite element", "finite elements", "mecanique computationnelle", "computational mechanics", "peugeot", "peugeot 3008", "pointnet", "gemini", "pre dimensionnement", "pre sizing", "calcul de structure", "structural analysis", "trimesh", "scikit fem", "mahalanobis", "stage 2025", "surrogate", "surrogate tool", "surrogate model", "outil de substitution", "modele de substitution", "automotive", "automobile", "automobiles", "secteur automobile", "industrie automobile", "casablanca", "calculer une structure", "calculer des structures", "calcul des structures", "calculs de structure", "structural calculation", "structural calculations"],
    jesa: ["jesa", "jesa s a", "jorf lasfar", "el jadida", "stage d observation", "observation internship", "ahf", "acide fluorhydrique", "hydrofluoric", "ocp", "worley", "sogea", "phileas", "innovx", "fluoralpha", "safety walk", "walk down", "hse", "stage d initiation", "chantier", "construction site", "stage 2024", "chimie", "chimique", "industrie chimique", "usine chimique", "chemical", "chemicals", "chemical plant", "chemical industry", "chemistry", "acide", "acid", "process plant"],
    aegisai: ["aegisai", "aegis ai", "aegis", "plateforme multi agents", "plateforme multi agent", "multi agent platform", "multi agents platform", "integrite de la decision", "decision integrity", "ripple", "engagement toml", "engagement definition language", "etable", "dairy barn", "ferrure de cabine", "cabin bracket", "palier de pompe", "pump bearing", "aegisbench", "agents llm", "llm agents", "noyau python", "serveur mcp", "mcp server", "langgraph", "projet phare", "flagship", "flagship project", "meilleur projet", "best project", "projet principal", "main project", "favorite project", "favourite project", "projet prefere", "projet favori"],
    ai_act: ["ai act", "aiact", "ai act compliance assistant", "compliance assistant", "assistant de conformite", "assistant conformite", "conformite ai act", "conformite ia", "conformite", "compliance", "eu ai act", "reglement europeen sur l ia", "reglement ia", "reglement 2024 1689", "rgpd", "gdpr", "moteur de conformite", "compliance engine", "niveau de risque", "risk tier", "classe de risque", "haut risque", "high risk", "omnibus", "annexe iii", "annex iii", "neuro symbolique", "neuro symbolic", "kleene", "logique trivaluee", "aipd", "dpia", "fria", "eur lex"],
    pa_c27033: ["pa c27033", "pa c 27033", "c27033", "pac27033", "projet pa", "pa project", "erp", "wms", "erp wms mes", "wms mes", "erp mes", "systeme mes", "logiciel mes", "outil mes", "le mes", "un mes", "du mes", "manufacturing execution system", "warehouse management system", "enterprise resource planning", "systemes d information industriels", "systeme d information industriel", "systemes d information", "systeme d information", "industrial information systems", "industrial information system", "information systems", "information system", "supply chain 4 0", "supply chain", "prevision de la demande", "demand forecasting", "mrp", "plan industriel et commercial", "s op", "nomenclatures", "gammes", "projet 2026 2027", "pje9", "projet si", "si project", "si industriel", "si industriels", "systeme d info", "systemes d info", "the is project", "information systems project", "information system project", "erp wms mes project", "entrepot", "entrepots", "gestion d entrepot", "gestion des entrepots", "gestion d entrepots", "warehouse", "warehouses", "warehousing", "warehouse management"],
    drone: ["drone", "dronesense", "dronesense ai", "drone ai", "bi rotor", "birotor", "drone bi rotor", "bimoteur", "bi moteur", "banc d essai", "banc drone", "test bench", "maintenance predictive", "predictive maintenance", "detection de defauts", "diagnostic de defauts", "fault detection", "pjt 2026", "streamlit console", "node red", "drones"],
    mir100: ["mir100", "mir 100", "mir", "agv", "jumeau numerique mir", "jumeau decisionnel", "decision twin", "logistique", "logistics", "robot mobile", "mobile robot", "cobot", "cobot mobile", "bras ur", "universal robots", "qr code", "scannette", "andon", "usine ecole", "teaching factory", "priorisation", "ordonnancement des livraisons", "mission queue", "api rest mir", "pjt 2025", "robot"],
    salle_connectee: ["salle connectee", "salle informatique", "connected classroom", "classroom", "gi iads", "giiads", "giads", "esp32", "esp8266", "arduino", "laravel", "salle intelligente", "smart room", "industrie 4 0 salle", "jumeau numerique iot", "iot digital twin", "signalement de pannes", "defect reporting", "lampe", "lampes", "lamp", "lamps"],
    multi_agents: ["multi robots", "multi robot", "cartographie", "cartographie cooperative", "cooperative mapping", "mapping", "surveillance", "slam", "yolo", "yolov8", "webots", "simulation webots", "e puck", "epuck", "swarm", "robots cooperatifs", "maitre esclave", "master slave", "sockets tcp", "projet metier", "robots", "multi agent mapping", "multi agents mapping", "multi robot mapping"],
    cat_emotion: ["chat", "chats", "cat", "cats", "emotions", "emotion des chats", "cat emotion", "cat emotions", "cat mood", "emotions des chats", "emotions de chats", "emotion du chat", "emotions du chat", "emotions of cats", "emotion of cats", "cats emotions", "cat s emotions", "felin", "miaulement", "meow", "sante des chats", "cat health", "catcompanion", "cat companion", "vocalisations", "spectrogramme", "spectrogram", "tkinter", "deep learning chats", "cat audio", "cat image", "cat images", "cat model", "cat models", "cat cnn", "audio cnn", "cat emotion model", "cat sound", "cat sounds", "animal", "animals", "animaux", "pets", "audio", "traitement audio", "traitement du son", "traitement sonore", "sonore", "audio processing", "sound processing", "audio recognition", "reconnaissance audio", "signal audio", "signaux audio"],
    portfolio_ia: ["portfolio", "portfolio ia", "site web", "site internet", "website", "le site", "ce site", "son site", "ton site", "this site", "the website", "comment le site", "comment ce site", "comment est fait le site", "comment est construit le site", "construction du site", "comment tu es fait", "how are you built", "how is the site", "how the site", "how was the site", "how was this site built", "ce chatbot", "this chatbot", "chatbot", "toi meme", "yourself", "assistant issa", "moteur a regles", "rules engine", "supabase", "groq", "llama", "cloudflare", "cloudflare worker", "github pages", "lamkharbechissa github io", "assistant ia", "ai assistant", "ce projet", "this project", "site actuel", "comment est fait ce site", "qui t a cree", "qui t a creee", "qui t a fait", "qui t a construit", "qui t a developpe", "qui t a code", "qui t a programme", "who made you", "who created you", "who built you", "who developed you", "who programmed you", "who coded you", "site perso", "site personnel", "page perso", "page personnelle", "personal website", "personal site", "personal page", "his website", "his site", "page personnel"],
    education: ["parcours", "etudes", "formation", "formations", "scolaire", "ecole", "education", "school", "studies", "background", "ensam", "arts et metiers", "bac", "baccalaureat", "prepa", "preparatoire", "diplome", "degree", "aix en provence", "meknes", "etudie", "etudier", "studied", "graduate", "study", "prep", "prep classes", "prep school", "preparatory", "preparatory classes", "preparatory cycle", "classes preparatoires", "classe preparatoire", "cycle preparatoire", "high school", "lycee", "est en quelle annee", "en quelle annee est il", "est il en quelle annee", "quelle annee d etudes", "quelle annee d etude", "en est a quelle annee", "what year is he in", "which year is he in", "what year of study", "which year of study", "year of study", "year of studies"],
    skills: ["competences", "skills", "maitrise", "technologies", "stack", "outils", "tools", "langages", "sait faire", "capable", "programming languages", "programming language", "coding languages", "langages de programmation", "langage de programmation", "code en", "coder en", "code in", "codes in", "program in", "programme en", "competence", "competency", "competencies", "skill", "project management", "gestion de projet", "gestion de projets", "pilotage de projet", "pilotage de projets", "cybersecurite", "cyber securite", "cybersecurity", "cyber security", "securite informatique", "data", "data science", "data engineering", "cloud", "cloud computing", "cloud platform", "devops", "ia generative", "genai", "gen ai", "generative ai", "ia gen", "intelligence artificielle generative", "nlp", "natural language processing", "traitement du langage naturel", "traitement automatique du langage", "large language model", "large language models", "language model", "language models", "modeles de langage", "grands modeles de langage", "multi agent", "multi agents", "multiagents", "multi agent system", "systemes multi agents", "ai agents", "agents ia", "agentic", "agentique", "agentic ai", "ia agentique", "web", "developpement web", "web development", "web developer", "web dev", "dev web", "full stack", "fullstack", "front end", "frontend", "back end", "backend", "embedded", "embedded systems", "systemes embarques", "embarque", "hardware", "microcontroleur", "microcontroller", "electronique", "electronics", "cao", "cad", "conception assistee par ordinateur", "computer aided design", "3dexperience", "manage a project", "manage projects", "managing projects", "gerer un projet", "gerer des projets", "how to code", "how to program", "sait coder", "sait programmer", "can he code", "can he program", "does he code", "neural network", "neural networks", "reseau de neurones", "reseaux de neurones", "deploy models", "deploy a model", "deploying models", "model deployment", "deploiement de modeles", "deployer des modeles", "deployer un modele", "mise en production", "autonomous agents", "autonomous agent", "autonomous ai agents", "autonomous ai agent", "agents autonomes", "agent autonome", "agents ia autonomes", "finite element tools", "finite element software", "fem tools", "fem software", "logiciels elements finis", "logiciel elements finis", "outils elements finis", "logiciels de calcul par elements finis", "outils de calcul par elements finis", "project management tools", "project management tool", "pm tools", "tools for project management", "use for project management", "uses for project management", "outils de gestion de projet", "outils de gestion de projets", "outil de gestion de projet", "outils de pilotage", "logiciels de gestion de projet", "project management software", "hard skills", "competences techniques", "technical skills", "analyser des donnees", "analyser les donnees", "analyse de donnees", "analyse des donnees", "data analytics", "github actions"],
    languages: ["langues", "languages", "arabe", "arabic", "francais", "french", "anglais", "english", "allemand", "german", "espagnol", "spanish", "parle quelles", "langue maternelle", "mother tongue", "native language", "first language", "bilingual", "bilingue", "multilingual", "multilingue", "trilingual", "trilingue", "polyglot", "polyglotte", "langue natale", "native speaker", "natif", "native english speaker"],
    certifications: ["certification", "certifications", "certificat", "certificats", "certificate", "mitx", "edx", "coursera", "ibm", "lean six sigma", "yellow belt", "eclee", "agile", "scrum", "certif", "certifs", "courses", "online courses", "online course", "cours en ligne", "formations en ligne", "formation en ligne", "mooc", "moocs", "course certificate", "course certificates", "ceinture jaune"],
    extracurricular: ["parascolaire", "extrascolaire", "club", "clubs", "associatif", "association", "alhayat", "caravan", "pompage solaire", "solar", "extracurricular", "volunteer", "benevolat", "benevole", "benevoles", "associative", "associatives", "vie associative", "extra scolaire", "extra scolaires", "extrascolaires", "parascolaires", "activites extra scolaires", "leadership", "leadership experience", "management", "management experience", "gere une equipe", "gerer une equipe", "managed a team", "manage a team", "led a team", "lead a team", "chef d equipe", "responsable de projet", "project lead", "team lead", "coordination d equipe", "team coordination", "led a project", "lead a project", "led any project", "led any projects", "lead any project", "lead any projects", "led projects", "leading a project", "led the project", "led anything", "lead anything", "dirige un projet", "dirige des projets", "pilote un projet", "pilote des projets", "chef de projet", "project leader", "manage", "managed", "a manage", "a ete manager", "deja ete manager", "been a manager", "etait manager", "encadre une equipe", "encadrer une equipe", "a encadre", "dirige une equipe", "diriger une equipe", "manage people", "managed people", "managing a team", "led people", "humanitaire", "humanitarian", "solidaire", "solidarite", "caritatif", "caritative", "charity", "charitable", "ong", "ngo", "volontariat", "volunteering", "coordinated a team", "coordinate a team", "coordinated the team", "coordinated teams", "coordinated people", "coordinate people", "coordinated others", "coordonne une equipe", "coordonner une equipe", "a coordonne", "coordonne des personnes", "supervised people", "supervised other people", "supervised others", "supervised anyone", "supervise anyone", "supervised a team", "supervise a team", "supervise people", "supervising people", "supervising a team", "supervise others", "competences manageriales", "management skills", "managerial skills", "leadership skills", "solaire", "energie solaire", "renewable", "renewables", "renewable energy", "renouvelable", "renouvelables", "energie renouvelable", "energies renouvelables", "green energy", "energie verte", "clean energy", "photovoltaique", "photovoltaic", "energy", "energie", "energies"],
    contact: ["contact", "contacter", "email", "mail", "meil", "emai", "e mail", "adresse mail", "adresse email", "courriel", "gmail", "telephone", "telephon", "telefone", "numero", "numero de tel", "phone", "num", "tel", "tele", "gsm", "portable", "mobile", "whatsapp", "whatsap", "wtsp", "appeler", "call", "linkedin", "linked in", "lkdn", "github", "git hub", "joindre", "reach", "coordonnees", "adresse", "localisation", "location", "located", "ville", "habite", "reside", "domicile", "ou vit", "vit ou", "lives", "live in", "where does he live", "where does issa live", "where is issa based", "where is he based", "where is issa located", "city", "based in", "arrondissement", "quartier", "code postal", "postal code", "zip code", "il vit", "vit il", "neighbourhood", "neighborhood", "district", "where s he based", "where s issa based", "il est base", "est il base", "base ou", "ou est il base", "sur paris", "il est a paris", "est il a paris", "is he in paris", "lui ecrire", "lui ecris", "lui ecrit", "lui envoyer un mail", "lui envoyer un email", "lui envoyer un message", "write to him", "email him", "ecrire a issa", "write to issa"],
    objective: ["alternance", "apprenticeship", "recherche", "cherche", "looking for", "disponible", "disponibilite", "available", "availability", "objectif", "objective", "embauche", "recruter", "hire", "stage de fin d etudes", "stage de fin d etude", "fin d etudes", "fin d etude", "pfe", "end of studies", "end of study", "final year internship", "graduation internship", "fevrier 2027", "february 2027", "prochain stage", "next internship", "dispo", "dispos", "mobilite", "mobility", "mobile geographiquement", "geographiquement mobile", "geographic mobility", "geographically mobile", "start date", "starting date", "date de debut", "date de demarrage", "can he start", "could he start", "peut il commencer", "pourrait il commencer", "commencer quand", "est il mobile", "il est mobile", "is he mobile", "mobile hors", "mobile en dehors", "mobile outside", "libre", "quel poste", "quel type de poste", "type de poste", "genre de poste", "poste vise", "vise quel", "vise t il", "il vise", "vise quoi", "il postule", "postule pour", "postule t il", "aiming for", "aiming at", "aims for", "what position", "which position", "kind of position", "type of position", "what role is he", "which role is he", "what job is he", "target role", "target position", "hoping to land", "hoping to get", "hoping to find", "hoping to join", "hope to land", "hopes to land", "hopes to get", "looking to land", "wants to land", "want to land", "role does he want", "role would he like", "role is he after", "role is he hoping", "role he wants", "role he is after", "job does he want", "job would he like", "job is he after", "job is he hoping", "job he wants", "position does he want", "position would he like", "position is he after", "position is he hoping", "what is he after", "what s he after", "kind of job", "type of job", "sort of job", "sort of role", "sort of position", "espere decrocher", "decrocher quoi", "veut quel job", "quel job", "quel genre de job", "type de job", "quel emploi", "type d emploi", "genre d emploi", "veut quel poste", "aimerait quel poste"],
    hobbies: ["loisirs", "loisir", "hobbies", "hobby", "passions", "passe temps", "centres d interet", "centre d interet", "centres d interets", "temps libre", "free time", "interests", "hobbys", "hobbie", "for fun", "spare time", "pastime", "pastimes", "leisure", "pour le plaisir", "pour s amuser", "pour le fun", "week end", "weekend", "weekends", "se detendre", "decompresser", "relax", "relaxes", "relaxing", "unwind", "unwinds", "downtime", "en dehors des cours", "en dehors du travail", "en dehors du boulot", "outside work", "outside of work", "after work", "apres le travail", "apres les cours", "aime quoi", "qu est ce qu il aime", "kiffe", "kiffes", "kiffer", "kiffe quoi", "what does he like", "what does he enjoy", "what is he into", "what s he into", "what else is he into", "en dehors de ses etudes", "en dehors des etudes", "a part ses etudes", "a part les etudes", "besides his studies", "apart from his studies", "outside his studies", "outside of his studies", "outside school", "outside of school", "not studying", "when he s not studying", "when hes not studying", "quand il n etudie pas", "quand il ne travaille pas", "quand il travaille pas", "bookworm", "grand lecteur", "grande lectrice", "big reader", "avid reader", "rat de bibliotheque", "chess"],
    about: ["qui est issa", "qui es tu", "who is issa", "presente", "presentation", "profil", "profile", "about", "a propos", "lamkharbech", "issa", "lui", "him"],
    projects_list: ["projets", "projects", "realisations", "travaux", "works", "projet", "project"],
    internships_list: ["stages", "internships", "experiences", "experience professionnelle", "work experience", "entreprises", "companies", "stage", "internship", "experience", "experiences pro", "experience pro", "experiences professionnelles", "professional experience", "stagiaire", "stagiaires", "placement", "placements", "work placement", "work placements", "an intern", "as an intern", "bosse ou", "travaille ou", "ou a t il travaille", "ou a t il bosse", "ou il a travaille", "ou il a bosse", "employeurs", "employers", "where has he worked", "where did he work", "where has issa worked", "where did issa work", "taffe ou", "a taffe", "ou a t il taffe", "ou il a taffe", "taffe chez", "son taf", "bosse chez qui", "travaille chez qui", "taffe chez qui", "a bosse chez", "a travaille chez"],
    soft_skills: ["soft skills", "savoir etre", "competences relationnelles", "interpersonal skills", "people skills", "relational skills", "competences humaines", "qualites humaines", "competences comportementales", "behavioural skills", "behavioral skills", "time management", "gestion du temps", "manage his time", "manages his time", "managing his time", "managed his time", "manage time", "managing time", "gerer son temps", "gere son temps", "gestion de son temps", "organiser son temps", "organise son temps", "deadline", "deadlines", "respecte les delais", "respecter les delais", "tenir les delais", "tient les delais", "delais", "prioritise", "prioritize", "prioritises", "prioritizes", "prioritising", "prioritizing", "prioriser", "priorise", "prioritiser", "sait prioriser", "adaptabilite", "adaptability", "adaptable", "adapt", "adapts", "adapting", "s adapter", "s adapte", "flexible", "flexibilite", "flexibility", "vulgariser", "vulgarise", "vulgarisation", "pedagogie", "pedagogue", "pedagogique", "popularisation", "popularization", "populariser", "popularise", "popularize", "beginners", "beginner", "novices", "laymen", "non technical", "non techniques", "teach", "teaches", "teacher", "teaching", "mentor", "mentoring", "debutants", "debutant", "expliquer simplement", "explique simplement", "enseigner", "curiosite", "curieux", "curious", "curiosity", "likes learning", "like learning", "enjoys learning", "enjoy learning", "loves learning", "love learning", "like to learn", "likes to learn", "loves to learn", "eager to learn", "aime apprendre", "adore apprendre", "rigueur", "rigoureux", "rigour", "rigor", "rigorous", "attention to detail", "attentive to detail", "detail oriented", "meticulous", "minutieux", "souci du detail", "esprit d equipe", "team spirit", "team player", "teamwork", "collaborate", "collaborates", "collaborative", "collaboratif", "collaborer", "collaboration", "work well with others", "works well with others", "work well in a team", "get along", "gets along", "travaille bien en equipe", "travailler en equipe", "sait travailler en equipe", "how to work in a team", "how to work in teams", "work well in teams", "bon en equipe", "good in a team", "good in teams", "autonomie", "autonome", "autonomous", "autonomy", "proactivite", "proactif", "proactive", "proactivity", "initiative", "initiatives", "take initiative", "takes initiative", "prend des initiatives", "self starter", "without supervision", "sans supervision", "independently", "on his own", "en autonomie", "esprit d analyse", "esprit de synthese", "esprit analytique", "analytical", "sens de l analyse", "synthetiser", "sait synthetiser", "sait analyser", "analytique", "analytiques", "capacite d analyse", "capacites d analyse", "capacite de synthese", "analytical skills", "analytical mind", "problem solving", "problem solver", "problem solvers", "solve problems", "solves problems", "solving problems", "solve complex problems", "solves complex problems", "resout des problemes", "resoudre des problemes", "resolution de problemes", "resolution des problemes", "critical thinking", "think critically", "thinks critically", "critical thinker", "critical mind", "esprit critique", "sens critique", "logical thinking", "logical reasoning", "reason logically", "reasons logically", "logical mind", "esprit logique", "raisonnement logique", "sens logique", "raisonne bien", "communication technique", "technical communication", "communicator", "communicant", "communicante", "communication skills", "oral", "a l oral", "l oral", "sait presenter", "savoir presenter", "presenter ses resultats", "presenter des resultats", "present results", "present his work", "presenting", "prise de parole", "public speaking", "parler en public", "speak in public", "present well", "presents well", "presenting well", "good presenter", "a presenter", "presentation skills", "bon orateur", "orateur"]
  };

  const CASE_SENSITIVE_ALIASES = {
    MES: "pa_c27033",
    SI: "pa_c27033"
  };

  const INTENT_KEYWORDS = {
    duration: ["duree", "combien de temps", "how long", "duration", "periode", "period", "quand", "when", "date", "dates", "mois", "months", "lasted"],
    company: ["entreprise", "societe", "company", "employeur", "employer", "chez qui", "chez quelle", "where did", "organisation", "organization"],
    team: ["equipe", "team", "groupe", "group", "seul", "alone", "solo", "binome", "avec qui", "with whom", "membres", "members", "combien de personnes", "how many people", "individuel", "individual", "encadre", "supervised", "encadrant", "coequipier", "teammate", "who worked", "coequipiers", "teammates", "who did he work with", "who does he work with", "who is he working with", "who was he working with", "who did issa work with", "who does issa work with", "travaille avec d autres", "travaille avec quelqu un", "worked with others", "work with others", "works with others", "collabore avec qui", "who works", "who work with", "who is working", "who was working", "qui travaille", "qui bosse", "qui a travaille", "qui a bosse", "who s on", "who is on", "who else", "qui d autre"],
    technologies: ["technologie", "technologies", "technos", "outils", "tools", "stack", "langage", "language utilise", "framework", "librairies", "libraries", "utilise quoi", "built with", "developpe avec"],
    metrics: ["resultat", "resultats", "results", "metriques", "metrics", "performance", "performances", "accuracy", "precision", "score", "kpi", "chiffres"],
    cv_status: ["cv", "resume", "specifie", "mentionne", "figure", "listed", "specified"],
    description: ["decris", "describe", "detail", "details", "explique", "explain", "parle moi", "tell me about", "contenu", "content", "quoi exactement", "en quoi consiste", "what is", "c est quoi", "raconte", "resume", "resumer", "resume moi", "synthese", "synthetise", "en bref", "bref", "en gros", "grandes lignes", "quelques mots", "apercu", "overview", "summarize", "summarise", "sum up", "in short", "in brief"],
    status: ["en cours", "termine", "fini", "acheve", "a venir", "pas encore", "commence", "planifie", "prevu", "futur", "statut", "etat", "avancement", "ou en est", "ou en sont", "en est ou", "en sont ou", "status", "finished", "completed", "ongoing", "planned", "not started", "not yet", "upcoming", "future", "progress", "coming up", "up next", "next project", "prochain projet", "prochains projets"]
  };

  const STATUS_FILTER_SRC = [["\\b(pas encore|pas|non|not yet|not) (termine|fini|acheve|finished|completed|done)", ["ongoing", "planned"]], ["\\b(a venir|pas encore|planifie|prevu|futur|future|non demarre|pas demarre|pas commence|planned|not started|not yet started|upcoming|coming up|up next|next projects?|prochains? projets?)", ["planned"]], ["\\b(en cours|ongoing|in progress|underway)", ["ongoing"]], ["\\b(termine|fini|acheve|finished|completed|done)", ["done"]]];
  const SUMMARY_SRC = "\\b(resume|resumer|resumes|synthese|syntheses|synthetise|apercu|survol|bref|tldr|recap|recapitule|recapituler|resumons|summary|summarize|summarise|overview|gist|nutshell|encore|davantage|continue|plus)\\b";

  /* ---------- Étape 0bis : classification de la question ----------
     Objet IDENTIQUE à CLASSIFIER de chatbot/jesus_chatbot.py (vérifié par
     « python chatbot/jesus_chatbot.py --test ») : ordre de décision, listes
     de mots et sources de regex appliquées au texte normalisé. */
  const CLASSIFIER = {
    "greeting_re": "^(?:bonjour|bonsoir|salut|coucou|hello|hi|hey|yo|good (?:morning|afternoon|evening))(?: (?:issa|toi|a toi|a vous|tout le monde|there|everyone|all))?(?: (?:ca va|comment ca va|comment vas tu|tu vas bien|how are you|how are you doing|how s it going))?$",
    "identity_re": "^(?:(?:bonjour|bonsoir|salut|coucou|hello|hi|hey) )?(?:issa )?(?:qui es tu|tu es qui|t es qui|qui etes vous|vous etes qui|who are you|what are you|ca va|comment ca va|comment vas tu|tu vas bien|how are you|how are you doing|how s it going|que peux tu faire|que sais tu faire|tu peux faire quoi|tu sers a quoi|a quoi tu sers|what can you do|what do you do|aide|aide moi|help|help me|comment ca marche|how does this work|presente toi|introduce yourself|tu es un robot|es tu un robot|are you a bot|are you a robot|t es un robot|t es un bot|tu es un bot|es tu un bot|t es une ia|tu es une ia|es tu une ia|t es humain|tu es humain|es tu humain|t es un humain|are you an ai|are you human|are you a human|are you real|t es quoi|tu es quoi|parle moi de toi|parle nous de toi|parle de toi|tell me about yourself|tell me about you|talk about yourself|about yourself|about you|(?:t es|tu es|es tu|vous etes|etes vous|are you|you re|you are|c est|is this|is it|est ce|est ce que c est) (?:un |une |a |an )?(?:chatgpt|chat gpt|gpt|gpt 4|gpt4|openai|claude|gemini|google|copilot|siri|alexa|bard|mistral|llama|chatbot|assistant|intelligence artificielle|artificial intelligence|an ai|une ia|ai|ia|un humain|a human|human|humain|real person|vrai humain|bot|robot|chat bot)(?: (?:or|ou) (?:un |une |a |an )?(?:chatgpt|chat gpt|gpt|gpt 4|gpt4|openai|claude|gemini|google|copilot|siri|alexa|bard|mistral|llama|chatbot|assistant|intelligence artificielle|artificial intelligence|an ai|une ia|ai|ia|un humain|a human|human|humain|real person|vrai humain|bot|robot|chat bot))?(?: (?:answering|replying|responding|writing|talking|chatting)(?: (?:me|to me|with me))?| qui (?:me )?(?:repond|ecrit|parle))?|qui (?:me )?repond|qui est en train de (?:me )?(?:repondre|ecrire)|qui m ecrit|qui ecrit|who (?:is|s) (?:answering|replying|responding|writing)(?: (?:me|to me))?|comment tu t appelles|comment t appelles tu|tu t appelles comment|comment vous appelez vous|comment tu t appel|tu t appel comment|quel est ton nom|c est quoi ton nom|ton nom|ton prenom|t as un nom|as tu un nom|what s your name|what is your name|whats your name|your name|do you have a name|(?:c est|c est bien|est ce|est ce bien) toi(?: issa)?|(?:t es|tu es|es tu|is this|is it|are you|est ce que c est|c est) (?:vraiment |really |bien )?issa(?: (?:himself|lui meme|en personne|in person))?(?: (?:qui (?:repond|ecrit|parle)|answering|replying|writing|talking))?|is (?:it|this) (?:really )?issa (?:answering|replying|writing|talking)|(?:am i|are we) (?:really )?(?:talking|speaking|chatting) (?:to|with) (?:the |a |an |un |une )?(?:issa|bot|robot|machine|person|real person|someone|somebody|you|chatgpt|chat gpt|gpt|gpt 4|gpt4|openai|claude|gemini|google|copilot|siri|alexa|bard|mistral|llama|chatbot|assistant|intelligence artificielle|artificial intelligence|an ai|une ia|ai|ia|un humain|a human|human|humain|real person|vrai humain|bot|robot|chat bot)(?: (?:or|ou) (?:the |a |an |un |une )?(?:issa|bot|robot|machine|person|real person|someone|chatgpt|chat gpt|gpt|gpt 4|gpt4|openai|claude|gemini|google|copilot|siri|alexa|bard|mistral|llama|chatbot|assistant|intelligence artificielle|artificial intelligence|an ai|une ia|ai|ia|un humain|a human|human|humain|real person|vrai humain|bot|robot|chat bot))?(?: himself| right now| here)?|who am i (?:talking|speaking|chatting) (?:to|with)|who (?:am i|are we) (?:talking|speaking|chatting) (?:to|with)|a qui (?:est ce que )?je parle|je parle a qui|avec qui (?:est ce que )?je parle|je parle avec qui|(?:je parle|suis je en train de parler|est ce que je parle|je suis en train de parler|je discute|est ce que je discute) (?:a|avec) (?:un |une )?(?:vrai |vraie )?(?:issa|bot|robot|machine|personne|humain|ia|chatbot|programme|toi)(?: (?:ou|or) (?:a |avec )?(?:un |une )?(?:issa|bot|robot|machine|personne|humain|ia|chatbot|programme))?(?: lui meme| en personne)?)(?: issa)?$",
    "chatspeak": {
      "u": "you",
      "r": "are",
      "ur": "your",
      "ya": "you",
      "yu": "you"
    },
    "howareyou_re": "\\b(?:ca va|comment ca va|comment vas tu|tu vas bien|how are you|how s it going)\\b",
    "thanks_re": "\\b(?:merci|mercii|thanks|thank you|thank|thx|cimer|cheers|remercie|remercions|appreciate it|much appreciated|many thanks)\\b",
    "vocative_raw_re": "^\\s*(?:(?:hey|hi|hello|salut|bonjour|dis|ok|eh|yo)[\\s,]+)?issa\\s*[,:;!.-]+\\s*|[,;]\\s*issa\\s*[?!.]*\\s*$",
    "impersonal_re": "\\b(?:il y a|y a t il|il pleut|pleut il|il neige|il faut|faut il|est il possible|s il te plait|s il vous plait|quelle heure est il|il etait une fois|quel temps fait il|fait il (?:beau|chaud|froid|bon|doux|moche|gris|jour|nuit)|il fait (?:beau|chaud|froid|bon|doux|moche|gris|jour|nuit)|il fera|fera t il|(?:il va|va t il|il risque de|risque t il de) (?:pleuvoir|neiger|geler|greler|faire (?:beau|chaud|froid|bon|doux|moche|gris|jour|nuit))|(?:il fait|fait il) (?:combien de degres|quelle temperature)|quelle temperature fait il|combien de degres fait il)\\b",
    "issa_ref_re": "\\b(?:issa|lamkharbech|il|lui|son|sa|ses|he|him|his|himself|(?:ce|cet|le|this|the|that) (?:candidat|candidate)|cette candidate|la candidate|(?:ce|cet|cette|this|that) (?:gars|mec|type|personne|jeune|garcon|homme|monsieur|ingenieur|etudiant|eleve|profil|guy|person|student|engineer|man|dude|profile)(?! (?:de|d|du|des|of)\\b)|cette (?:etudiante|ingenieure)|(?:le|l) (?:choisir|decrire|presenter|recruter|embaucher|engager|prendre|retenir|contacter|joindre|appeler|convaincre|resumer|interviewer|rencontrer|connaitre|qualifier|definir|evaluer|juger|situer|considerer|preferer|recommander|garder|integrer|accueillir|solliciter|convoquer|selectionner|valider|former)|(?:pourquoi|peux tu|pouvez vous|tu peux|vous pouvez|pourrais tu|pourriez vous|dois je|devrais je|doit on|devrait on|peut on|on peut|je peux|je dois|je devrais|je vais|vais je|veux tu|voulez vous|pas) (?:le|l) [a-z]{2,}(?:er|ir|re)|(?:decris|decrivez|presente|presentez|resume|resumez|raconte|racontez|recrute|recrutez|embauche|embauchez|choisis|choisissez|contacte|contactez|appelle|appelez|engage|engagez|retiens|retenez|prends|prenez|definis|qualifie|qualifiez) (?:le|l)(?: moi| nous)?(?=\\s*$| (?:en|moi|nous|rapidement|brievement|vite|stp|svp|s il|un peu|bien|pour|si|car|dans|avec|a)\\b))\\b",
    "context_re": "\\b(?:issa|lamkharbech|il|lui|son|sa|ses|he|him|his|himself|projet|projets|project|projects|stage|stages|internship|internships|cv|portfolio|profil|profile|(?:le|l) (?:choisir|decrire|presenter|recruter|embaucher|engager|prendre|retenir|contacter|joindre|appeler|convaincre|resumer|interviewer|rencontrer|connaitre|qualifier|definir|evaluer|juger|situer|considerer|preferer|recommander|garder|integrer|accueillir|solliciter|convoquer|selectionner|valider|former)|(?:pourquoi|peux tu|pouvez vous|tu peux|vous pouvez|pourrais tu|pourriez vous|dois je|devrais je|doit on|devrait on|peut on|on peut|je peux|je dois|je devrais|je vais|vais je|veux tu|voulez vous|pas) (?:le|l) [a-z]{2,}(?:er|ir|re)|(?:decris|decrivez|presente|presentez|resume|resumez|raconte|racontez|recrute|recrutez|embauche|embauchez|choisis|choisissez|contacte|contactez|appelle|appelez|engage|engagez|retiens|retenez|prends|prenez|definis|qualifie|qualifiez) (?:le|l)(?: moi| nous)?(?=\\s*$| (?:en|moi|nous|rapidement|brievement|vite|stp|svp|s il|un peu|bien|pour|si|car|dans|avec|a)\\b))\\b",
    "ontopic_re": "\\b(?:recruter|recrute|recrutement|recruteur|recruteurs|embaucher|embauche|engager|hire|hiring|recruit|recruiting|recruiter|recruiters|candidat|candidats|candidate|candidates|candidature|profil|profile|cv|curriculum|resume|bio|biographie|biography|rundown|parcours|portfolio|stage|stages|internship|internships|points? forts?|forces|atouts?|strengths?|qualites?|qualities|defauts?|faiblesses?|weakness|weaknesses|points? faibles?|motivation|motive|motivated|personnalite|personality|caractere|soft skills|savoir etre|experience|experiences|realisations?|achievements?|accomplishments?|leadership|serieux|serieuse|fiable|reliable|rigoureux|rigorous|competent|bon candidat|good fit|disponible|disponibilite|available|availability|salaire|salary|pretentions|remuneration|visa|titre de sejour|permis|work permit|driving licen[cs]e|quel age|how old|nationalite|nationality|teletravail|remote|mobilite|mobility|relocate|demenager|alternance|apprenticeship|competences|skills|diplome|degree|formation|etudes|certifications?|langues|languages|projet|project|age|hardworking|hard working|hard worker|travailleur|bosseur|teamwork|team player|esprit d equipe|travail en equipe)\\b",
    "summary_signal_re": "\\b(?:resume|resumer|resume moi|resumes|summary|summarize|summarise|synthese|synthetise|apercu|overview|tldr|tl dr|nutshell|en bref|in short|in brief|recap|recapitule|sum up|gist|pitch|presente le|presente la|presente moi|introduce him|introduce issa|who is he|who s he|qui est il|c est qui|court|courte|brievement|briefly|quelques mots|quelques lignes|few words|few lines|sum (?:him |issa |it )?up|(?:le|la|l|me|nous) presenter|presenter issa|profil|profile|cv|curriculum|bio|biographie|biography|rundown|run down|intro|introduction|topo|decris le|decrire|decris moi (?:issa|le)|describe (?:him|issa)|brief me|briefe moi|en quelques mots|(?:en|in) (?:une|deux|trois|quatre|cinq|quelques|one|two|three|four|five|a few|few|[1-5]) (?:phrases?|sentences?|lignes?|lines?|mots|words|points)|(?:ce|cet|le|this|the|that) (?:candidat|candidate)|cette candidate|la candidate|(?:ce|cet|cette|this|that) (?:gars|mec|type|personne|jeune|garcon|homme|monsieur|ingenieur|etudiant|eleve|profil|guy|person|student|engineer|man|dude|profile)(?! (?:de|d|du|des|of)\\b)|qui c est|(?:his|issa s|issa|son|sa) (?:life )?(?:story|histoire)|histoire d issa|story of (?:issa|his life)|(?:kind|type|sort) of (?:engineer|profile|person)|(?:quel|quelle) (?:type|genre|sorte) d (?:ingenieur|profil)|(?:his|son|sa|issa s) (?:field|domain|domaine|specialty|speciality|specialite|specialisation|specialization|expertise|area of expertise|metier)|(?:what|which|quel|quelle|dans quel) (?:field|domain|domaine)|speciali[sz]es?|speciali[sz]ed|speciali[sz]ing|specialise t il)\\b",
    "followup_re": "^(?:et )?(?:(?:tu peux|peux tu|vous pouvez|pouvez vous|tu pourrais|pourrais tu|pourriez vous|can you|could you|would you|please) )?(?:encore|davantage|continue|plus|more|again|tell me more|dis m en plus|dis m en davantage|m en dire plus|m en dire davantage|nous en dire plus|en dire plus|me dire plus|tell me a bit more|tell me a little more|tell us more|say more|en savoir plus|et sinon|sinon|and then|what else|quoi d autre|autre chose|anything else|avec qui|with whom|who with|seul|alone|en equipe|in a team|en groupe)(?: (?:please|stp|svp|s il te plait|s il vous plait))?$",
    "task_res": [
      "\\b(?:poeme|poemes|poem|poems|poesie|poetry|blague|blagues|joke|jokes|chanson|chansons|song|songs|paroles|lyrics|haiku|devinette|devinettes|riddle|riddles|recette|recettes|recipe|recipes|histoire drole|conte de fees|fairy tale|rap|raps|slam|slams|couplet|couplets|verse|verses|rime|rimes|sonnet|sonnets|limerick|hymne|anthem|meme|memes|business plan|business plans|plan d affaires|horoscope|acrostiches?|acrostics?|anagrammes?|anagrams?|calembours?|jeux? de mots|puns?|wordplay|taglines?|slogans?|catchphrases?|contrepeteries?|palindromes?)\\b",
      "\\b(?:genere|generer|generez|cree|creer|creez|dessine|dessiner|dessinez|draw|generate|create|make|fais|faire|produis|photoshop)\\b(?: [a-z0-9]+){0,4} (?:image|images|dessin|dessins|drawing|drawings|picture|pictures|photo|photos|illustration|illustrations|logo|logos|avatar|caricature|wallpaper|fond d ecran)\\b",
      "\\b(?:raconte|racontes|racontez|tell|ecris|ecrire|write|invente|inventer|imagine|cree|create)\\b(?: [a-z0-9]+){0,2} (?:une|un|a|an) (?:[a-z0-9]+ )?(?:histoire|story|tale|conte|fable|legende|legend)\\b",
      "\\b(?:traduis|traduisez|traduire|traduction|translate|translation|translating)\\b",
      "\\b(?:how (?:do|would|can|should) (?:you|i|we|one) (?:say|spell|pronounce|write)|how to (?:say|spell|pronounce)|comment (?:dit on|on dit|se dit|dire|prononce t on|on prononce|ecrit on|on ecrit)|ca se dit comment)(?: [a-z0-9]+){0,5} (?:in|en) (?:english|french|german|arabic|spanish|italian|anglais|francais|allemand|arabe|espagnol|italien)\\b|\\b(?:(?:what s|what is|whats) the (?:english|french|german|arabic|spanish|italian) (?:word |term )?for|(?:english|french|german|arabic|spanish|italian) (?:word|term) for|(?:le mot|mot) (?:anglais|francais|allemand|arabe|espagnol|italien) pour)\\b",
      "^(?:what is|what s|whats|what does) (?!(?:his|her|he|issa|the|a|an|it|this|that|your|my)\\b)[a-z]+(?: mean)? in (?:english|french|german|arabic|spanish|italian)$|^(?:c est quoi|que veut dire|ca veut dire quoi|ca se traduit comment) (?!(?:son|sa|ses|le|la|les|l|il|lui|issa)\\b)[a-z]+ en (?:anglais|francais|allemand|arabe|espagnol|italien)$",
      "\\b(?:combien font|combien fait|equation|equations|integrale|derivee|racine carree|square root|pourcentage de|percentage of|puissance|power of|to the power|au carre|squared|cubed|factorielle|factorial|logarithme|logarithm)\\b|\\b[0-9]+ (?:fois|times|plus|moins|minus|divise par|divided by|multiplie par|multiplied by) [0-9]+\\b",
      "\\b(?:ecris|ecrire|ecrivez|redige|rediger|write|code moi|genere|generer|generate|cree|creer|create|fais|faire|make|donne moi|give me)\\b(?: [a-z0-9]+){0,4} (?:code|script|fonction|function|programme|program|algorithme|algorithm|regex|requete sql|sql query|classe python|python class|page html|html page)\\b",
      "\\b(?:debug|debugger|debugue|corrige mon|fix my|mon code|my code|stack overflow|stackoverflow|syntax error|erreur de syntaxe)\\b",
      "(?<!lui )(?<!leur )\\b(?:ecris|ecrire|ecrivez|redige|rediger|redigez|write|compose|composer|genere|generer|generate)\\b(?: [a-z0-9]+){0,4} (?:texte|text|essai|essay|lettre|letter|dissertation|paragraphe|paragraph|discours|speech|article|tweet|post|email|mail|message|slogan)\\b",
      "\\b(?:ecris|ecrire|ecrivez|redige|rediger|redigez|write|draft|compose|genere|generer|generate|create|cree|creer|make|fais|faire|prepare|preparer)\\b(?: (?!(?:son|sa|ses|his|issa|lui|him|l|le)\\b)[a-z0-9]+){0,3} (?:cv|curriculum|cover letter|lettre de motivation)\\b",
      "\\b(?:resume|resumer|summarize|summarise)\\b(?: [a-z0-9]+){0,3} (?:film|livre|book|movie|article|serie|episode|chapitre|chapter|roman|novel)\\b",
      "\\b(?:imagine|imaginez|imaginons|imaginer|suppose|supposons|picture)\\b (?:que|qu|si|if|that|issa|lui|him|he|un|une|a|an|toi|tu|you)\\b|\\b(?:super ?heros?|super ?heroes|superman|batman|spiderman|pirate|pirates|fanfic|fan fiction)\\b|\\b(?:aventures?|adventures?)\\b(?! (?:chez|at|in|a|au|dans|pro|professionnelles?|professional))",
      "\\b(?:jouons|let s play|play a game|joue avec moi|pierre feuille ciseaux|rock paper scissors|pile ou face|heads or tails|chifoumi)\\b"
    ],
    "calc_verb_re": "\\b(?:calcule|calcules|calculer|calculez|calculons|resous|resolvez|resoudre|solve|compute|calculate)\\b",
    "injection_re": "\\b(?:ignore|ignorez|ignorer|oublie|oubliez|oublier|forget|disregard|override|bypass|contourne)\\b(?: [a-z0-9]+){0,4} (?:instructions?|consignes?|regles|rules|prompt|directives|previous|precedentes?|precedents?|above|ci dessus)\\b|\\b(?:system prompt|prompt systeme|ton prompt|your prompt|jailbreak|dan mode|developer mode|mode developpeur|act as if|act like a|agis comme|fais comme si|joue le role|role play|roleplay|pretend|fais semblant|you are now|tu es maintenant|from now on|a partir de maintenant|oublie (?:issa|lui|tout)|oubliez (?:issa|tout)|forget (?:about )?(?:issa|him|everything)|ne parle plus (?:d issa|de lui)|arrete de parler (?:d issa|de lui)|stop talking about|parle moi d autre chose|talk about something else|change de sujet|change the subject|new instructions?|nouvelles? instructions?|nouvelles? consignes?|answer (?:any|every|all) (?:questions?|requests?)|reponds a (?:toutes|n importe quelle|tout)|sans restriction|without restrictions?|no restrictions?|unrestricted)\\b",
    "clause_split_raw_re": "[?!.;:,\\n]+",
    "clause_split_re": "\\b(?:and|et|also|aussi|puis|then|but|mais)\\b",
    "math_raw_re": "[0-9]\\s*[+*×÷^]\\s*[0-9]",
    "topic_res": [
      "\\b(?:j ai|jai|je suis|je me sens|i am|i m|im|i feel|i ve been|i was|je deviens)\\b(?: [a-z]+){0,2} (?:faim|soif|sommeil|froid|chaud|fatigue|fatiguee|creve|crevee|epuise|epuisee|triste|malade|ennuye|ennuyee|stresse|stressee|deprime|deprimee|hungry|thirsty|starving|sleepy|tired|exhausted|sad|sick|bored|cold|hot|stressed|lonely|depressed|angry)\\b",
      "\\b(?:faim|soif|hungry|thirsty|starving|affame|affamee|je m ennuie|on s ennuie|j ai la flemme|i want to eat|i need food|je veux manger|j ai envie de manger|what should i eat|que manger|quoi manger|on mange quoi)\\b",
      "\\b(?:meteo|weather|forecast|quel temps|temps qu il fait|il fait (?:beau|froid|chaud|moche|bon)|pleut|pleuvoir|pluie|rain|raining|snow|snowing|neige|neiger|neigera|neigeait|greler|grele|verglas|canicule|orage|orages|tempete|faire (?:beau|chaud|froid|moche|doux|gris)|temperature exterieure|quelle heure|what time is it|sunny|cloudy|windy|foggy|stormy|ensoleille|ensoleillee|nuageux|nuageuse|(?:will|is|was) it (?:be )?(?:hot|cold|warm|chilly)|heure est il|quel jour sommes|what day is|date d aujourd hui|today s date|quelle temperature|la temperature (?:a|au|en|dehors|exterieure|aujourd hui|demain|ce soir|maintenant|actuelle)|(?:what s|what is|whats) the temperature|temperature (?:in|at|today|tomorrow|outside|right now|now)|combien de degres|how many degrees|degres celsius|celsius|fahrenheit|how (?:hot|cold|warm|chilly) (?:is it|it is|will it be|was it))\\b",
      "\\b(?:actualite|actualites|news|politique|politics|election|elections|president|guerre|war|bourse|stock market|stocks|bitcoin|crypto|cryptomonnaie|cryptocurrency|taux de change|exchange rate)\\b",
      "\\b(?:match|matchs|ligue 1|ligue des champions|champions league|coupe du monde|world cup|premier league|liga|nba|nfl|psg|real madrid|barca|barcelona|messi|ronaldo|mbappe|neymar|zidane|qui a gagne|who won|score du|resultat du match|resultats sportifs)\\b",
      "\\b(?:qui est|qui etait|who is|who was|who s|c est qui|connais tu|tu connais|do you know) (?!(?:issa|lamkharbech|il|elle|he|she|lui|him|son|sa|ses|his|her|le|la|les|l|the|in|on|at|of|a|an|ce|cet|cette|this|that|ton|ta|tes|your|you|tu|toi|vous|un|une|des|du|de|d|si|if|whether|quel|quelle|what|which)\\b)[a-z]",
      "\\b(?:elon musk|musk|trump|macron|obama|biden|poutine|putin|einstein|newton|beyonce|taylor swift|rihanna|steve jobs|bill gates|zuckerberg)\\b",
      "\\b(?:capitale? (?:de|du|des|d|la|le)|capital of|population de|population of|superficie|plus grand pays|biggest country|largest country|plus haute montagne|highest mountain|tallest|tour eiffel|eiffel tower|eiffel|how (?:tall|far|heavy) (?:is|are|was|were) (?:the|a|an|mount|mt)|quelle (?:est la )?(?:hauteur|superficie) (?:de|du|des|d)|distance entre|how far is|seconde guerre mondiale|world war|definition de|definition of|define|que veut dire|que signifie|what does [a-z ]{1,20} mean|meaning of|synonyme|synonym|antonyme|antonym)\\b",
      "\\b(?:c est quoi|qu est ce que c est|qu est ce qu|what is|what are|what s|define|definis) (?:un|une|des|a|an)\\b",
      "\\b(?:comment (?:faire|cuisiner|perdre|maigrir|gagner|apprendre|devenir|reussir|installer|coder|programmer|reparer|draguer|dormir)|how (?:do i|can i|should i) |(?<!know )(?<!knows )(?<!knew )(?<!learn )(?<!learns )(?<!learned )(?<!learnt )(?<!learning )how to (?!(?:[a-z]+ ){0,2}(?:issa|him|his|he|lui)\\b)|donne moi (?:un|des) conseils?|des conseils pour|any advice|give me advice|advice on|recommande moi|recommend me|que penses tu (?:de|du|des|d) (?!(?:issa|lui|son|sa|ses)\\b)|what do you think (?:of|about) (?!(?:issa|him|his)\\b)|ton avis sur (?!(?:issa|lui|son|sa|ses)\\b)|your opinion on (?!(?:issa|him|his)\\b)|meilleure? (?:film|livre|restaurant|telephone|jeu|ecole|ecoles|universite|formation|entreprise|ville|pays|langage|voiture|equipe|serie)|quelle est la meilleure|quel est le meilleur (?!projet)|lequel est le meilleur|laquelle est la meilleure|which is better|which one is better|which is the best|best (?:programming )?language|best (?:movie|book|restaurant|phone|game|school|university|company|city|country|car|team))",
      "\\b(?:combien coute|combien coutent|combien vaut|combien valent|prix d (?:un|une)|prix du|prix de (?:la|l)|price of|prices of|cost of (?:a|an|the)|how much (?:is|are|does|do) (?:a|an|the)\\b|ou acheter|where (?:can|do|should) i buy|where to buy|acheter (?:un|une|des)|buy (?:a|an|some)|stock price|cours de l action)\\b",
      "\\b(?:mon chat|my cat|mon chien|my dog|ma copine|my girlfriend|mon copain|my boyfriend|je t aime|i love you|tu m aimes|do you love me)\\b",
      "\\b(?:conseille|conseiller|conseilles|conseillez|recommande|recommander|recommandes|recommandez|suggere|suggerer|suggeres|recommend|suggest)\\b(?: [a-z]+){0,3} (?:un |une |des |a |an |some )?(?:bon |bonne |good )?(?:film|films|movie|movies|serie|series|livre|livres|book|books|restaurant|restaurants|musique|music|chanson|chansons|song|songs|jeu video|jeux video|video game|video games|recette|recipe|destination|anime|podcast|podcasts)\\b"
    ],
    "strengths_re": "\\b(?:points? forts?|forces|atouts?|strengths?|qualites?(?! (?:des|du|de|d)\\b)|qualities|pourquoi (?:[a-z]+ ){0,3}?(?:recruter|embaucher|engager|choisir|prendre|retenir|interviewer|selectionner|rencontrer)|pourquoi (?:lui|issa)|et pas un autre|plutot qu un autre|why (?:should (?:we|i|you) )?(?:hire|recruit|choose|pick|interview|meet)|(?:faut il|faudrait il|dois je|devrais je|devrait on|doit on|should (?:we|i|you)|shall (?:we|i)) (?:le |l |him |issa )?(?:recruter|embaucher|engager|choisir|prendre|retenir|hire|recruit|interview|choose|pick)|interview (?:him|issa)|worth (?:an |a |the )?(?:interview|interviewing|hiring|considering|meeting|it)|valeur ajoutee|added value|what makes (?:him|issa)|bon candidat|good (?:candidate|fit)|serieux|serieuse|fiable|reliable|rigoureux|rigorous|competent|motivation|motive|motivated|personnalite|personality|caractere|soft skills|savoir etre|que penses tu (?:de|d) (?:issa|lui)|what do you think (?:of|about) (?:issa|him)|convince me|convaincs moi|pitch|vaut il le coup|worth hiring|hardworking|hard working|hard worker|travailleur|bosseur|assidu|dedicated|serious|motivates|motive|teamwork|team player|team spirit|esprit d equipe|travail en equipe|work ethic|distingue|distinguer|demarque|demarquer|differencie|stand out|stands out|standout|sets? (?:him|issa) apart|apart from (?:the )?others?|(?:would|could|does|can|will|might) (?:he|issa) bring|bring to|brings to|apporter|apporterait|apportera|apporte t il|add value|value (?:would|could|does|can|will) (?:he|issa) add|what value|quelle valeur|proactif|proactive|proactivite|proactivity|(?<!agent )(?<!agents )(?<!robot )(?<!robots )(?<!ia )(?<!systeme )(?<!systemes )(?<!vehicule )(?:autonome|autonomes|autonomous)(?! (?:ai |ia )?(?:agents?|robots?|platforms?|plateformes?|systems?|systemes?|vehicles?|vehicules?|mobile|drones?|cars?|voitures?))|autonomie|autonomy|independant|independent|curieux|curious|curiosite|curiosity|adaptable|adaptabilite|adaptability|rigueur|rigour|rigor|de plus que (?:les |ses |d )?autres|quoi de plus|(?:fait|font) sa force|sa force|ses forces|meilleure? que|better than|(?:that|than) (?:the )?others|others don t|edge over|accomplish|accomplished|accomplishments?|achievements?|achieved|detail oriented|attention to detail|attentive to detail|meticulous|minutieux|minutieuse|meticuleux|thorough|methodique|methodical|(?:est|is)(?: il| he| issa)? (?:tres |very |well |bien )?(?:organise|organisee|organised|organized)|(?:explain|explains|explaining|expliquer|explique|vulgariser|vulgarise)(?: [a-z]+){0,3} (?:things|stuff|technical|technique|techniques|choses|concepts?|complex|complexes|non experts?|non specialistes?)|communicator|communicant|communicante|communication skills|bon en communication|good at communication|communique bien|communicates? well|communiquer|communicate|vulgarisation|pedagogue|pedagogie|pedagogique|popularisation|popularization|populariser|popularise|popularize|non experts?|non specialistes?|public speaking|prise de parole|(?:meilleure?s?|plus beaux|plus belles|principaux|principales|grands|grandes|best|top|biggest|greatest|proudest|key|main|flagship|headline)(?: [a-z]+)? (?:resultats?|results?|reussites?|accomplissements?|achievements?|successes|succes)|resultats? (?:chiffres|phares|cles|marquants?|impressionnants?|notables?|remarquables?)|(?:resultats?|results?|reussites?|accomplissements?|accomplishments?|achievements?|realisations?|successes|succes)(?: [a-z]+){0,2} (?:le |la |les )?(?:plus|most) (?:marquants?|marquantes?|impressionnants?|impressionnantes?|importants?|importantes?|notables?|significatifs?|significatives?|remarquables?|memorables?|beaux|belles|grands?|grandes?|fiers?|impressive|notable|significant|important|remarkable|memorable|proud)|(?:plus|most) (?:impressive|notable|significant|important|remarkable|memorable|marquants?|marquantes?|impressionnants?|impressionnantes?|remarquables?|notables?)(?: [a-z]+)? (?:resultats?|results?|reussites?|accomplishments?|accomplissements?|achievements?|realisations?|successes)|(?:key|flagship|headline) (?:figures?|numbers?)|chiffres? cles|accomplissements?|reussites?|proudest|most proud|proud of|le plus fier|la plus fiere|fiertes?)\\b",
    "current_work_re": "\\b(?:bosse|bossait|travaille|travaillent|taffe|works|working|work|occupe|fait|fais|doing|building|builds|construit|developpe|prepare|planche|planchent)\\b(?: [a-z]+){0,4} (?:en ce moment|actuellement|maintenant|currently|right now|now|these days|ces temps ci|aujourd hui|at the moment|this semester|this term|this year|this academic year|ce semestre|cette annee|cette annee scolaire|cette annee universitaire|ce trimestre)\\b|\\b(?:en ce moment|actuellement|currently|right now|at the moment)\\b(?: [a-z]+){0,3} (?:bosse|travaille|works|working|occupe|fait|doing)\\b|\\b(?:projets? actuels?|projets? du moment|current projects?|current work|busy|occupied|planche|planchent|plancher|planchait)\\b|\\bup to(?: [a-z]+){0,2} (?:these days|lately|nowadays|now|right now|at the moment)\\b",
    "not_in_kb_re": "\\b(?:age|quel age|quel poids|son poids|how old|date de naissance|birthday|birth date|date of birth|anniversaire|ne en|born|nationalite|nationality|citizenship|citoyennete|origine|origins?|originaire|where is he from|where does he come from|d ou vient|d ou est il|vient d ou|viens d ou|venir d ou|est ne|ne ou|est il ne|naissance|(?<!langue )(?:natal|natale|natif)(?! (?:en |de l |d )?(?:arabe|anglais|francais|allemand|espagnol|english|arabic|french|german|spanish|langue|language)\\b)|native town|hometown|home town|birthplace|place of birth|where was he born|paye|payes|payee|payees|remunere|remuneres|remuneree|remunerees|gratification|gratifications|indemnite de stage|indemnites de stage|touchait combien|touche combien|gagnait combien|gagne combien|how much did he (?:make|earn|get paid)|(?:travel|travelling|traveling|voyager|se deplacer|deplacements?)(?: [a-z]+){0,2} (?:for work|for business|for the job|for missions?|professionnels?|professionnellement|pour le travail|pour le boulot|en mission|en missions|a l etranger|abroad)|business travel|business trips?|work travel|deplacements? professionnels?|(?:willing|ready|ok|open|able|prepared|happy) (?:with |to )?(?:travel|business travel)|(?:pret|prete|ouvert|disponible|d accord) (?:a|pour) (?:voyager|se deplacer|des deplacements)|religion|religieux|marie|mariee|married|celibataire|epouse|wife|girlfriend|copine|enfants|children|kids|salaire|salary|pretentions|remuneration|pay (?:expectations?|range|scale|grade|package)|(?:his|expected|desired|the) pay|paid|visa|titre de sejour|residence permit|work permit|autorisation de travail|permis|driving|voiture|how tall|height|combien mesure|defauts?|faiblesses?|weakness|weaknesses|points? faibles?|adresse exacte|home address|teletravail|remote|full remote|vehicle|vehicule|vehicules|motorbike|motorcycle|scooter|relocate|relocation|demenager|demenagement|willing to move|points? d amelioration|axes? d amelioration|areas? (?:for|of) improvement|improvement areas?|il mesure combien|combien il mesure|mesure t il combien|combien mesure t il|(?:quelle|sa|fait quelle) taille(?!(?: [a-z]+){0,3} (?:equipe|team|groupe|group|projet|project))(?! (?:de|d|du|des)\\b)|il pese|pese t il|pese combien|combien il pese|son poids|his weight|how much does he weigh|how heavy is he)\\b",
    "personal_re": "\\b(?:a t il|a|possede|has|have|own|owns) (?:(?:un|une|des|a|any|some) )?(?:chat|chats|chien|chiens|animal|animaux|cat|cats|dog|dogs|pet|pets|car|cars|voiture|voitures|vehicle|vehicule|moto|motorbike|motorcycle|scooter|velo|bike)\\b(?! (?:project|projet|emotion|emotions|health|sante|mood|companion))|\\banimaux? de compagnie\\b",
    "availability_re": "\\b(?:il|issa|he) (?:peut|pourrait|pourra|can|could|will|would) (?:[a-z]+ )?(?:commencer|demarrer|debuter|start|begin|join)\\b|\\b(?:peut|pourrait|pourra|can|could|will|would) (?:il|issa|he) (?:[a-z]+ )?(?:commencer|demarrer|debuter|start|begin|join)\\b|\\b(?:il|issa) (?:commence|demarre|debute) (?:quand|a partir de quand|en|le|des)\\b|\\b(?:commencer|demarrer|debuter|commence|demarre|debute)(?: t)?(?: il)? (?:quand|a partir de quand)\\b|\\bquand (?:est ce qu )?(?:il|issa) (?:peut |pourrait |pourra )?(?:commencer|commence|demarrer|demarre|debuter|debute)\\b|\\b(?:when|how soon) (?:can|could|will|does|would) (?:he|issa) (?:start|begin|join)\\b|\\b(?:il|issa|he|lui) (?:est|serait|sera|is|would be|will be|s) (?:[a-z]+ )?(?:libre|free)\\b|\\b(?:est|serait|sera) (?:il|issa) (?:[a-z]+ )?libre\\b|\\b(?:is|would|will) (?:he|issa) (?:be )?free\\b|\\blibre (?:quand|a partir|des|en)\\b|\\b(?:notice period|preavis|delai de preavis|how soon can (?:he|issa)|when could (?:he|issa) join)\\b",
    "summary_target_re": "\\b(?:summari[sz]e|summary of|sum up|sum (?:him|issa) up|overview of|recap|recapitule|resume|resumer|resume moi|synthese de|synthetise)\\b(?: (?!(?:educational|academic|scolaire|academique)\\b)[a-z]+){0,3} (?:background|profile|profil|parcours|career|carriere|journey)\\b(?! (?:scolaire|academique|universitaire|d etudes))|\\b(?:background|profile|profil|parcours|career|carriere) (?:en|in) (?:une|deux|trois|quatre|cinq|quelques|one|two|three|four|five|a few|few|[1-5]) (?:phrases?|sentences?|lignes?|lines?|mots|words|points)\\b",
    "self_intro_re": "^(?:(?:bonjour|bonsoir|salut|hello|hi|hey|coucou) )?(?:je suis|je travaille|nous sommes|on est|je m appelle|je represente|i am|i m|im|we are|we re|i work|my name is|i represent)\\b|^(?:(?:bonjour|bonsoir|salut|hello|hi|hey|coucou) )?(?:this is |c est )?[a-z]+(?: [a-z]+)? (?:from|at|de chez|de|d) (?:[a-z0-9]+ ){0,5}(?:here|ici)$",
    "code_lang_re": "\\b(?:code|codes|coder|coding|program|programs|programme|programmer|programming|develop|develops|developpe|developper)\\b",
    "weak_aliases": [
      "about",
      "a propos",
      "chat",
      "chats",
      "cat",
      "cats",
      "emotions",
      "felin",
      "meow",
      "mobile",
      "call",
      "reach",
      "location",
      "located",
      "ville",
      "adresse",
      "tel",
      "tele",
      "portable",
      "lives",
      "live in",
      "domicile",
      "reside",
      "appeler",
      "joindre",
      "mapping",
      "surveillance",
      "swarm",
      "cartographie",
      "logistique",
      "logistics",
      "priorisation",
      "qr code",
      "mobile robot",
      "robot mobile",
      "classroom",
      "lampe",
      "lampes",
      "lamp",
      "lamps",
      "website",
      "the website",
      "le site",
      "ce site",
      "chatbot",
      "ce projet",
      "this project",
      "llama",
      "groq",
      "cloudflare",
      "supabase",
      "assistant ia",
      "ai assistant",
      "school",
      "ecole",
      "studies",
      "bac",
      "degree",
      "background",
      "maitrise",
      "outils",
      "tools",
      "stack",
      "capable",
      "technologies",
      "langages",
      "francais",
      "french",
      "anglais",
      "english",
      "arabe",
      "arabic",
      "allemand",
      "german",
      "espagnol",
      "spanish",
      "ibm",
      "agile",
      "scrum",
      "edx",
      "coursera",
      "club",
      "clubs",
      "association",
      "solar",
      "volunteer",
      "recherche",
      "cherche",
      "looking for",
      "objectif",
      "objective",
      "experiences",
      "entreprises",
      "companies",
      "travaux",
      "works",
      "chantier",
      "construction site",
      "hse",
      "gemini",
      "peugeot",
      "fem",
      "gammes",
      "supply chain",
      "omnibus",
      "compliance",
      "conformite",
      "projet",
      "project",
      "stage",
      "internship",
      "experience",
      "robot",
      "robots",
      "dispo",
      "dispos",
      "etudie",
      "etudier",
      "studied",
      "study",
      "graduate",
      "leadership",
      "management",
      "recruter",
      "hire",
      "embauche",
      "disponible",
      "available",
      "presente",
      "presentation",
      "profil",
      "profile",
      "city",
      "based in",
      "code en",
      "coder en",
      "code in",
      "codes in",
      "program in",
      "programme en",
      "arrondissement",
      "quartier",
      "code postal",
      "postal code",
      "zip code",
      "il vit",
      "vit il",
      "neighbourhood",
      "neighborhood",
      "district",
      "competence",
      "competency",
      "competencies",
      "skill",
      "drones",
      "courses",
      "prep",
      "high school",
      "lycee",
      "an intern",
      "as an intern",
      "cybersecurite",
      "cyber securite",
      "cybersecurity",
      "cyber security",
      "securite informatique",
      "data",
      "cloud",
      "devops",
      "web",
      "web dev",
      "dev web",
      "front end",
      "frontend",
      "back end",
      "backend",
      "full stack",
      "fullstack",
      "embedded",
      "embarque",
      "hardware",
      "electronique",
      "electronics",
      "cao",
      "cad",
      "bilingual",
      "bilingue",
      "multilingual",
      "multilingue",
      "trilingual",
      "trilingue",
      "polyglot",
      "polyglotte",
      "manage",
      "managed",
      "humanitaire",
      "humanitarian",
      "solidaire",
      "solidarite",
      "caritatif",
      "caritative",
      "charity",
      "charitable",
      "ong",
      "ngo",
      "volontariat",
      "volunteering",
      "sur paris",
      "employeurs",
      "employers",
      "agentic",
      "agentique",
      "multi agent",
      "multi agents",
      "multiagents",
      "data science",
      "data engineering",
      "cloud computing",
      "cloud platform",
      "ia generative",
      "genai",
      "gen ai",
      "generative ai",
      "ia gen",
      "intelligence artificielle generative",
      "nlp",
      "natural language processing",
      "traitement du langage naturel",
      "traitement automatique du langage",
      "large language model",
      "large language models",
      "language model",
      "language models",
      "modeles de langage",
      "grands modeles de langage",
      "multi agent system",
      "systemes multi agents",
      "ai agents",
      "agents ia",
      "agentic ai",
      "ia agentique",
      "developpement web",
      "web development",
      "web developer",
      "embedded systems",
      "systemes embarques",
      "microcontroleur",
      "microcontroller",
      "conception assistee par ordinateur",
      "computer aided design",
      "3dexperience",
      "manage a project",
      "manage projects",
      "managing projects",
      "gerer un projet",
      "gerer des projets",
      "how to code",
      "how to program",
      "sait coder",
      "sait programmer",
      "can he code",
      "can he program",
      "does he code",
      "neural network",
      "neural networks",
      "reseau de neurones",
      "reseaux de neurones",
      "deploy models",
      "deploy a model",
      "deploying models",
      "model deployment",
      "deploiement de modeles",
      "deployer des modeles",
      "deployer un modele",
      "mise en production",
      "encadre une equipe",
      "encadrer une equipe",
      "a encadre",
      "dirige une equipe",
      "diriger une equipe",
      "manage people",
      "managed people",
      "managing a team",
      "led people",
      "a manage",
      "a ete manager",
      "deja ete manager",
      "been a manager",
      "etait manager",
      "chimie",
      "chimique",
      "industrie chimique",
      "usine chimique",
      "chemical",
      "chemicals",
      "chemical plant",
      "chemical industry",
      "chemistry",
      "acide",
      "acid",
      "process plant",
      "animal",
      "animals",
      "animaux",
      "pets",
      "audio",
      "sonore",
      "natif",
      "a coordonne",
      "solaire",
      "energie solaire",
      "renewable",
      "renewables",
      "renewable energy",
      "renouvelable",
      "renouvelables",
      "energie renouvelable",
      "energies renouvelables",
      "green energy",
      "energie verte",
      "clean energy",
      "photovoltaique",
      "photovoltaic",
      "energy",
      "energie",
      "energies",
      "libre",
      "week end",
      "weekend",
      "weekends",
      "se detendre",
      "decompresser",
      "relax",
      "relaxes",
      "relaxing",
      "unwind",
      "unwinds",
      "downtime",
      "en dehors des cours",
      "en dehors du travail",
      "en dehors du boulot",
      "outside work",
      "outside of work",
      "after work",
      "apres le travail",
      "apres les cours",
      "entrepot",
      "entrepots",
      "gestion d entrepot",
      "gestion des entrepots",
      "gestion d entrepots",
      "warehouse",
      "warehouses",
      "warehousing",
      "warehouse management",
      "aime quoi",
      "qu est ce qu il aime",
      "kiffe",
      "kiffes",
      "kiffer",
      "kiffe quoi",
      "what does he like",
      "what does he enjoy",
      "what is he into",
      "what s he into",
      "what else is he into",
      "en dehors de ses etudes",
      "en dehors des etudes",
      "a part ses etudes",
      "a part les etudes",
      "besides his studies",
      "apart from his studies",
      "outside his studies",
      "outside of his studies",
      "outside school",
      "outside of school",
      "bookworm",
      "grand lecteur",
      "grande lectrice",
      "big reader",
      "avid reader",
      "rat de bibliotheque",
      "chess",
      "quel poste",
      "quel type de poste",
      "type de poste",
      "genre de poste",
      "poste vise",
      "vise quel",
      "vise t il",
      "il vise",
      "vise quoi",
      "il postule",
      "postule pour",
      "postule t il",
      "aiming for",
      "aiming at",
      "aims for",
      "what position",
      "which position",
      "kind of position",
      "type of position",
      "what role is he",
      "which role is he",
      "what job is he",
      "target role",
      "target position",
      "hoping to land",
      "hoping to get",
      "hoping to find",
      "hoping to join",
      "hope to land",
      "hopes to land",
      "hopes to get",
      "looking to land",
      "wants to land",
      "want to land",
      "role does he want",
      "role would he like",
      "role is he after",
      "role is he hoping",
      "role he wants",
      "role he is after",
      "job does he want",
      "job would he like",
      "job is he after",
      "job is he hoping",
      "job he wants",
      "position does he want",
      "position would he like",
      "position is he after",
      "position is he hoping",
      "what is he after",
      "what s he after",
      "kind of job",
      "type of job",
      "sort of job",
      "sort of role",
      "sort of position",
      "espere decrocher",
      "decrocher quoi",
      "veut quel job",
      "quel job",
      "quel genre de job",
      "type de job",
      "quel emploi",
      "type d emploi",
      "genre d emploi",
      "veut quel poste",
      "aimerait quel poste",
      "est en quelle annee",
      "en quelle annee est il",
      "est il en quelle annee",
      "quelle annee d etudes",
      "quelle annee d etude",
      "en est a quelle annee",
      "what year is he in",
      "which year is he in",
      "what year of study",
      "which year of study",
      "year of study",
      "year of studies",
      "taffe ou",
      "a taffe",
      "ou a t il taffe",
      "ou il a taffe",
      "taffe chez",
      "son taf",
      "bosse chez qui",
      "travaille chez qui",
      "taffe chez qui",
      "a bosse chez",
      "a travaille chez",
      "github actions",
      "time management",
      "gestion du temps",
      "manage his time",
      "manages his time",
      "managing his time",
      "managed his time",
      "manage time",
      "managing time",
      "gerer son temps",
      "gere son temps",
      "gestion de son temps",
      "organiser son temps",
      "organise son temps",
      "deadline",
      "deadlines",
      "respecte les delais",
      "respecter les delais",
      "tenir les delais",
      "tient les delais",
      "delais",
      "prioritise",
      "prioritize",
      "prioritises",
      "prioritizes",
      "prioritising",
      "prioritizing",
      "prioriser",
      "priorise",
      "prioritiser",
      "sait prioriser",
      "adaptabilite",
      "adaptability",
      "adaptable",
      "adapt",
      "adapts",
      "adapting",
      "s adapter",
      "s adapte",
      "flexible",
      "flexibilite",
      "flexibility",
      "vulgariser",
      "vulgarise",
      "vulgarisation",
      "pedagogie",
      "pedagogue",
      "pedagogique",
      "popularisation",
      "popularization",
      "populariser",
      "popularise",
      "popularize",
      "beginners",
      "beginner",
      "novices",
      "laymen",
      "non technical",
      "non techniques",
      "teach",
      "teaches",
      "teacher",
      "teaching",
      "mentor",
      "mentoring",
      "debutants",
      "debutant",
      "expliquer simplement",
      "explique simplement",
      "enseigner",
      "curiosite",
      "curieux",
      "curious",
      "curiosity",
      "likes learning",
      "like learning",
      "enjoys learning",
      "enjoy learning",
      "loves learning",
      "love learning",
      "like to learn",
      "likes to learn",
      "loves to learn",
      "eager to learn",
      "aime apprendre",
      "adore apprendre",
      "rigueur",
      "rigoureux",
      "rigour",
      "rigor",
      "rigorous",
      "attention to detail",
      "attentive to detail",
      "detail oriented",
      "meticulous",
      "minutieux",
      "souci du detail",
      "esprit d equipe",
      "team spirit",
      "team player",
      "teamwork",
      "collaborate",
      "collaborates",
      "collaborative",
      "collaboratif",
      "collaborer",
      "collaboration",
      "work well with others",
      "works well with others",
      "work well in a team",
      "get along",
      "gets along",
      "travaille bien en equipe",
      "travailler en equipe",
      "sait travailler en equipe",
      "how to work in a team",
      "how to work in teams",
      "work well in teams",
      "bon en equipe",
      "good in a team",
      "good in teams",
      "autonomie",
      "autonome",
      "autonomous",
      "autonomy",
      "proactivite",
      "proactif",
      "proactive",
      "proactivity",
      "initiative",
      "initiatives",
      "take initiative",
      "takes initiative",
      "prend des initiatives",
      "self starter",
      "without supervision",
      "sans supervision",
      "independently",
      "on his own",
      "en autonomie",
      "esprit d analyse",
      "esprit de synthese",
      "esprit analytique",
      "analytical",
      "sens de l analyse",
      "synthetiser",
      "sait synthetiser",
      "sait analyser",
      "analytique",
      "analytiques",
      "capacite d analyse",
      "capacites d analyse",
      "capacite de synthese",
      "analytical skills",
      "analytical mind",
      "problem solving",
      "problem solver",
      "problem solvers",
      "solve problems",
      "solves problems",
      "solving problems",
      "solve complex problems",
      "solves complex problems",
      "resout des problemes",
      "resoudre des problemes",
      "resolution de problemes",
      "resolution des problemes",
      "critical thinking",
      "think critically",
      "thinks critically",
      "critical thinker",
      "critical mind",
      "esprit critique",
      "sens critique",
      "logical thinking",
      "logical reasoning",
      "reason logically",
      "reasons logically",
      "logical mind",
      "esprit logique",
      "raisonnement logique",
      "sens logique",
      "raisonne bien",
      "communication technique",
      "technical communication",
      "communicator",
      "communicant",
      "communicante",
      "communication skills",
      "oral",
      "a l oral",
      "l oral",
      "sait presenter",
      "savoir presenter",
      "presenter ses resultats",
      "presenter des resultats",
      "present results",
      "present his work",
      "presenting",
      "prise de parole",
      "public speaking",
      "parler en public",
      "speak in public",
      "present well",
      "presents well",
      "presenting well",
      "good presenter",
      "a presenter",
      "presentation skills",
      "bon orateur",
      "orateur"
    ],
    "generic_aliases": [
      "experience",
      "experiences",
      "management"
    ],
    "concept_entities": [
      "skills",
      "soft_skills",
      "extracurricular",
      "hobbies",
      "languages"
    ],
    "definition_re": "^(?:c est quoi|qu est ce que c est|qu est ce que|qu est ce qu|what is|what are|what s|whats|define|definis|definition|explique moi|explain)\\b",
    "fold_exceptions": [
      "course",
      "courses",
      "cours",
      "mars",
      "mois",
      "fois",
      "temps",
      "plus",
      "sans",
      "dans",
      "sous",
      "this",
      "does",
      "news",
      "paris",
      "vous",
      "nous",
      "tous",
      "jours",
      "gens",
      "mais",
      "less",
      "always",
      "perhaps",
      "anglais",
      "francais",
      "process",
      "focus",
      "campus",
      "status",
      "analysis",
      "basis",
      "corpus",
      "virus",
      "bonus",
      "thesis",
      "series",
      "species",
      "ras",
      "pas",
      "pres",
      "apres",
      "depuis",
      "toujours",
      "jamais",
      "parfois",
      "alors",
      "chez",
      "lors",
      "hors",
      "vers",
      "avis",
      "prix",
      "choix",
      "deux",
      "voix",
      "faux",
      "mieux",
      "vieux",
      "heureux",
      "curieux",
      "rigoureux",
      "serieux",
      "minutieux",
      "meticuleux",
      "works",
      "lives",
      "latex",
      "notions",
      "mitx",
      "pets"
    ],
    "protected_words": [
      "salaire",
      "salaires",
      "salary",
      "age",
      "visa",
      "permis",
      "nationalite",
      "teletravail",
      "remote",
      "stage",
      "stages",
      "cv",
      "alternance",
      "remuneration",
      "pretentions",
      "diplome",
      "mobilite",
      "dispo",
      "libre",
      "free",
      "topo",
      "langue",
      "langues",
      "prep",
      "courses",
      "natale",
      "natal",
      "sportif",
      "sportive",
      "degres",
      "degre",
      "temperature",
      "temperatures"
    ],
    "abbreviations": {
      "perso": "personnel",
      "persos": "personnels",
      "lerning": "learning",
      "learnig": "learning"
    },
    "team_overview_re": "\\b(?:seul|seuls|seule|alone|solo|on his own|by himself|tout seul|avec qui|with whom|who with|en equipe|en groupe|in a team|in teams|in a group|team project|group project|projet d equipe|projet de groupe|projet en equipe|projets? collectifs?|individuel|individuels|individual|binome|coequipiers?|teammates?|membres|members|combien de personnes|how many people|team size|taille de l equipe|qui travaille|qui bosse|qui a travaille|qui a bosse|who worked|who works|who work|who is working|who was working|worked with others|work with others|works with others|travaille avec d autres|travaille avec quelqu un|collabore avec qui|encadre|encadrant|supervised)\\b",
    "list_question_re": "\\b(?:which|what|quels?|quelles?|lesquels|lesquelles|liste|list|show|montre|donne|cite|combien|how many|name)\\b",
    "filler_words": [
      "rapidement",
      "vite",
      "stp",
      "svp",
      "plait",
      "bref",
      "quelques",
      "mots",
      "lignes",
      "pro",
      "professionnel",
      "professionnelle",
      "professionnels",
      "professionnelles",
      "prevu",
      "prevus",
      "prevue",
      "prevues",
      "planifie",
      "planifies",
      "cours",
      "actuel",
      "actuelle",
      "actuels",
      "actuelles",
      "termine",
      "termines",
      "fini",
      "finis",
      "venir",
      "futur",
      "futurs",
      "encore",
      "deja",
      "tout",
      "tous",
      "toutes",
      "geographiquement",
      "attentes",
      "pretentions",
      "salariales",
      "salariale",
      "exactement",
      "precisement",
      "detail",
      "details",
      "rapide",
      "liste",
      "lister",
      "bien",
      "bon",
      "bonne",
      "peu",
      "oui",
      "non",
      "wsh",
      "alors",
      "donc",
      "sinon",
      "avez",
      "pourrais",
      "voudrais",
      "aimerais",
      "connaitre",
      "besoin",
      "voir",
      "devrais",
      "devrait",
      "devrions",
      "devriez",
      "dois",
      "doit",
      "faudrait",
      "pourrait",
      "pourquoi",
      "realise",
      "realises",
      "realisee",
      "realisees",
      "faits",
      "mene",
      "menes",
      "please",
      "pls",
      "plz",
      "quickly",
      "quick",
      "briefly",
      "short",
      "shortly",
      "professional",
      "expectations",
      "expected",
      "planned",
      "upcoming",
      "ongoing",
      "current",
      "today",
      "these",
      "days",
      "finished",
      "completed",
      "done",
      "list",
      "all",
      "really",
      "exactly",
      "okay",
      "then",
      "yes",
      "use",
      "uses",
      "used",
      "using",
      "see",
      "get",
      "main",
      "made",
      "built",
      "worked",
      "also",
      "only",
      "actually",
      "general",
      "global",
      "deux",
      "trois",
      "two",
      "three",
      "plutot",
      "autre",
      "autres",
      "rather",
      "other",
      "instead",
      "brief",
      "donner",
      "envoyer",
      "envoie",
      "envoi",
      "trouver",
      "obtenir",
      "recevoir",
      "send",
      "share",
      "partager",
      "telecharger",
      "download",
      "coucou",
      "phrases",
      "sentences",
      "next",
      "coming",
      "others",
      "souhaite",
      "souhaitee",
      "souhaites",
      "souhaitees",
      "demande",
      "demandes",
      "attendu",
      "attendue",
      "utilise",
      "utilises",
      "utilisee",
      "utilisees",
      "utiliser",
      "employe",
      "applique",
      "appliquee",
      "principal",
      "principale",
      "principaux",
      "principales",
      "hey",
      "yo",
      "hello",
      "hi",
      "salut",
      "bonjour",
      "bonsoir",
      "dsl",
      "desole",
      "desolee",
      "sorry",
      "pardon"
    ],
    "soft_skill_terms": {
      "gestion du temps": [
        "time management",
        "gestion du temps",
        "manage his time",
        "manages his time",
        "managing his time",
        "managed his time",
        "manage time",
        "managing time",
        "gerer son temps",
        "gere son temps",
        "gestion de son temps",
        "organiser son temps",
        "organise son temps",
        "deadline",
        "deadlines",
        "respecte les delais",
        "respecter les delais",
        "tenir les delais",
        "tient les delais",
        "delais",
        "prioritise",
        "prioritize",
        "prioritises",
        "prioritizes",
        "prioritising",
        "prioritizing",
        "prioriser",
        "priorise",
        "prioritiser",
        "sait prioriser"
      ],
      "adaptabilite": [
        "adaptabilite",
        "adaptability",
        "adaptable",
        "adapt",
        "adapts",
        "adapting",
        "s adapter",
        "s adapte",
        "flexible",
        "flexibilite",
        "flexibility"
      ],
      "vulgarisation": [
        "vulgariser",
        "vulgarise",
        "vulgarisation",
        "pedagogie",
        "pedagogue",
        "pedagogique",
        "popularisation",
        "popularization",
        "populariser",
        "popularise",
        "popularize",
        "beginners",
        "beginner",
        "novices",
        "laymen",
        "non technical",
        "non techniques",
        "teach",
        "teaches",
        "teacher",
        "teaching",
        "mentor",
        "mentoring",
        "debutants",
        "debutant",
        "expliquer simplement",
        "explique simplement",
        "enseigner"
      ],
      "curiosite": [
        "curiosite",
        "curieux",
        "curious",
        "curiosity",
        "likes learning",
        "like learning",
        "enjoys learning",
        "enjoy learning",
        "loves learning",
        "love learning",
        "like to learn",
        "likes to learn",
        "loves to learn",
        "eager to learn",
        "aime apprendre",
        "adore apprendre"
      ],
      "rigueur": [
        "rigueur",
        "rigoureux",
        "rigour",
        "rigor",
        "rigorous",
        "attention to detail",
        "attentive to detail",
        "detail oriented",
        "meticulous",
        "minutieux",
        "souci du detail"
      ],
      "esprit d equipe": [
        "esprit d equipe",
        "team spirit",
        "team player",
        "teamwork",
        "collaborate",
        "collaborates",
        "collaborative",
        "collaboratif",
        "collaborer",
        "collaboration",
        "work well with others",
        "works well with others",
        "work well in a team",
        "get along",
        "gets along",
        "travaille bien en equipe",
        "travailler en equipe",
        "sait travailler en equipe",
        "how to work in a team",
        "how to work in teams",
        "work well in teams",
        "bon en equipe",
        "good in a team",
        "good in teams"
      ],
      "autonomie": [
        "autonomie",
        "autonome",
        "autonomous",
        "autonomy",
        "proactivite",
        "proactif",
        "proactive",
        "proactivity",
        "initiative",
        "initiatives",
        "take initiative",
        "takes initiative",
        "prend des initiatives",
        "self starter",
        "without supervision",
        "sans supervision",
        "independently",
        "on his own",
        "en autonomie"
      ],
      "esprit d analyse": [
        "esprit d analyse",
        "esprit de synthese",
        "esprit analytique",
        "analytical",
        "sens de l analyse",
        "synthetiser",
        "sait synthetiser",
        "sait analyser",
        "analytique",
        "analytiques",
        "capacite d analyse",
        "capacites d analyse",
        "capacite de synthese",
        "analytical skills",
        "analytical mind",
        "problem solving",
        "problem solver",
        "problem solvers",
        "solve problems",
        "solves problems",
        "solving problems",
        "solve complex problems",
        "solves complex problems",
        "resout des problemes",
        "resoudre des problemes",
        "resolution de problemes",
        "resolution des problemes",
        "critical thinking",
        "think critically",
        "thinks critically",
        "critical thinker",
        "critical mind",
        "esprit critique",
        "sens critique",
        "logical thinking",
        "logical reasoning",
        "reason logically",
        "reasons logically",
        "logical mind",
        "esprit logique",
        "raisonnement logique",
        "sens logique",
        "raisonne bien"
      ],
      "communication technique": [
        "communication technique",
        "technical communication",
        "communicator",
        "communicant",
        "communicante",
        "communication skills",
        "oral",
        "a l oral",
        "l oral",
        "sait presenter",
        "savoir presenter",
        "presenter ses resultats",
        "presenter des resultats",
        "present results",
        "present his work",
        "presenting",
        "prise de parole",
        "public speaking",
        "parler en public",
        "speak in public",
        "present well",
        "presents well",
        "presenting well",
        "good presenter",
        "a presenter",
        "presentation skills",
        "bon orateur",
        "orateur"
      ]
    },
    "lang_words": {
      "fr": [
        "langue",
        "maternelle",
        "libre",
        "serait",
        "topo",
        "décris",
        "décrire",
        "choisir",
        "vulgariser",
        "notions",
        "stagiaire",
        "fois",
        "perso",
        "cybersécurité",
        "prochain",
        "février"
      ],
      "en": [
        "twin",
        "twins",
        "courses",
        "online",
        "prep",
        "classes",
        "interview",
        "interviewing",
        "worth",
        "adapt",
        "free",
        "describe",
        "brief",
        "taken",
        "completed",
        "managing",
        "time",
        "management",
        "learner",
        "eligible",
        "chess",
        "cheers",
        "mate",
        "bookworm",
        "reader",
        "english"
      ]
    },
    "hobby_terms": {
      "football": "football",
      "foot": "football",
      "soccer": "football",
      "natation": "natation",
      "nager": "natation",
      "nage": "natation",
      "swimming": "swimming",
      "swim": "swimming",
      "lecture": "lecture",
      "livres": "lecture",
      "reading": "reading",
      "books": "reading",
      "echecs": "echecs",
      "chess": "chess",
      "voyages": "voyages",
      "voyage": "voyages",
      "voyager": "voyages",
      "travel": "travel",
      "travelling": "travel",
      "traveling": "travel",
      "sport": "",
      "sports": "",
      "sportif": "",
      "sportive": "",
      "sporty": "",
      "athletic": "",
      "lire": "lecture",
      "lit": "lecture",
      "lis": "lecture",
      "read": "reading",
      "reads": "reading",
      "lecteur": "lecture",
      "lectrice": "lecture",
      "reader": "reading",
      "bookworm": "reading",
      "rat de bibliotheque": "lecture",
      "board games": "chess",
      "board game": "chess",
      "jeux de societe": "echecs",
      "jeu de societe": "echecs",
      "jeux video": "?",
      "jeu video": "?",
      "video games": "?",
      "video game": "?",
      "gaming": "?",
      "musique": "?",
      "music": "?",
      "cinema": "?",
      "movies": "?",
      "films": "?",
      "video": "?",
      "videos": "?",
      "strategy games": "chess",
      "strategy game": "chess",
      "jeux de strategie": "echecs",
      "jeu de strategie": "echecs",
      "jeux de reflexion": "echecs",
      "jeu de reflexion": "echecs",
      "games": "chess",
      "game": "chess",
      "jeux": "echecs"
    },
    "project_terms": [
      "robotique",
      "robotics",
      "jumeau numerique",
      "jumeaux numeriques",
      "digital twin",
      "digital twins"
    ],
    "internship_place_terms": [
      "maroc",
      "morocco"
    ],
    "skill_terms": [
      "python",
      "javascript",
      "typescript",
      "react",
      "node js",
      "fastapi",
      "flask",
      "streamlit",
      "html",
      "css",
      "java",
      "spring boot",
      "php",
      "docker",
      "kubernetes",
      "azure",
      "git",
      "sql",
      "mysql",
      "postgresql",
      "sqlite",
      "spark",
      "kafka",
      "airflow",
      "mqtt",
      "pandas",
      "numpy",
      "scikit learn",
      "xgboost",
      "pytorch",
      "tensorflow",
      "keras",
      "opencv",
      "faiss",
      "ollama",
      "lora",
      "rag",
      "llm",
      "mlops",
      "mlflow",
      "shap",
      "lime",
      "matlab",
      "catia",
      "ros2",
      "power bi",
      "powerpoint",
      "jira",
      "trello",
      "notion",
      "minitab",
      "spss",
      "weka",
      "octave",
      "calculix",
      "playwright",
      "pytest",
      "vitest",
      "latex",
      "colab",
      "jupyter",
      "copilot",
      "machine learning",
      "deep learning",
      "computer vision",
      "prompt engineering",
      "fine tuning",
      "embeddings",
      "etl",
      "owasp",
      "devsecops",
      "itil",
      "finops",
      "nist",
      "adkar",
      "lean six sigma",
      "six sigma",
      "kpi",
      "statistiques",
      "statistics",
      "web scraping",
      "iot",
      "project management",
      "multi agent",
      "ai agents",
      "agents ia",
      "capteurs",
      "sensors",
      "3dexperience",
      "business case",
      "roi",
      "tableaux de bord",
      "dashboards",
      "reporting",
      "developpement assiste par ia",
      "ai assisted development",
      "change management",
      "conduite du changement",
      "data analysis",
      "cplusplus",
      "cicd",
      "api rest",
      "yolov8"
    ],
    "skill_synonyms": {
      "vision par ordinateur": "computer vision",
      "vision artificielle": "computer vision",
      "apprentissage automatique": "machine learning",
      "apprentissage profond": "deep learning",
      "cybersecurite": "devsecops",
      "cyber securite": "devsecops",
      "cybersecurity": "devsecops",
      "cyber security": "devsecops",
      "securite informatique": "devsecops",
      "securite applicative": "devsecops",
      "application security": "devsecops",
      "gestion de projet": "project management",
      "gestion de projets": "project management",
      "pilotage de projet": "project management",
      "pilotage de projets": "project management",
      "manage a project": "project management",
      "manage projects": "project management",
      "managing projects": "project management",
      "gerer un projet": "project management",
      "gerer des projets": "project management",
      "multiagents": "multi agent",
      "multi agent system": "multi agent",
      "systemes multi agents": "multi agent",
      "agentic": "ai agents",
      "agentique": "ai agents",
      "agentic ai": "ai agents",
      "ia agentique": "ai agents",
      "agents": "ai agents",
      "large language model": "llm",
      "language model": "llm",
      "modeles de langage": "llm",
      "grands modeles de langage": "llm",
      "web": [
        "html",
        "javascript",
        "react",
        "node js",
        "php"
      ],
      "developpement web": [
        "html",
        "javascript",
        "react",
        "node js",
        "php"
      ],
      "web development": [
        "html",
        "javascript",
        "react",
        "node js",
        "php"
      ],
      "web developer": [
        "html",
        "javascript",
        "react",
        "node js",
        "php"
      ],
      "web dev": [
        "html",
        "javascript",
        "react",
        "node js",
        "php"
      ],
      "dev web": [
        "html",
        "javascript",
        "react",
        "node js",
        "php"
      ],
      "full stack": [
        "html",
        "javascript",
        "react",
        "node js",
        "php"
      ],
      "fullstack": [
        "html",
        "javascript",
        "react",
        "node js",
        "php"
      ],
      "front end": [
        "html",
        "javascript",
        "react"
      ],
      "frontend": [
        "html",
        "javascript",
        "react"
      ],
      "back end": [
        "node js",
        "fastapi",
        "php"
      ],
      "backend": [
        "node js",
        "fastapi",
        "php"
      ],
      "embedded": [
        "arduino",
        "iot",
        "capteurs"
      ],
      "embedded systems": [
        "arduino",
        "iot",
        "capteurs"
      ],
      "systemes embarques": [
        "arduino",
        "iot",
        "capteurs"
      ],
      "embarque": [
        "arduino",
        "iot",
        "capteurs"
      ],
      "hardware": [
        "arduino",
        "iot",
        "capteurs"
      ],
      "microcontroleur": [
        "arduino",
        "iot"
      ],
      "microcontroller": [
        "arduino",
        "iot"
      ],
      "electronique": [
        "arduino",
        "iot",
        "capteurs"
      ],
      "electronics": [
        "arduino",
        "iot",
        "capteurs"
      ],
      "cao": "catia",
      "cad": "catia",
      "neural network": "deep learning",
      "reseau de neurones": "deep learning",
      "cnn": "deep learning",
      "deploy models": "mlops",
      "deploy a model": "mlops",
      "model deployment": "mlops",
      "deploiement de modeles": "mlops",
      "deployer des modeles": "mlops",
      "deployer un modele": "mlops",
      "mise en production": "mlops",
      "conception assistee par ordinateur": "catia",
      "computer aided design": "catia",
      "tableau de bord": [
        "tableaux de bord",
        "power bi"
      ],
      "tableaux de bord": [
        "tableaux de bord",
        "power bi"
      ],
      "dashboard": [
        "tableaux de bord",
        "power bi"
      ],
      "dashboards": [
        "tableaux de bord",
        "power bi"
      ],
      "indicateurs": "kpi",
      "indicateur": "kpi",
      "indicateurs de performance": "kpi",
      "indicators": "kpi",
      "key performance indicators": "kpi",
      "retour sur investissement": "roi",
      "return on investment": "roi",
      "du front": [
        "html",
        "javascript",
        "react"
      ],
      "le front": [
        "html",
        "javascript",
        "react"
      ],
      "en front": [
        "html",
        "javascript",
        "react"
      ],
      "du back": [
        "node js",
        "fastapi",
        "php"
      ],
      "le back": [
        "node js",
        "fastapi",
        "php"
      ],
      "en back": [
        "node js",
        "fastapi",
        "php"
      ],
      "front ou back": [
        "html",
        "javascript",
        "react",
        "node js",
        "fastapi",
        "php"
      ],
      "front or back": [
        "html",
        "javascript",
        "react",
        "node js",
        "fastapi",
        "php"
      ],
      "ia pour coder": "developpement assiste par ia",
      "ia pour programmer": "developpement assiste par ia",
      "code avec l ia": "developpement assiste par ia",
      "coder avec l ia": "developpement assiste par ia",
      "code avec ia": "developpement assiste par ia",
      "coder avec ia": "developpement assiste par ia",
      "programme avec l ia": "developpement assiste par ia",
      "assistant de code": "developpement assiste par ia",
      "assistants de code": "developpement assiste par ia",
      "ai assisted coding": "developpement assiste par ia",
      "use ai to code": "developpement assiste par ia",
      "uses ai to code": "developpement assiste par ia",
      "ai to code": "developpement assiste par ia",
      "ai for coding": "developpement assiste par ia",
      "code with ai": "developpement assiste par ia",
      "codes with ai": "developpement assiste par ia",
      "coding with ai": "developpement assiste par ia",
      "ai coding": "developpement assiste par ia",
      "vibe coding": "developpement assiste par ia",
      "claude code": "developpement assiste par ia",
      "autonomous agents": [
        "ai agents",
        "multi agent"
      ],
      "autonomous agent": [
        "ai agents",
        "multi agent"
      ],
      "autonomous ai agents": [
        "ai agents",
        "multi agent"
      ],
      "autonomous ai agent": [
        "ai agents",
        "multi agent"
      ],
      "agents autonomes": [
        "ai agents",
        "multi agent"
      ],
      "agent autonome": [
        "ai agents",
        "multi agent"
      ],
      "agents ia autonomes": [
        "ai agents",
        "multi agent"
      ],
      "project management tools": "jira",
      "project management tool": "jira",
      "pm tools": "jira",
      "tools for project management": "jira",
      "use for project management": "jira",
      "uses for project management": "jira",
      "outils de gestion de projet": "jira",
      "outils de gestion de projets": "jira",
      "outil de gestion de projet": "jira",
      "outils de pilotage": "jira",
      "logiciels de gestion de projet": "jira",
      "project management software": "jira",
      "finite element tools": "calculix",
      "finite element software": "calculix",
      "fem tools": "calculix",
      "fem software": "calculix",
      "logiciels elements finis": "calculix",
      "logiciel elements finis": "calculix",
      "outils elements finis": "calculix",
      "logiciels de calcul par elements finis": "calculix",
      "outils de calcul par elements finis": "calculix",
      "analyser des donnees": "data analysis",
      "analyser les donnees": "data analysis",
      "analyse de donnees": "data analysis",
      "analyse des donnees": "data analysis",
      "data analytics": "data analysis",
      "c plus plus": "cplusplus",
      "cpp": "cplusplus",
      "github actions": "cicd",
      "automatiser ses deploiements": "cicd",
      "automatiser les deploiements": "cicd",
      "automatisation des deploiements": "cicd",
      "automate deployments": "cicd",
      "deployment automation": "cicd",
      "ci pipeline": "cicd",
      "pipeline ci": "cicd",
      "ci cd pipeline": "cicd",
      "continuous integration": "cicd",
      "continuous deployment": "cicd",
      "continuous delivery": "cicd",
      "integration continue": "cicd",
      "deploiement continu": "cicd",
      "livraison continue": "cicd",
      "api": [
        "api rest",
        "fastapi"
      ],
      "rest api": [
        "api rest",
        "fastapi"
      ],
      "web api": [
        "api rest",
        "fastapi"
      ],
      "stats": "statistiques",
      "statistical analysis": "statistiques",
      "statistical": "statistiques",
      "analyse statistique": "statistiques",
      "analyses statistiques": "statistiques",
      "lean": "lean six sigma",
      "lean manufacturing": "lean six sigma",
      "lean management": "lean six sigma",
      "object recognition": [
        "computer vision",
        "yolov8"
      ],
      "object detection": [
        "computer vision",
        "yolov8"
      ],
      "recognize objects": [
        "computer vision",
        "yolov8"
      ],
      "recognise objects": [
        "computer vision",
        "yolov8"
      ],
      "detect objects": [
        "computer vision",
        "yolov8"
      ],
      "reconnaissance d objets": [
        "computer vision",
        "yolov8"
      ],
      "reconnaissance d objet": [
        "computer vision",
        "yolov8"
      ],
      "reconnaissance des objets": [
        "computer vision",
        "yolov8"
      ],
      "detection d objets": [
        "computer vision",
        "yolov8"
      ],
      "reconnaitre des objets": [
        "computer vision",
        "yolov8"
      ],
      "reconnaitre les objets": [
        "computer vision",
        "yolov8"
      ],
      "detecter des objets": [
        "computer vision",
        "yolov8"
      ],
      "image recognition": [
        "computer vision",
        "opencv"
      ],
      "recognize images": [
        "computer vision",
        "opencv"
      ],
      "recognise images": [
        "computer vision",
        "opencv"
      ],
      "image classification": [
        "computer vision",
        "opencv"
      ],
      "classify images": [
        "computer vision",
        "opencv"
      ],
      "reconnaissance d images": [
        "computer vision",
        "opencv"
      ],
      "reconnaissance d image": [
        "computer vision",
        "opencv"
      ],
      "reconnaissance des images": [
        "computer vision",
        "opencv"
      ],
      "reconnaitre des images": [
        "computer vision",
        "opencv"
      ],
      "reconnaitre les images": [
        "computer vision",
        "opencv"
      ],
      "classification d images": [
        "computer vision",
        "opencv"
      ],
      "classification d image": [
        "computer vision",
        "opencv"
      ],
      "classer des images": [
        "computer vision",
        "opencv"
      ]
    },
    "skill_categories": {
      "data": [
        "data_ml",
        "data_engineering"
      ],
      "data science": [
        "data_ml"
      ],
      "data engineering": [
        "data_engineering"
      ],
      "cloud": [
        "cloud_devops"
      ],
      "cloud computing": [
        "cloud_devops"
      ],
      "cloud platform": [
        "cloud_devops"
      ],
      "devops": [
        "cloud_devops"
      ],
      "ia generative": [
        "genai_llms"
      ],
      "genai": [
        "genai_llms"
      ],
      "gen ai": [
        "genai_llms"
      ],
      "generative ai": [
        "genai_llms"
      ],
      "ia gen": [
        "genai_llms"
      ],
      "intelligence artificielle generative": [
        "genai_llms"
      ],
      "nlp": [
        "genai_llms"
      ],
      "natural language processing": [
        "genai_llms"
      ],
      "traitement du langage naturel": [
        "genai_llms"
      ],
      "traitement automatique du langage": [
        "genai_llms"
      ],
      "how to code": [
        "dev"
      ],
      "how to program": [
        "dev"
      ],
      "sait coder": [
        "dev"
      ],
      "sait programmer": [
        "dev"
      ],
      "can he code": [
        "dev"
      ],
      "can he program": [
        "dev"
      ],
      "does he code": [
        "dev"
      ],
      "programming skills": [
        "dev"
      ],
      "coding skills": [
        "dev"
      ],
      "competences en programmation": [
        "dev"
      ],
      "competences en developpement": [
        "dev"
      ],
      "software development": [
        "dev"
      ],
      "developpement logiciel": [
        "dev"
      ],
      "en ia": [
        "genai_llms",
        "data_ml"
      ],
      "en ai": [
        "genai_llms",
        "data_ml"
      ],
      "in ai": [
        "genai_llms",
        "data_ml"
      ],
      "at ai": [
        "genai_llms",
        "data_ml"
      ],
      "dans l ia": [
        "genai_llms",
        "data_ml"
      ],
      "en intelligence artificielle": [
        "genai_llms",
        "data_ml"
      ],
      "in artificial intelligence": [
        "genai_llms",
        "data_ml"
      ],
      "at artificial intelligence": [
        "genai_llms",
        "data_ml"
      ]
    },
    "fuzzy_stop": [
      "temps",
      "paris",
      "projet",
      "projets",
      "project",
      "projects",
      "issa",
      "lamkharbech",
      "stage",
      "stages",
      "internship",
      "internships",
      "travail",
      "work",
      "fait",
      "faire",
      "dans",
      "pour",
      "avec",
      "sans",
      "plus",
      "moins",
      "tout",
      "tous",
      "toutes",
      "quoi",
      "comment",
      "quand",
      "sont",
      "etait",
      "avait",
      "aussi",
      "tres",
      "bien",
      "comme",
      "entre",
      "about",
      "does",
      "done",
      "have",
      "what",
      "with",
      "from",
      "this",
      "that",
      "they",
      "there",
      "their",
      "your",
      "will",
      "would",
      "could",
      "should",
      "been",
      "being",
      "more",
      "most",
      "some",
      "into",
      "than",
      "then",
      "when",
      "which",
      "while",
      "cette",
      "quel",
      "quelle",
      "quels",
      "quelles",
      "avoir",
      "etre",
      "peut",
      "faut",
      "veut",
      "sait",
      "travaille",
      "travailler",
      "travaillent",
      "bosse",
      "actuellement",
      "currently",
      "moment",
      "working",
      "maintenant",
      "right",
      "start",
      "starts",
      "date",
      "dates",
      "debut",
      "power",
      "instruction",
      "instructions",
      "answer",
      "question",
      "questions",
      "nouvelle",
      "nouveau",
      "image",
      "photo",
      "price",
      "prix",
      "city",
      "ville",
      "location",
      "based",
      "candidat",
      "candidats",
      "candidate",
      "candidates",
      "rundown",
      "bring",
      "team",
      "equipe",
      "keeping",
      "busy",
      "days",
      "time",
      "fun",
      "plaisir",
      "make",
      "made",
      "give",
      "gives",
      "donne",
      "first",
      "last",
      "next",
      "year",
      "years",
      "annee",
      "annees",
      "mois",
      "months",
      "week",
      "semaine",
      "jours",
      "where",
      "here",
      "after",
      "before",
      "avant",
      "apres",
      "neither",
      "lieu",
      "place",
      "people",
      "personnes",
      "other",
      "others",
      "autres",
      "years",
      "language",
      "languages",
      "langues",
      "jamais",
      "aucun",
      "aucune",
      "never",
      "not",
      "none",
      "pas",
      "ever",
      "deja",
      "type",
      "types",
      "genre",
      "sorte",
      "kind",
      "sort",
      "already",
      "notions",
      "notion",
      "basics",
      "jamais",
      "never",
      "ever",
      "yet",
      "utilisent",
      "utilisant",
      "emploient",
      "incluent",
      "contiennent",
      "impliquent",
      "involve",
      "involves",
      "involving",
      "include",
      "includes",
      "including",
      "contain",
      "contains",
      "play",
      "plays",
      "joue",
      "jouer",
      "game",
      "games",
      "jeux",
      "jeu",
      "board",
      "ont",
      "possedent",
      "comportent",
      "integrent",
      "mobilisent",
      "font"
    ],
    "leftover_stop": [
      "que",
      "qui",
      "quoi",
      "quel",
      "quelle",
      "quels",
      "quelles",
      "est",
      "sont",
      "fait",
      "fais",
      "faire",
      "does",
      "did",
      "doing",
      "has",
      "have",
      "had",
      "issa",
      "lamkharbech",
      "peut",
      "peux",
      "can",
      "could",
      "would",
      "will",
      "etait",
      "aime",
      "aimes",
      "like",
      "likes",
      "actuellement",
      "currently",
      "maintenant",
      "now",
      "aujourd",
      "hui",
      "today",
      "moment",
      "elle",
      "lui",
      "him",
      "his",
      "son",
      "ses",
      "the",
      "and",
      "les",
      "des",
      "une",
      "pour",
      "avec",
      "dans",
      "sur",
      "what",
      "who",
      "how",
      "why",
      "where",
      "when",
      "about",
      "tell",
      "dis",
      "moi",
      "parle",
      "know",
      "sais",
      "savoir",
      "bosse",
      "travaille",
      "working",
      "work",
      "right"
    ],
    "spell_words": [
      "competences",
      "competence",
      "experience",
      "experiences",
      "certifications",
      "formation",
      "disponible",
      "disponibilite",
      "projets",
      "stages",
      "parcours",
      "loisirs",
      "langues",
      "contact",
      "recruter",
      "embaucher",
      "telephone",
      "information",
      "systeme",
      "internships",
      "projects",
      "education",
      "skills",
      "availability",
      "certification",
      "hobbies",
      "languages",
      "salaire",
      "salaires",
      "salary",
      "remuneration",
      "nationalite",
      "nationality",
      "permis",
      "pretentions",
      "teletravail",
      "recruteur",
      "recruteurs",
      "embauche",
      "arrondissement",
      "quartier",
      "postal"
    ],
    "section_labels": {
      "education": "parcours scolaire formation etudes diplomes ecoles education studies degrees school",
      "languages": "langues parlees spoken languages",
      "certifications": "licences certifications certificats formations en ligne licenses certificates online courses",
      "extracurricular": "activites parascolaires vie associative clubs extracurricular activities",
      "hobbies": "loisirs passions hobbies interests",
      "contact": "contact coordonnees site web website",
      "objective": "objectif disponibilite recherche stage fin etudes objective availability internship"
    },
    "retrieval_stop": [
      "notions",
      "notion",
      "basics",
      "base",
      "bases",
      "niveau",
      "level",
      "connait",
      "connaissance",
      "connaissances",
      "knowledge",
      "know",
      "knows",
      "sait",
      "savoir",
      "fois",
      "combien",
      "got",
      "eu",
      "has",
      "deja",
      "already",
      "domaine",
      "field",
      "issa",
      "lamkharbech",
      "profil",
      "profile",
      "experience",
      "experiences",
      "good",
      "bon",
      "bonne",
      "fort",
      "forte",
      "strong",
      "quelque",
      "chose",
      "something",
      "anything",
      "thing",
      "things",
      "truc",
      "trucs",
      "est",
      "les",
      "des",
      "une",
      "aux",
      "son",
      "ses",
      "sur",
      "par",
      "pour",
      "avec",
      "dans",
      "and",
      "the",
      "his",
      "him",
      "her",
      "with",
      "for",
      "from",
      "about",
      "gerer",
      "gere",
      "geres",
      "gerent",
      "lire",
      "lit",
      "lis",
      "venir",
      "vient",
      "viens",
      "ecrire",
      "ecris",
      "ecrit",
      "aimer",
      "aime",
      "aimes",
      "toucher",
      "touche",
      "touches",
      "joue",
      "jouer",
      "play",
      "plays",
      "playing",
      "enjoy",
      "enjoys",
      "like",
      "likes",
      "love",
      "loves",
      "worked",
      "works",
      "working",
      "done",
      "doing",
      "built",
      "build",
      "used",
      "using",
      "without",
      "within",
      "avoir",
      "fait",
      "faire",
      "sait",
      "peut",
      "connait",
      "maitrise",
      "utilise",
      "utiliser",
      "touch",
      "handle",
      "handles",
      "manage",
      "manages",
      "take",
      "takes"
    ],
    "retrieval_card_min_hits": 2,
    "retrieval_min_score": 3,
    "retrieval_min_len": 4,
    "retrieval_ratio": 0.75,
    "pitch_sources": [
      [
        "capgemini",
        [
          0,
          2
        ]
      ],
      [
        "aegisai",
        [
          0
        ]
      ],
      [
        "drone",
        [
          0
        ]
      ]
    ],
    "compound_prefixes": [
      "cyber",
      "auto",
      "micro",
      "multi",
      "macro",
      "nano",
      "bio",
      "eco",
      "geo",
      "hydro",
      "electro",
      "thermo",
      "photo",
      "radio",
      "tele",
      "inter",
      "super",
      "hyper",
      "mini",
      "mono",
      "poly",
      "semi",
      "neuro",
      "agro",
      "meta",
      "co",
      "pre",
      "post",
      "sous",
      "sur",
      "anti",
      "contre"
    ],
    "compound_min_len": 5,
    "hobby_qualifier_re": "\\b(?:equipe|equipes|team|teams|club|clubs|competition|competitions|competitive|competitively|competitif|competitive|tournoi|tournois|tournament|tournaments|championnat|championship|league|ligue|classement|classe|elo|rating|ranking|ranked|niveau|level|bon (?:a|au|aux|en)|bonne (?:a|au|aux|en)|good at|fort (?:a|au|aux|en)|doue|talented|professionnel|professionnellement|professional|professionally|semi pro|licence|licencie|licensed|prefere|preferee|favou?rite|supporte|supporter|supporters|fan|fans|souvent|often|how often|combien de fois|depuis quand|since when|how long|depuis combien|record|medaille|medailles|medal|medals|trophee|trophees|trophy|titre|titles?)\\b",
    "sport_context_re": "\\b(?:foot|football|soccer|natation|nage|nager|swim|swimming|echecs|chess|sport|sports|sportif|sportive|fan|supporte|supporter|basket|basketball|tennis|rugby|handball|volley|course a pied|running|gym|fitness|boxe|boxing|velo|cyclisme|equitation|judo|karate)\\b",
    "mobility_q_re": "\\b(?:travel|travelling|traveling|voyager|deplacer|deplacement|deplacements|relocate|relocation|demenager|demenagement|willing to move|move to)\\b",
    "identity_person_re": "\\b(?:issa|humain|human|personne|person|someone|somebody|bot|robot|machine|ia|ai|chatbot|programme|talking|speaking|chatting|je parle|parler a|je discute|qui je parle)\\b",
    "not_built_re": "\\b(?:suites? envisagees?|prochaines? etapes?|next steps?|future work|pistes?|perspectives?|architecture cible|target architecture|non construite?s?|pas construite?s?|not built|never built|concue mais|designed but|limites? dites?|stated limits?|pas de|pas d|n y a pas|there is no|there are no|no trained|non branche|not wired)\\b",
    "phrase_fixes": {
      "machin learning": "machine learning",
      "machin lerning": "machine learning",
      "machine lerning": "machine learning",
      "machin learnig": "machine learning",
      "deep lerning": "deep learning",
      "jeux de donnees": "datasets",
      "jeu de donnees": "dataset",
      "sait pas": "sait",
      "connait pas": "connait",
      "maitrise pas": "maitrise"
    },
    "filter_synonyms": {
      "ia": [
        "ia",
        "ai",
        "intelligence artificielle",
        "artificial intelligence",
        "machine learning",
        "deep learning",
        "llm",
        "cnn",
        "yolov8",
        "tensorflow",
        "pytorch",
        "scikit learn",
        "rag"
      ],
      "ai": [
        "ia",
        "ai",
        "intelligence artificielle",
        "artificial intelligence",
        "machine learning",
        "deep learning",
        "llm",
        "cnn",
        "yolov8",
        "tensorflow",
        "pytorch",
        "scikit learn",
        "rag"
      ]
    },
    "qualifier_words": [
      "strongest",
      "strong",
      "best",
      "top",
      "main",
      "key",
      "core",
      "most",
      "important",
      "hard",
      "soft",
      "interpersonal",
      "programming",
      "technical",
      "biggest",
      "greatest",
      "major",
      "primary",
      "notable",
      "relevant",
      "solid",
      "advanced",
      "meilleur",
      "meilleure",
      "meilleurs",
      "meilleures",
      "principales",
      "principaux",
      "solides",
      "solide",
      "pointues",
      "pointue",
      "relationnelles",
      "relationnel",
      "manageriales",
      "managerial",
      "humaines",
      "comportementales",
      "dures",
      "grosses",
      "grandes",
      "fortes",
      "fort",
      "forte",
      "importantes",
      "cles",
      "techniques",
      "plus",
      "fondamentales",
      "transversales",
      "specifiques",
      "cale",
      "calee",
      "doue",
      "douee",
      "baleze"
    ],
    "symbol_map": [
      [
        "(?<![a-z0-9])c\\+\\+",
        " cplusplus "
      ],
      [
        "(?<![a-z0-9])c#",
        " csharp "
      ],
      [
        "(?<![a-z0-9])f#",
        " fsharp "
      ],
      [
        "(?<![a-z0-9])(?:asp)?\\.net(?![a-z0-9])",
        " dotnet "
      ],
      [
        "\\bci ?/ ?cd\\b",
        " cicd "
      ],
      [
        "\\ba ?/ ?b\\b",
        " ab "
      ],
      [
        "\\br\\u00b2",
        " r2 "
      ],
      [
        "\\bnode ?\\.? ?js\\b",
        " node js "
      ]
    ],
    "quoted_raw_re": "(?:^|(?<=[\\s(:]))[\\\"\\u00ab\\u201c\\u2018'][^\\\"\\u00ab\\u00bb\\u201c\\u201d\\u2018\\n]{1,60}?[\\\"\\u00bb\\u201d'](?=[\\s,.?!:;)]|$)",
    "translate_raw_re": "(?:^|[\\s(:])[\\\"\\u00ab\\u201c'\\u2018]\\s*[^\\\"\\u00ab\\u00bb\\u201c\\u201d?!0-9]{1,60}?\\s*[\\\"\\u00bb\\u201d'\\u2019]\\s*,?\\s*(?:in|en|into|to|vers)\\s+(?:english|french|german|arabic|spanish|italian|anglais|fran[c\\u00e7]ais|allemand|arabe|espagnol|italien)\\b",
    "absent_topic_re": "\\b(?:tableau(?! (?:de|d) bord)|csharp|fsharp|dotnet|swift|kotlin|flutter|react native|android|ios|mobile (?:apps?|applications?|development|dev|developer|developpement)|(?:applis?|applications?|apps?|developpement|dev|developpeur|developer) mobiles?)\\b",
    "absent_related": [
      [
        "\\btableau\\b",
        "power bi"
      ]
    ],
    "item_nip_re": "\\b(?:paye|payes|payee|payees|paid|remunere|remuneres|remuneree|remunerees|remuneration|gratification|gratifications|salaire|salary|indemnite|indemnites|touchait combien|touche combien|gagnait combien|gagne combien|how much did he (?:make|earn|get paid))\\b",
    "school_now_re": "\\b(?:actuel|actuelle|actuels|actuelles|en cours|current|currently|ongoing|present)(?: [a-z]+){0,2} (?:school|academic|scolaires?|academiques?) (?:projects?|work|assignments?)\\b|\\b(?:projets?|travail|travaux) (?:d ecole|scolaires?|academiques?|de l ecole|pour l ecole)(?: [a-z]+){0,3} (?:actuel|actuelle|actuels|actuelles|en cours|en ce moment|actuellement|maintenant|cette annee)\\b|\\b(?:bosse|bossait|travaille|travaillait|taffe|planche|works?|working|doing|busy)(?: [a-z]+){0,3} (?:pour l ecole|a l ecole|at school|for school|in school|at arts et metiers|at ensam|for arts et metiers)\\b|\\b(?:school|academic|class|university|uni|college) project(?: [a-z]+){0,5} (?:this year|this semester|this term|right now|now|currently|at the moment|these days|nowadays)\\b|\\b(?:this year|this semester|this term|this year s|latest|now)(?: [a-z]+){0,2} (?:school|academic|class|university|college) project\\b|\\b(?:which|what) (?:school|academic|class|university|college) project (?:is|s|are|does|has)\\b|\\bprojets? (?:[a-z]+ ){0,4}?(?:d ecole|scolaires?|academiques?|de l ecole|pour l ecole|a l ecole|a arts et metiers|aux arts et metiers|d arts et metiers|chez arts et metiers|a l ensam|de l ensam|a ensam)(?: [a-z]+){0,3} (?:actuel|actuelle|actuellement|en cours|en ce moment|maintenant|cette annee|ce semestre|du moment)\\b|\\b(?:cette annee|ce semestre|en ce moment|actuellement)(?: [a-z]+){0,4} projets? (?:[a-z]+ ){0,2}?(?:d ecole|scolaires?|academiques?|de l ecole|a l ecole|a arts et metiers|aux arts et metiers|a l ensam)\\b|\\b(?:planche|planchent|bosse|travaille|taffe|occupe)(?: [a-z]+){0,4} projets? (?:[a-z]+ ){0,2}?(?:d ecole|scolaires?|academiques?|de l ecole|pour l ecole|a l ecole|a arts et metiers|aux arts et metiers|a l ensam)\\b|\\bprojets? (?:l |le |la |les )?(?:occupe|occupent|mobilise)(?: [a-z]+){0,2} (?:a arts et metiers|aux arts et metiers|a l ecole|a l ensam)\\b|\\bprojets? (?:de |d |du )?(?:cette annee|ce semestre)\\b",
    "school_list_re": "\\b(?:school|academic|class|university|uni|college|student) projects?\\b|\\bprojets? (?:d ecole|scolaires?|academiques?|de l ecole|pour l ecole|a l ecole|universitaires?|etudiants?|de cours|d etudes|en ecole|a arts et metiers|aux arts et metiers|d arts et metiers|chez arts et metiers)\\b",
    "school_ctx_re": "\\b(?:projet academique|academic project|academic team project|projet du module|module project|projet metier|professional project)\\b",
    "school_names": [
      "arts et metiers",
      "ensam",
      "meknes",
      "aix en provence",
      "paristech"
    ],
    "school_project_re": "\\b(?:projet academique|academic project)\\b",
    "deploy_re": "\\b(?:deploy|deploys|deployed|deploying|deployment|deployments|deploie|deploye|deployee|deployes|deployees|deployer|deploiement|deploiements|mis en production|mise en production|mises en production|in production|into production|to production|en production|(?:en|in|into|to|on) prod|(?:production|prod) (?:experience|deployment|deployments|environment|environments|release|releases)|(?:gone|go|goes|went|put|been put) live|mis en ligne|mise en ligne|mises en ligne|(?:work|works|project|projects|app|apps|application|applications|site|tool|tools|model|models|anything|something|projet|projets|travaux|travail|boulot|realisations|outil|outils|modele|modeles|appli|applis|quelque chose|rien)(?: [a-z]+){0,4} (?:online|live|en ligne))\\b",
    "deploy_kb_re": "\\b(?:deploiement|deployment|deploye|deployed)\\b",
    "no_deploy_kb_re": "\\b(?:pas de mise en production|no production deployment|not deployed|non deploye)\\b",
    "except_re": "(?:a part|en dehors (?:de|du|des|d)|hormis|sauf|excepte|autres? que|autres? sports? que|other than|besides|apart from|aside from|except|outside of)(?: (?:le|la|les|l|du|de|des|d|ses|son|sa|his|the))?",
    "outside_studies_re": "\\b(?:a part|en dehors(?: de| des| du| d)?|hors|besides|apart from|aside from|outside(?: of)?|other than) (?:(?:ses|son|sa|les|l|his|the|her) )?(?:etudes|cours|ecole|studies|study|school|classes|scolarite)\\b|\\b(?:when (?:he|issa) (?:s|is) not (?:studying|at school|in class|working)|(?:quand|lorsqu) (?:il|issa) (?:n )?(?:etudie pas|est pas en cours|travaille pas|bosse pas))\\b",
    "you_word_re": "\\b(?:tu|toi|te|t|ton|ta|tes|vous|votre|vos|you|your|yours|yourself|u|ur)\\b",
    "you_res": [
      "\\b(?:ton|ta|tes|votre|vos|your|ur)(?: [a-z]+){0,2} (?:projets?|projects?|realisations?|stages?|internships?|experiences?|parcours|background|formations?|etudes|studies|education|diplomes?|degrees?|competences?|skills?|expertise|domaine|field|specialite|specialty|points? forts?|forces?|strengths?|atouts?|qualites?|qualities|defauts?|faiblesses?|weakness(?:es)?|points? faibles?|soft skills|langues|languages|certifications?|motivations?|objectifs?|objectives?|goals?|ambitions?|aspirations?|career|carriere|methodes?|methods?|methodologie|methodology|approche|approach|style|facon de travailler|leadership|reussites?|succes|success(?:es)?|achievements?|accomplishments?|erreurs?|mistakes?|echecs?|failures?|difficultes?|challenges?|defis?|obstacles?|lecons?|lessons?|disponibilite|availability|mobilite|mobility|cv|resume|profil|profile|portfolio|linkedin|github|email|mail|contact|coordonnees|loisirs|hobbies|passions?|interets|interests|travail|work|job|salaire|salary|pretentions|valeur ajoutee|added value|equipe|team|role|plus grande?|biggest|greatest|proudest|meilleure?s?|best)\\b",
      "\\b(?:(?:tu|vous) (?:te |vous |t |l |le |la |les |en |y )?(?:geres|gerez|travailles|travaillez|bosses|bossez|organises|organisez|apprends|apprenez|abordes|abordez|priorises|priorisez|reagis|reagissez|diriges|dirigez|encadres|encadrez|recherches|recherchez|cherches|cherchez|vises|visez|souhaites|souhaitez|formes|formez)|(?:geres|gerez|travailles|travaillez|bosses|bossez|organises|organisez|apprends|apprenez|abordes|abordez|priorises|priorisez|reagis|reagissez|diriges|dirigez|encadres|encadrez|recherches|recherchez|cherches|cherchez|vises|visez|souhaites|souhaitez) (?:tu|vous))\\b",
      "\\b(?:as tu|avez vous|tu as|vous avez|t as)(?: deja| vraiment| souvent| jamais)? (?:dirige|mene|manage|encadre|travaille|appris|echoue|rate|commis|eu|fait|realise|developpe|construit|concu|gere|pilote|surmonte|rencontre|choisi|suivi|obtenu|reussi)\\b",
      "\\b(?:es tu|etes vous|tu es|vous etes|t es)(?: plutot| vraiment| bien| deja)? (?:disponible|disponibles|libre|mobile|motive|motivee|base|basee|ouvert|ouverte|pret|prete|a l aise|fort|forte|bon|bonne|organise|autonome|rigoureux|curieux|passionne|interesse)\\b",
      "\\b(?:how|comment) (?:do|did|would|will|can) (?:you|u) (?:handle|manage|deal|cope|work|learn|organi[sz]e|prioriti[sz]e|approach|react|stay|keep|lead|solve|tackle|overcome|choose|pick|decide)\\b",
      "\\b(?:have|did|do|would|could|can|were|are) (?:you|u)(?: ever| already| really| usually)? (?:led|lead|manage|managed|worked|work|learn|learned|learnt|fail|failed|make|made|face|faced|overcome|overcame|handle|handled|built|build|deliver|delivered|available|free|mobile|motivated|based|open|willing|comfortable|good|strong|organi[sz]ed|interested|passionate|looking)\\b",
      "\\b(?:what|which) (?:motivates|drives|excites|interests|inspires|attracts) (?:you|u)\\b",
      "\\bqu est ce qui (?:te|vous|t) (?:motive|anime|pousse|passionne|interesse|attire|plait|inspire)\\b",
      "\\b(?:parlez moi de vous|parlez nous de vous|presentez vous|presentez vous rapidement|decrivez vous|decris toi|where do you see yourself|ou te vois tu|ou vous voyez vous|where will you be|what are you looking for|what do you want to do|que recherches tu|que recherchez vous|que cherches tu|que cherchez vous|qu est ce que (?:tu|vous) (?:recherches|recherchez|cherches|cherchez)|why should (?:we|i) (?:hire|recruit|choose|pick) you|pourquoi (?:devrais je|devrions nous|dois je|devrait on|faudrait il) (?:te|vous) (?:recruter|embaucher|choisir|prendre|engager)|why did you (?:choose|pick|study|go into|decide)|pourquoi (?:as tu|avez vous) choisi|what (?:can|could|would|will) you bring|(?:qu est ce que|que) (?:tu|vous) (?:peux|pouvez|pourrais|pourriez) (?:nous |m |me )?apporter|que (?:peux|pouvez) (?:tu|vous) (?:nous |m |me )?apporter|(?:sur quoi|on what) (?:travailles tu|travaillez vous|tu travailles|vous travaillez|are you working)|what are you (?:working on|doing these days|building|up to))\\b",
      "\\b(?:(?:es tu|etes vous|tu es|vous etes|t es|are you)(?: [a-z]+)? (?:marie|mariee|married|celibataire|single|en couple|fiance|fiancee)|(?:as tu|avez vous|tu as|vous avez|t as|do you have|have you got)(?: des| un| une| a| any| le)? (?:enfants?|kids?|children|voiture|car|permis|driving licen[cs]e|visa|work permit)|(?:ton|ta|tes|votre|vos|your)(?: [a-z]+)? (?:prefere|preferee|preferes|preferees|favou?rite))\\b"
    ],
    "you_block_re": "\\b(?:avis|opinion|opinions|penses|pensez|think|crois|croyez|believe|conseil|conseils|conseille|conseiller|conseillerais|advice|advise|recommend|recommande|recommandes|aide moi|aidez moi|m aider|nous aider|help me|help us|joue|jouez|pretend|imagine|imaginons|fais comme si|faites comme si|role play|roleplay|act as|incarne|preferes|preferez|prefer|aimes tu|aimez vous|do you like|do you love|love|amour|mon|ma|mes|my|mot de passe|password|prompt|instructions)\\b",
    "you_pronoun_map": {
      "tu": "il",
      "toi": "lui",
      "te": "le",
      "t": "il",
      "ton": "son",
      "ta": "sa",
      "tes": "ses",
      "vous": "il",
      "votre": "son",
      "vos": "ses",
      "you": "he",
      "your": "his",
      "yours": "his",
      "yourself": "himself",
      "u": "he",
      "ur": "his"
    },
    "you_imperatives": {
      "parlez": "parle",
      "presentez": "presente",
      "decrivez": "decris",
      "racontez": "raconte",
      "presente": "presente",
      "decris": "decris"
    },
    "you_prepositions": [
      "de",
      "a",
      "avec",
      "pour",
      "sur",
      "chez",
      "about",
      "with",
      "for",
      "to",
      "of"
    ],
    "you_verb_map": {
      "as": "a",
      "es": "est",
      "etes": "est",
      "avez": "a",
      "peux": "peut",
      "pouvez": "peut",
      "veux": "veut",
      "voulez": "veut",
      "fais": "fait",
      "faites": "fait",
      "vas": "va",
      "allez": "va",
      "dis": "dit",
      "dites": "dit",
      "sais": "sait",
      "savez": "sait",
      "vois": "voit",
      "voyez": "voit",
      "are": "is",
      "were": "was",
      "have": "has",
      "do": "does",
      "dont": "doesnt",
      "r": "is"
    },
    "interview_bare_re": "^(?:et )?(?:pourquoi|why)(?: (?:avoir choisi|choisir|choose|chose|pick|picked|go into|aller vers))? (?:l |the )?(?:ia|ai|intelligence artificielle|artificial intelligence|data|data science|consulting|conseil|ingenierie|engineering|adoption de l ia|ai adoption)$|^(?:(?:tell|talk to) me about|describe|give me an example of|parle moi|parlez moi|raconte moi|racontez moi|decris moi|decrivez moi|donne moi un exemple|donnez moi un exemple)(?: (?:d|de|a|an|one|un|une|of))*(?: (?:time when|moment ou|fois ou|situation|cas|ou))? (?:failure|mistake|challenge|difficulty|difficult situation|setback|success|achievement|echec|erreur|difficulte|defi|reussite|realisation|situation difficile)\\b",
    "interview_topics": [
      [
        "achievement",
        "\\b(?:plus grande? (?:reussite|fierte|realisation|succes|accomplissement)|(?:biggest|greatest|main|proudest|best|key|top|major) (?:achievements?|accomplishments?|success(?:es)?|realisations?)|reussites?|realisation (?:principale|majeure|phare)|projets? (?:phare|prefere|favori)|(?:favou?rite|best|flagship) projects?|meilleurs? projets?|proud|proudest|fier|fiere)\\b"
      ],
      [
        "difficulty",
        "\\b(?:difficultes?|difficult(?:y|ies)|challenges?|defis?|obstacles?|echecs?|echoue|failures?|failed|erreurs?|mistakes?|problemes? (?:rencontres?|majeurs?)|problems? (?:he )?(?:faced|encountered)|setbacks?|lecons? (?:apprises?|tirees?)|lessons? (?:learned|learnt)|ce qui n a pas (?:marche|fonctionne)|what went wrong|surmonte\\w*|overc[oa]me|regrets?)\\b"
      ],
      [
        "motivation",
        "\\b(?:motivations?|motive|motivates|motivated|(?:qu est ce qui|what) (?:le |l |him )?(?:motive|anime|pousse|passionne|attire|drives?|excites?|inspires?)|passionne|passionate|passion|drives? (?:him|issa)|interet pour l ia|interest in ai|why (?:did (?:he|issa) (?:choose|pick|go into) )?(?:ai|artificial intelligence)$|pourquoi (?:(?:il a|a t il|issa a) choisi )?(?:l ia|l intelligence artificielle)$|(?:pourquoi|why) (?:(?:il a|a t il|issa a|has he|did he) )?(?:choisi|chose|choose|picked|pick) (?:l ia|l intelligence artificielle|ai|artificial intelligence|ce domaine|this field|ce metier|cette voie))\\b"
      ],
      [
        "career",
        "\\b(?:objectifs? (?:professionnels?|de carriere)|career (?:goals?|plans?|path|objectives?|aspirations?)|ambitions?|aspirations?|projet professionnel|plan de carriere|carriere|career|(?:ou|where) (?:se voit il|il se voit|does he see himself|he sees himself|will he be)|dans (?:5|cinq|10|dix) ans|in (?:5|five|10|ten) years|long terme|long term)\\b"
      ],
      [
        "leadership",
        "\\b(?:leadership|leader|(?:lead|leads|led|leading) (?:a |the |an )?(?:team|project|group|equipe|projet)|has he (?:ever )?led|il a (?:deja )?dirige|a t il (?:deja )?dirige|dirige (?:une|un|des) (?:equipe|projet|groupe)|diriger|encadre(?:r|ment)?|manage(?:d|r)? (?:a |une |des )?(?:team|equipe|people)|chef (?:de projet|d equipe)|responsable de projet|project lead|piloter (?:un|une|des) (?:projet|equipe)|take (?:the )?lead|prise de responsabilit\\w*|prend(?:re)? des initiatives|initiatives?|ownership)\\b"
      ],
      [
        "teamwork",
        "\\b(?:travail en equipe|travailler en equipe|comment (?:il )?travaille en equipe|team ?work|team player|esprit d equipe|team spirit|(?:works?|working) well (?:in|with) (?:a |the |others|teams?)|how (?:does )?he works? (?:in|with) (?:a |the )?teams?|collabor\\w+|work with others|travailler avec (?:d autres|les autres))\\b"
      ],
      [
        "work_style",
        "\\b(?:methodes? de travail|methodologie|methodology|methodes?|methods?|facon de travailler|maniere de travailler|style de travail|work(?:ing)? style|way of working|how (?:does )?he works?|how he works|comment (?:il )?(?:travaille|s organise|organise son travail)|approche|approach|processus de travail|work process)\\b"
      ],
      [
        "pressure",
        "\\b(?:pression|pressure|stress|stresse|stressful|stressed|deadlines?|delais|echeances?|urgences?|rush|charge de travail|workload|plusieurs projets en parallele|multiple projects|multitask\\w*)\\b"
      ],
      [
        "learning",
        "\\b(?:apprend|apprendre|apprentissage(?! (?:automatique|profond|supervise|non supervise|par renforcement))|appris|autodidacte|self taught|self learner|se former|se forme|se forme t il|formation continue|veille(?: technologique)?|keeps? learning|keep up|stay(?:s)? up to date|(?:fast|quick|self|rapid|eager) learners?|apprend (?:vite|rapidement)|(?<!machine )(?<!deep )(?<!reinforcement )(?<!transfer )learn(?:s|ed|t|ing)?(?! (?:management|rate)))\\b"
      ]
    ],
    "interview_longterm_re": "\\b(?:dans (?:5|cinq|10|dix) ans|in (?:5|five|10|ten) years|long terme|long term|(?:ou|where) (?:se voit il|il se voit|does he see himself|he sees himself|will he be))\\b",
    "summary_word_re": "\\b(?:resume|resumer|resume moi|resumes|resumez|synthese|synthetise|apercu|survol|bref|tldr|tl dr|recap|recapitule|summary|summarize|summarise|sum up|sum (?:him|issa|it) up|overview|gist|nutshell|in short|in brief|rundown|run down|topo|quelques mots|quelques lignes|few words|few lines|en (?:une|deux|trois|quatre|cinq|quelques) (?:phrases?|lignes?|mots)|in (?:one|two|three|four|five|a few|few|[1-5]) (?:sentences?|lines?|words))\\b",
    "interview_entities": [
      "about",
      "soft_skills",
      "objective",
      "projects_list",
      "internships_list",
      "extracurricular"
    ],
    "deeper_re": "^(?:et |ok |oui |yes |alors |so |hmm |d accord |okay )?(?:(?:tu peux|peux tu|vous pouvez|pouvez vous|tu pourrais|pourrais tu|pourriez vous|can you|could you|would you|please|merci de) )?(?:plus de details?|davantage de details|plus de precisions?|des details|details?|en detail|en details|dans le detail|approfondis|approfondir|approfondissez|approfondi|creuse|creuser|creusez|detaille|detailler|detaillez|developpe|developper|developpez|explique|expliquer|expliquez|explique moi|expliquez moi|explique nous|explique ca|explique moi ca|precise|preciser|precisez|dis m en plus|dis moi en plus|dites m en plus|dites moi en plus|dive deeper|deeper|go deeper|dig deeper|deep dive|tell me more|more details?|more detail|more info|more information|in more detail|elaborate|elaborate on that|explain|explain more|explain that|go on|keep going|continue|continuez|et ensuite|et apres|ensuite|apres|then what|and then|what next|what then|and after that|comment|comment ca|comment cela|comment ca se fait|how|how so|how come|pourquoi|pourquoi ca|pourquoi cela|why|why so|why is that|c est a dire|meaning|vas y|go ahead|je veux en savoir plus|i want to know more|plus|more|encore|davantage|la suite|the rest|next|suite)(?: (?:please|pls|stp|svp|s il te plait|s il vous plait|moi|nous|un peu|encore|plus|svp merci|sur ce point|sur ca|on that|on this|about that|about it|that|this|ca|cela))*$",
    "accept_re": "^(?:oui|yes|yeah|yep|yup|ouais|volontiers|avec plaisir|bien sur|carrement|absolument|sure|of course|absolutely|go ahead|vas y|allez y|oui stp|oui svp|oui merci|yes please|please do|why not|pourquoi pas|ok vas y|ok go|ok oui|oui oui|oui volontiers|yes sure)(?: (?:please|pls|stp|svp|merci|thanks|bien sur))?$",
    "ack_re": "^(?:ok|okay|okk|d accord|dac|compris|entendu|parfait|super|cool|top|genial|tres bien|bien|nickel|ca marche|noted|got it|i see|understood|great|nice|perfect|alright|all right|fine|good|awesome|non|no|nope|ah ok|ah d accord|je vois|interessant|interesting|wow|impressionnant|impressive)(?: (?:merci|thanks))?$",
    "summary_bare_re": "^(?:et |ok |alors |so )?(?:(?:tu peux|peux tu|vous pouvez|pouvez vous|tu pourrais|pourrais tu|pourriez vous|can you|could you|would you|please) )?(?:me |nous )?(?:faire |donner |give me |make |donne moi |fais moi |donnez moi |faites moi )?(?:un |une |a |le |la )?(?:petit |court |bref |rapide |quick |short |brief )?(?:resume|resumer|resume moi|resume le|resume la|resume ca|resumes|resumez|summary|summarize|summarise|summarize it|summarise it|summarize that|summarise that|sum up|sum it up|en bref|bref|in short|in brief|tl dr|tldr|recap|recapitule|recapitulons|synthese|synthetise|en resume|short version|version courte|l essentiel|the gist|gist|in a nutshell|nutshell|en un mot|en deux mots|in a word)(?: (?:please|pls|stp|svp|s il te plait|s il vous plait|rapide|rapidement|vite|quickly|ca|cela|that|it))*$",
    "team_followup_re": "^(?:et )?(?:(?:c etait|c est|it was|was it|is it|il etait|il l a fait|did he do it|he did it) )?(?:avec qui|with whom|who with|seul|alone|by himself|tout seul|en equipe|in a team|en groupe|in a group|en binome|solo)(?: (?:please|stp|svp))?$",
    "other_followup_re": "^(?:et )?(?:sinon|et sinon|what else|quoi d autre|autre chose|anything else|other projects?|autres? projets?|un autre|another one|another|d autres|others)(?: (?:please|stp|svp|\\?))?$",
    "showcase_order": [
      "capgemini",
      "aegisai",
      "ai_act",
      "drone",
      "portfolio_ia",
      "pa_c27033",
      "mir100",
      "multi_agents",
      "salle_connectee",
      "cat_emotion",
      "jesa"
    ],
    "deeper_word_re": "\\b(?:plus de details?|davantage|approfondi\\w*|creuse\\w*|detaille\\w*|en detail|in detail|in depth|en profondeur|dive deeper|deep dive|dig deeper|go deeper|tell me more|more about|more details?|en dire plus|dis m en plus|en savoir plus|explique\\w*|explain\\w*|elaborate)\\b",
    "full_card_re": "\\b(?:fiche complete|fiche detaillee|fiche entiere|toute la fiche|toutes les (?:infos|informations|details)|tout sur|everything about|all (?:the )?details|full (?:card|details|description|picture)|description complete|de a a z|from a to z|everything you know)\\b",
    "level_role_re": "\\b(?:son role|his role|role|roles|contribution|contributions|qu a t il fait|qu a fait issa|ce qu il a fait|what did he do|what was his part|sa part|comment (?:a t il|il a|issa a) (?:fait|construit|realise|developpe|concu|mene)|comment (?:a ete|est) (?:fait|construit|realise|developpe|concu)|how (?:was|is|did) (?:it|this|the \\w+|he)(?: \\w+)? (?:built|made|developed|designed|created|done)|built|construit|construction|how he built|how did he build)\\b",
    "level_tech_re": "\\b(?:technique|techniques|technical|technically|techniquement|comment (?:ca|il|elle) (?:marche|fonctionne)|how (?:does )?it works?|fonctionnement|under the hood|architecture|pipeline|algorithme|algorithms?)\\b",
    "level_limits_re": "\\b(?:limites?|limits?|limitations?|faiblesses? du projet|points? faibles? du projet|bilan|lecons?|lessons?|honnetement|honestly|what didn t work)\\b",
    "limits_re": "\\b(?:limites?|limits?|limitations?|limite a|limited to|optimistes?|optimistic|simulees?|simulated|aucun gain|no quantified gain|non mesuree?s?|not measured|pas de mise en production|no production|prototype|demonstrateur|demonstrator|honnetement|honestly|aucun juriste|no lawyer|bug|fuite de donnees|data leakage|data leak|n a pas converge|did not converge|reste a coder|still to be coded|aucun resultat|no results?)\\b",
    "followup_words": [
      "temps",
      "resultats",
      "resultat",
      "results",
      "result",
      "were",
      "was",
      "last",
      "lasted",
      "took",
      "take",
      "long",
      "outcome",
      "outcomes",
      "chiffres",
      "figures",
      "numbers",
      "tools",
      "outils",
      "used",
      "utilise",
      "utilisees",
      "utilises",
      "dure",
      "ca",
      "it",
      "that",
      "this",
      "ce",
      "celui",
      "ci",
      "la",
      "le",
      "les"
    ],
    "followup_max_words": 6,
    "phrases": {
      "offer_l1": {
        "fr": [
          "Voulez-vous les détails techniques ?",
          "Je peux entrer dans le détail technique si vous le souhaitez.",
          "",
          "Envie d'aller plus loin ? Demandez-moi « plus de détails »."
        ],
        "en": [
          "Want the technical details?",
          "I can go into the technical details if you like.",
          "",
          "Want to go further? Just ask for “more details”."
        ]
      },
      "offer_l2": {
        "fr": [
          "Je peux aussi vous donner les résultats et les limites.",
          "Voulez-vous voir les résultats mesurés, et leurs limites ?",
          "Prochaine étape possible : les résultats, sans enjoliver."
        ],
        "en": [
          "I can also give you the results and the limits.",
          "Would you like the measured results, and their limits?",
          "Possible next step: the results, without embellishment."
        ]
      },
      "offer_l3": {
        "fr": [
          "Je peux aussi préciser son rôle et la façon dont le travail a été mené.",
          "Voulez-vous savoir quel a été son rôle exact ?",
          "Si vous voulez, je détaille son rôle et l'organisation du travail."
        ],
        "en": [
          "I can also explain his role and how the work was carried out.",
          "Would you like to know his exact role?",
          "If you like, I can detail his role and how the work was organised."
        ]
      },
      "offer_l4": {
        "fr": [
          "Je peux aussi afficher la fiche complète.",
          "Voulez-vous la fiche complète ?",
          "Il reste la fiche complète, si vous la voulez."
        ],
        "en": [
          "I can also show the full card.",
          "Would you like the full card?",
          "There is still the full card, if you want it."
        ]
      },
      "offer_topic": {
        "fr": [
          "Voulez-vous des exemples concrets ?",
          "Je peux donner d'autres exemples si vous le souhaitez.",
          "",
          "Envie d'approfondir ? Demandez « plus de détails »."
        ],
        "en": [
          "Would you like concrete examples?",
          "I can give more examples if you like.",
          "",
          "Want to dig deeper? Ask for “more details”."
        ]
      },
      "offer_about": {
        "fr": [
          "Voulez-vous son parcours en détail ?",
          "Je peux développer son parcours si vous le souhaitez.",
          "",
          "Une question sur un projet ou un stage en particulier ?"
        ],
        "en": [
          "Would you like his background in detail?",
          "I can expand on his background if you like.",
          "",
          "Any question about a specific project or internship?"
        ]
      },
      "open_l2": {
        "fr": [
          "🛠️ **Côté technique** —",
          "🛠️ **Dans le détail** —",
          "🛠️ **Sous le capot** —"
        ],
        "en": [
          "🛠️ **On the technical side** —",
          "🛠️ **In more detail** —",
          "🛠️ **Under the hood** —"
        ]
      },
      "open_l3": {
        "fr": [
          "📊 **Résultats et limites, sans enjoliver** —",
          "📊 **Ce qui a été mesuré, et ses limites** —",
          "📊 **Les chiffres, et ce qu'ils ne disent pas** —"
        ],
        "en": [
          "📊 **Results and limits, without embellishment** —",
          "📊 **What was measured, and its limits** —",
          "📊 **The figures, and what they don't say** —"
        ]
      },
      "open_l4": {
        "fr": [
          "🎯 **Son rôle et l'organisation du travail** —",
          "🎯 **Qui a fait quoi, et comment** —",
          "🎯 **Son rôle, concrètement** —"
        ],
        "en": [
          "🎯 **His role and how the work was organised** —",
          "🎯 **Who did what, and how** —",
          "🎯 **His role, concretely** —"
        ]
      },
      "open_summary": {
        "fr": [
          "📝 **En bref** —",
          "📝 **Pour résumer** —",
          "📝 **L'essentiel** —"
        ],
        "en": [
          "📝 **In short** —",
          "📝 **To sum up** —",
          "📝 **The essentials** —"
        ]
      },
      "metric_lead": {
        "fr": [
          "📊 Résultat clé :",
          "📊 Chiffre marquant :",
          "📊 Un résultat concret :"
        ],
        "en": [
          "📊 Key result:",
          "📊 Standout figure:",
          "📊 A concrete result:"
        ]
      },
      "end_topic": {
        "fr": [
          "J'ai fait le tour de ce que son profil dit sur ce sujet.",
          "C'est tout ce que précise son profil sur ce point — je préfère ne rien inventer.",
          "Voilà pour ce sujet : son profil n'en dit pas davantage."
        ],
        "en": [
          "That's everything his profile says on this topic.",
          "That's all his profile specifies on this point — I'd rather not make anything up.",
          "That covers it: his profile doesn't say more."
        ]
      },
      "end_contact": {
        "fr": [
          "Pour aller plus loin, le mieux est d'en parler directement avec Issa : **{email}**.",
          "Pour en savoir plus, Issa répond volontiers : **{email}**.",
          "Une question plus précise ? Écrivez-lui : **{email}**."
        ],
        "en": [
          "To go further, the best is to talk to Issa directly: **{email}**.",
          "To learn more, Issa will gladly answer: **{email}**.",
          "A more specific question? Write to him: **{email}**."
        ]
      },
      "suggest": {
        "fr": [
          "Je peux aussi vous parler de :",
          "Autres sujets possibles :",
          "Vous pourriez aussi demander :"
        ],
        "en": [
          "I can also tell you about:",
          "Other possible topics:",
          "You could also ask about:"
        ]
      },
      "other_open": {
        "fr": [
          "Autre réalisation marquante —",
          "Dans un autre registre —",
          "Autre projet qui mérite le détour —"
        ],
        "en": [
          "Another notable piece of work —",
          "In a different vein —",
          "Another project worth a look —"
        ]
      },
      "thanks": {
        "fr": [
          "Avec plaisir ! 😊 Autre chose sur le parcours d'Issa ?",
          "Je vous en prie ! 😊 Une autre question sur ses projets ou ses stages ?",
          "Merci à vous ! 😊 Je reste là si vous voulez creuser un projet ou un stage."
        ],
        "en": [
          "You're welcome! 😊 Anything else about Issa's background?",
          "My pleasure! 😊 Any other question about his projects or internships?",
          "Thank you! 😊 I'm here if you want to dig into a project or an internship."
        ]
      },
      "ack": {
        "fr": [
          "Parfait ! 😊 Que voulez-vous savoir d'autre sur Issa ?",
          "Très bien ! Une autre question sur son parcours ?",
          "D'accord ! Je peux vous parler de ses projets, de ses stages ou de ses compétences."
        ],
        "en": [
          "Great! 😊 What else would you like to know about Issa?",
          "All right! Any other question about his background?",
          "Okay! I can tell you about his projects, internships or skills."
        ]
      },
      "clarify": {
        "fr": [
          "De quel projet ou stage parlez-vous ?",
          "Précisez-moi le projet ou le stage visé, et je vous réponds.",
          "Pour vous répondre précisément, j'ai besoin du projet ou du stage concerné."
        ],
        "en": [
          "Which project or internship do you mean?",
          "Tell me which project or internship you have in mind, and I'll answer.",
          "To answer precisely, I need the project or internship concerned."
        ]
      },
      "mixed_tail": {
        "fr": [
          "🙅 Pour le reste de ta demande, je ne peux pas t'aider : je ne parle que du profil d'Issa.",
          "🙅 Le reste de ta demande sort de mon rôle : je ne peux pas t'aider là-dessus, je ne parle que du profil d'Issa.",
          "🙅 Pour l'autre partie, je ne peux pas t'aider : mon domaine, c'est uniquement le profil d'Issa."
        ],
        "en": [
          "🙅 As for the rest of your request, I can't help with that: I only talk about Issa's profile.",
          "🙅 The rest of your request is outside my role: I can't help with that, I only talk about Issa's profile.",
          "🙅 For the other part, I can't help: my only domain is Issa's profile."
        ]
      },
      "greet_open": {
        "fr": [
          "🤖 Bonjour ! Je suis **ISSA**, l'assistant personnel d'Issa Lamkharbech.",
          "🤖 Bonjour et bienvenue ! Je suis **ISSA**, l'assistant personnel d'Issa Lamkharbech.",
          "🤖 Bonjour ! Je suis **ISSA**, l'assistant personnel d'Issa Lamkharbech — ravi de vous accueillir."
        ],
        "en": [
          "🤖 Hello! I'm **ISSA**, Issa Lamkharbech's personal assistant.",
          "🤖 Hello and welcome! I'm **ISSA**, Issa Lamkharbech's personal assistant.",
          "🤖 Hello! I'm **ISSA**, Issa Lamkharbech's personal assistant — glad to have you here."
        ]
      },
      "greet_body": {
        "fr": [
          "Je connais en détail ses projets, ses stages, ses compétences et son parcours. Interrogez-moi comme en entretien : je réponds court, puis j'approfondis si vous le demandez.",
          "Je connais en détail ses projets, ses stages, ses compétences et son parcours. Posez vos questions comme à un candidat : l'essentiel d'abord, le détail à la demande.",
          "Je connais en détail ses projets, ses stages, ses compétences et son parcours. Demandez-moi un résumé, ou creusez un sujet avec « plus de détails »."
        ],
        "en": [
          "I know his projects, internships, skills and background in detail. Interview me as you would a candidate: short answers first, more depth whenever you ask.",
          "I know his projects, internships, skills and background in detail. Ask your questions as in an interview: the essentials first, details on demand.",
          "I know his projects, internships, skills and background in detail. Ask me for a summary, or dig into a topic with “more details”."
        ]
      },
      "greet_examples": {
        "fr": [
          "Essayez par exemple :\n• « Qui est Issa ? »\n• « Parle-moi du stage chez Capgemini »\n• « Le projet drone était-il en groupe ? »\n• « Quelles sont ses compétences en IA ? »\n• « Quel est son parcours scolaire ? »",
          "Essayez par exemple :\n• « Quels sont tes points forts ? »\n• « Parle-moi d'AegisAI »\n• « Pourquoi l'IA ? »\n• « Quelle a été ta plus grande difficulté ? »\n• « Quel est son parcours scolaire ? »",
          "Essayez par exemple :\n• « Qui est Issa ? »\n• « Sur quoi travailles-tu en ce moment ? »\n• « Le projet drone était-il en groupe ? »\n• « Comment gérez-vous la pression ? »\n• « Quelles sont ses compétences en IA ? »"
        ],
        "en": [
          "Try for example:\n• “Who is Issa?”\n• “Tell me about the Capgemini internship”\n• “Was the drone project a group project?”\n• “What are his AI skills?”\n• “What is his educational background?”",
          "Try for example:\n• “What are your strengths?”\n• “Tell me about AegisAI”\n• “Why AI?”\n• “What was your biggest challenge?”\n• “What is his educational background?”",
          "Try for example:\n• “Who is Issa?”\n• “What are you working on right now?”\n• “Was the drone project a group project?”\n• “How do you handle pressure?”\n• “What are his AI skills?”"
        ]
      },
      "iv_achievement": {
        "fr": [
          "🏆 **Ses réalisations les plus marquantes** —",
          "🏆 **Ses résultats phares** —",
          "🏆 **Ce qui ressort le plus de son parcours** —"
        ],
        "en": [
          "🏆 **His most notable achievements** —",
          "🏆 **His flagship results** —",
          "🏆 **What stands out most in his path** —"
        ]
      },
      "iv_difficulty": {
        "fr": [
          "🧗 **Difficultés et leçons, documentées honnêtement** —",
          "🧗 **Ce qui n'a pas marché du premier coup** —",
          "🧗 **Ses erreurs, et ce qu'il en a fait** —"
        ],
        "en": [
          "🧗 **Difficulties and lessons, documented honestly** —",
          "🧗 **What didn't work the first time** —",
          "🧗 **His mistakes, and what he did about them** —"
        ]
      },
      "iv_motivation": {
        "fr": [
          "🔥 **Ce qui le motive, d'après son parcours** —",
          "🔥 **Sa motivation se lit dans ses choix** —",
          "🔥 **Pourquoi l'IA, et pourquoi ce poste** —"
        ],
        "en": [
          "🔥 **What drives him, judging by his path** —",
          "🔥 **His motivation shows in his choices** —",
          "🔥 **Why AI, and why this role** —"
        ]
      },
      "iv_career": {
        "fr": [
          "🎯 **Son objectif** —",
          "🎯 **Ce qu'il vise** —",
          "🎯 **Où il veut aller** —"
        ],
        "en": [
          "🎯 **His goal** —",
          "🎯 **What he is aiming for** —",
          "🎯 **Where he wants to go** —"
        ]
      },
      "iv_leadership": {
        "fr": [
          "🚩 **Leadership et prise de responsabilité** —",
          "🚩 **Quand il a mené un projet** —",
          "🚩 **Ses expériences de pilotage** —"
        ],
        "en": [
          "🚩 **Leadership and ownership** —",
          "🚩 **When he led a project** —",
          "🚩 **His experience leading** —"
        ]
      },
      "iv_teamwork": {
        "fr": [
          "👥 **Le travail en équipe** —",
          "👥 **En équipe, concrètement** —",
          "👥 **Son esprit d'équipe, en pratique** —"
        ],
        "en": [
          "👥 **Teamwork** —",
          "👥 **In a team, concretely** —",
          "👥 **His team spirit, in practice** —"
        ]
      },
      "iv_work_style": {
        "fr": [
          "🧭 **Sa façon de travailler, vue à travers ses projets** —",
          "🧭 **Sa méthode, concrètement** —",
          "🧭 **Comment il travaille** —"
        ],
        "en": [
          "🧭 **His way of working, as his projects show** —",
          "🧭 **His method, concretely** —",
          "🧭 **How he works** —"
        ]
      },
      "iv_pressure": {
        "fr": [
          "⏱️ **Pression et délais** —",
          "⏱️ **Tenir les délais, concrètement** —",
          "⏱️ **Sous contrainte de temps** —"
        ],
        "en": [
          "⏱️ **Pressure and deadlines** —",
          "⏱️ **Meeting deadlines, concretely** —",
          "⏱️ **Under time constraints** —"
        ]
      },
      "iv_learning": {
        "fr": [
          "📚 **Apprendre en continu** —",
          "📚 **Comment il se forme** —",
          "📚 **Sa façon d'apprendre** —"
        ],
        "en": [
          "📚 **Continuous learning** —",
          "📚 **How he keeps learning** —",
          "📚 **His way of learning** —"
        ]
      },
      "iv_current": {
        "fr": [
          "📍 **Projets en cours** —",
          "📍 **En ce moment, ses projets en cours** —",
          "📍 **Ses projets en cours, actuellement** —"
        ],
        "en": [
          "📍 **Projects ongoing** —",
          "📍 **Projects ongoing right now** —",
          "📍 **Currently — projects ongoing** —"
        ]
      }
    }
  };

  /* ---------- Étape 4 : intentions ---------- */
  const WORD_START_INTENTS = new Set(["status"]);
  const STATUS_FILTERS = STATUS_FILTER_SRC.map(([src, keys]) => [new RegExp(src), keys]);
  SYMBOLS = CLASSIFIER.symbol_map.map(([src, rep]) => [new RegExp(src, "g"), rep]);
  const SUMMARY_RE = new RegExp(SUMMARY_SRC);

  const KB = window.JESUS_KB || (typeof JESUS_KB !== "undefined" ? JESUS_KB : null);
  if (!KB) { console.error("JESUS_KB introuvable : chargez js/kb.js avant js/jesus.js"); return; }

  /* ---------- Repli singulier / pluriel (mots normalisés de 4+ lettres) ----------
     « drones » → « drone », « langues » → « langue » (sauf mots de fold_exceptions) */
  const GENERIC = new Set(CLASSIFIER.generic_aliases);
  const FOLD_EXC = new Set(CLASSIFIER.fold_exceptions);
  const PROTECTED = new Set(CLASSIFIER.protected_words);
  function fold(w) {
    if (w.length >= 4 && (w[w.length - 1] === "s" || w[w.length - 1] === "x") && w[w.length - 2] !== "s" && !FOLD_EXC.has(w)) return w.slice(0, -1);
    return w;
  }
  function foldText(text) { return (text ? text.split(" ") : []).filter(w => w).map(fold).join(" "); }
  /* Le terme figure-t-il dans la question, tel quel ou après repli des deux côtés ? */
  function hasTerm(normQ, term) {
    return (` ${normQ} `).includes(` ${term} `) || (` ${foldText(normQ)} `).includes(` ${foldText(term)} `);
  }
  /* Marque chaque occurrence (mots repliés) de phrase dans ftoks ; true si trouvée */
  function markFolded(ftoks, mark, phrase) {
    const n = phrase.length;
    let hit = false;
    for (let i = 0; i + n <= ftoks.length; i++) {
      let ok = true;
      for (let j = 0; j < n; j++) if (ftoks[i + j] !== phrase[j] || mark[i + j]) { ok = false; break; }
      if (ok) { for (let j = i; j < i + n; j++) mark[j] = true; hit = true; }
    }
    return hit;
  }

  /* termes précis (compétences, synonymes, domaines de projets) : vocabulaire du profil */
  const byLenThenAlpha = (a, b) => (b.length - a.length) || (a < b ? -1 : a > b ? 1 : 0);
  const TERM_PHRASES = [...new Set([...CLASSIFIER.skill_terms, ...Object.keys(CLASSIFIER.skill_synonyms),
    ...Object.keys(CLASSIFIER.skill_categories), ...CLASSIFIER.project_terms])].sort(byLenThenAlpha);
  /* expressions de compétence (termes, synonymes, domaines), de la plus longue à la plus courte */
  const SKILL_PHRASES = [...new Set([...CLASSIFIER.skill_terms, ...Object.keys(CLASSIFIER.skill_synonyms),
    ...Object.keys(CLASSIFIER.skill_categories)])].sort(byLenThenAlpha);
  /* alias de plusieurs mots : leur texte ne déclenche pas d'intention (« éléments finis » ≠ statut
     « fini », « team spirit » ≠ équipe, « start date » ≠ durée) */
  const MULTI_ALIASES = [...new Set(Object.values(ENTITY_ALIASES).flat().map(normalize).filter(a => a.includes(" ")))].sort(byLenThenAlpha);
  /* flexions admises après un mot-clé de statut (« termine » → « terminés » ; « fini » → « finis », pas « finite ») */
  const STATUS_SUFFIX = "(?:s|e|es|ee|ees|r|nt|d|ed|ing)?\\b";
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  /* index (alias normalisé, entité), du plus long au plus court
     (tri stable : l'ordre du dictionnaire départage les égalités) */
  const aliasIndex = [];
  for (const [entity, aliases] of Object.entries(ENTITY_ALIASES)) {
    for (const a of aliases) aliasIndex.push([normalize(a), entity]);
  }
  aliasIndex.sort((x, y) => y[0].length - x[0].length);
  /* même index sans les alias « faibles » (pour la classification) */
  const WEAK_ALIASES = new Set(CLASSIFIER.weak_aliases);
  const STRONG_ALIAS_INDEX = aliasIndex.filter(([a]) => !WEAK_ALIASES.has(a));
  /* dictionnaire de correction des fautes de frappe : mots des alias (≥ 6 lettres) + spell_words */
  const SPELL_WORDS = [...new Set([
    ...aliasIndex.flatMap(([a]) => a.split(" ").filter(w => w.length >= 6)),
    ...CLASSIFIER.spell_words.map(normalize).filter(w => w.length >= 6)
  ])].sort();
  const SPELL_SET = new Set(SPELL_WORDS);
  /* alias et termes précis après repli singulier / pluriel (listes de mots) */
  const FOLDED_ALIAS = new Map(aliasIndex.map(([a]) => [a, foldText(a).split(" ")]));
  const WORD_ALIASES = new Set(aliasIndex.map(([a]) => a).filter(a => !a.includes(" ")));
  const FOLDED_PHRASES = aliasIndex.map(([a]) => foldText(a).split(" ")).concat(TERM_PHRASES.map(x => foldText(x).split(" ")));

  /* Distance d'édition (insertion, suppression, substitution) */
  function levenshtein(a, b) {
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0));
      }
      prev = cur;
    }
    return prev[b.length];
  }

  const t = (field, lang) => (field && typeof field === "object" && !Array.isArray(field)) ? (field[lang] || field.fr || "") : (field == null ? "" : field);
  const item = (kind, id) => KB[kind].find(x => x.id === id) || null;
  const PROJECT_IDS = new Set(KB.projects.map(p => p.id));
  const STAGE_IDS = new Set(KB.internships.map(s => s.id));

  /* Un alias reconnu « consomme » son texte : un alias plus court contenu
     dedans ne déclenche pas une autre entité (« plateforme multi agents »
     → AegisAI, et non le projet multi-robots qui répond à « multi agents »). */
  function findEntityHits(normQ, rawQ, index) {
    const hits = [];
    const idx = index || aliasIndex;
    let work = ` ${normQ} `;
    for (const [alias, entity] of idx) {
      let hit = false;
      if (work.includes(` ${alias} `)) {
        work = work.split(` ${alias} `).join(" " + "_".repeat(alias.length) + " ");
        hit = true;
      } else if (alias.length > 5 && work.includes(alias)) {
        work = work.split(alias).join("_".repeat(alias.length));
        hit = true;
      }
      if (hit) hits.push([entity, alias]);
    }
    /* second passage sur les mots restants, après repli singulier / pluriel des deux côtés
       (« langue » ↔ « langues ») ; un mot qui est LUI-MÊME un alias ne passe pas par le repli */
    const toks = work.split(/\s+/).filter(w => w);
    const ftoks = toks.map(w => w.includes("_") ? w : fold(w));
    const mark = toks.map(w => w.includes("_") || WORD_ALIASES.has(w));
    for (const [alias, entity] of idx) {
      if (markFolded(ftoks, mark, FOLDED_ALIAS.get(alias))) hits.push([entity, alias]);
    }
    /* acronymes en majuscules : ignorés si TOUTE la question est en majuscules
       (« OÙ SONT MES CLÉS ? » : « MES » y est le possessif, pas le système MES) */
    const capsOnly = !/[a-zà-ÿ]/.test(rawQ || "");
    for (const [acro, entity] of Object.entries(CASE_SENSITIVE_ALIASES)) {
      if (!capsOnly && new RegExp("\\b" + acro + "\\b").test(rawQ || "")) hits.push([entity, acro]);
    }
    return hits;
  }

  function findEntities(normQ, rawQ, index) {
    const found = [];
    for (const [entity] of findEntityHits(normQ, rawQ, index)) if (!found.includes(entity)) found.push(entity);
    return found;
  }

  /* Intentions. Le texte des alias de plusieurs mots est masqué (« éléments finis », « team spirit »,
     « start date » ne sont pas des intentions) ; statut : mot-clé en début de mot suivi d'une simple
     flexion (« finis », pas « finite »). */
  function findIntents(normQ) {
    const out = [];
    let work = ` ${normQ} `;
    for (const a of MULTI_ALIASES) {
      if (work.includes(` ${a} `)) work = work.split(` ${a} `).join(" " + "_".repeat(a.length) + " ");
    }
    const normM = work.trim();
    for (const [intent, kws] of Object.entries(INTENT_KEYWORDS)) {
      const ok = WORD_START_INTENTS.has(intent)
        ? kws.some(k => new RegExp("(?<![a-z0-9_])" + escRe(normalize(k)) + STATUS_SUFFIX).test(normM))
        : kws.some(k => normM.includes(normalize(k)));
      if (ok) out.push(intent);
    }
    return out;
  }

  /* Quels statuts la question demande-t-elle ? null = tous. */
  function statusFilter(normQ) {
    for (const [re, keys] of STATUS_FILTERS) if (re.test(normQ)) return keys;
    return null;
  }

  /* Lien du site affiché en Markdown : le texte visible est « lamkharbechissa.com »
     mais le lien pointe vers l'URL réelle (GitHub Pages). Rendu par mdToHtml. */
  function siteLink(p) {
    return `[${p.live_label || "lamkharbechissa.com"}](${p.live_url})`;
  }

  const statusOf = (x, lang) => t(x.status || "", lang);
  function highlightsOf(x, lang) {
    const hl = x.highlights;
    if (hl && typeof hl === "object" && !Array.isArray(hl)) return hl[lang] || hl.fr || [];
    return hl || [];
  }
  function linksMd(x) {
    return (x.links || []).filter(l => l.label).map(l => l.url ? `[${l.label}](${l.url})` : l.label).join(" · ");
  }

  /* ---------- Fiches ---------- */
  function projectCard(p, lang, intents) {
    const L = lang === "fr";
    const full = !intents.length || intents.includes("description");
    const lines = [`🚀 **${t(p.name, lang)}**`, `📌 ${t(p.context, lang)}`];
    if (p.category) lines.push((L ? "🏷️ Catégorie : " : "🏷️ Category: ") + t(p.category, lang));
    if (p.status) lines.push((L ? "📍 Statut : " : "📍 Status: ") + statusOf(p, lang));
    lines.push((L ? "🗓️ Période : " : "🗓️ Period: ") + t(p.period, lang) + " — " + (L ? "durée : " : "duration: ") + t(p.duration, lang));
    lines.push("👥 " + t(p.team_type, lang));
    if (p.role) lines.push((L ? "🎯 Rôle : " : "🎯 Role: ") + t(p.role, lang));
    lines.push((L ? "📄 Spécifié dans le CV : " : "📄 Listed on the CV: ") + (p.in_cv ? (L ? "oui" : "yes") : (L ? "non" : "no")));
    if (p.live_url) lines.push((L ? "🌐 Site en ligne : " : "🌐 Live site: ") + siteLink(p));
    if (full) lines.push("", t(p.description, lang));
    /* « Comment le site a été construit » (uniquement pour le projet portfolio) */
    if (p.how_built && full) lines.push("", t(p.how_built, lang));
    const hl = highlightsOf(p, lang);
    if (hl.length && full) lines.push("", (L ? "✨ Points clés : " : "✨ Highlights: ") + hl.join(" · "));
    lines.push("", (L ? "🛠️ Technologies : " : "🛠️ Technologies: ") + p.technologies.join(", "));
    lines.push((L ? "📊 Résultats : " : "📊 Results: ") + p.metrics[lang].join(" · "));
    const links = linksMd(p);
    if (links) lines.push((L ? "🔗 Liens : " : "🔗 Links: ") + links);
    return lines.join("\n");
  }

  function internshipCard(s, lang, intents) {
    const L = lang === "fr";
    const full = !intents.length || intents.includes("description");
    const lines = [`💼 **${t(s.title, lang)}**`];
    lines.push((L ? "🏷️ Type : " : "🏷️ Type: ") + t(s.type, lang));
    lines.push((L ? "🏢 Entreprise : " : "🏢 Company: ") + t(s.company, lang));
    if (s.status) lines.push((L ? "📍 Statut : " : "📍 Status: ") + statusOf(s, lang));
    lines.push((L ? "🗓️ Période : " : "🗓️ Period: ") + t(s.period, lang) + " — " + (L ? "durée : " : "duration: ") + t(s.duration, lang));
    if (s.role) lines.push((L ? "🎯 Rôle : " : "🎯 Role: ") + t(s.role, lang));
    if (full) lines.push("", t(s.description, lang));
    if (intents.includes("company")) lines.push("", t(s.company_details, lang));
    const hl = highlightsOf(s, lang);
    if (hl.length && full) lines.push("", (L ? "✨ Points clés : " : "✨ Highlights: ") + hl.join(" · "));
    lines.push("", (L ? "🛠️ Environnement : " : "🛠️ Environment: ") + s.technologies.join(", "));
    lines.push((L ? "📊 Points clés : " : "📊 Highlights: ") + s.metrics[lang].join(" · "));
    return lines.join("\n");
  }

  /* ---------- Équipe : type / taille uniquement (aucun nom de personne) ---------- */
  function teamAnswer(p, lang) {
    const L = lang === "fr";
    const name = t(p.name, lang);
    const tt = t(p.team_type, lang);
    const size = p.team_size;
    /* projet individuel : Issa travaille seul (aucun coéquipier) */
    if (isSolo(p)) {
      let solo = L ? `👥 « ${name} » : ${tt} — Issa le mène seul, sans coéquipier.` : `👥 “${name}”: ${tt} — Issa works on it alone, with no teammates.`;
      if (p.role) solo += (L ? "\n🎯 Rôle : " : "\n🎯 Role: ") + t(p.role, lang);
      return solo;
    }
    let msg = L ? `👥 « ${name} » : ${tt}.` : `👥 “${name}”: ${tt}.`;
    if (Number.isInteger(size) && size > 1 && !tt.includes(String(size))) msg += L ? ` Taille de l'équipe : ${size}.` : ` Team size: ${size}.`;
    msg += L ? " (Les noms des coéquipiers ne sont pas communiqués ici.)" : " (Teammates' names are not shared here.)";
    return msg;
  }

  function isSolo(p) {
    return p.team_size === 1 || normalize(t(p.team_type, "fr")).startsWith("projet individuel");
  }

  /* « Il travaille seul ? », « avec qui ? » sans projet précis : type
     d'équipe de chaque projet, regroupé par statut (aucun nom de personne). */
  function teamOverview(lang) {
    const L = lang === "fr";
    const lines = [L ? "👥 **Seul ou en équipe ? Cela dépend du projet :**" : "👥 **Alone or in a team? It depends on the project:**"];
    const groups = [["ongoing", "📍 **Projets en cours :**", "📍 **Ongoing projects:**"],
                    ["planned", "🗓️ **Projets à venir :**", "🗓️ **Upcoming projects:**"],
                    ["done", "✅ **Projets terminés :**", "✅ **Completed projects:**"]];
    for (const [key, hf, he] of groups) {
      const items = KB.projects.filter(p => (p.status || {}).key === key);
      if (!items.length) continue;
      lines.push("", L ? hf : he);
      for (const p of items) {
        const solo = isSolo(p) ? (L ? " — Issa le mène seul" : " — Issa works on it alone") : "";
        lines.push(`• **${t(p.name, lang)}** — ${t(p.team_type, lang)}${solo}`);
      }
    }
    lines.push("", L ? "(Les noms des coéquipiers ne sont pas communiqués ici.)" : "(Teammates' names are not shared here.)");
    return lines.join("\n");
  }

  function statusAnswer(x, lang, kind) {
    const L = lang === "fr";
    const name = t(x.name || x.title, lang);
    const st = statusOf(x, lang);
    let msg;
    if (kind === "project") {
      msg = L ? `📍 Statut du projet « ${name} » : **${st}** — période : ${t(x.period, lang)}.`
              : `📍 Status of the project “${name}”: **${st}** — period: ${t(x.period, lang)}.`;
    } else {
      msg = L ? `📍 Statut du stage « ${name} » : **${st}** — période : ${t(x.period, lang)}.`
              : `📍 Status of the internship “${name}”: **${st}** — period: ${t(x.period, lang)}.`;
    }
    const key = (x.status || {}).key;
    if (key === "planned") msg += L ? " Ce projet n'a pas encore commencé : aucun résultat à ce jour." : " This project has not started yet: no results to date.";
    else if (key === "ongoing") msg += L ? " Le travail est toujours en cours." : " The work is still in progress.";
    return msg;
  }

  /* Liste des projets (ou des stages) filtrés par statut */
  function statusList(lang, normQ, entities, force) {
    /* force = statuts imposés, ex. ["ongoing"] pour « il bosse sur quoi ? » */
    const L = lang === "fr";
    const useStages = entities.includes("internships_list") && !entities.includes("projects_list");
    const items = useStages ? KB.internships : KB.projects;
    const keys = force || statusFilter(normQ);
    const rows = [];
    for (const x of items) {
      const k = (x.status || {}).key;
      if (keys === null || keys.includes(k)) rows.push(`• **${t(x.name || x.title, lang)}** — ${statusOf(x, lang)} · ${t(x.period, lang)}`);
    }
    const labels = {
      "planned": ["à venir (pas encore commencés)", "upcoming (not started yet)"],
      "ongoing": ["en cours", "ongoing"],
      "done": ["terminés", "completed"],
      "ongoing,planned": ["pas encore terminés", "not finished yet"]
    };
    const [whatFr, whatEn] = useStages ? ["stages", "internships"] : ["projets", "projects"];
    const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
    let head;
    if (keys === null) {
      head = L ? `📍 **Statut des ${whatFr} d'Issa :**` : `📍 **Status of Issa's ${whatEn}:**`;
    } else {
      const [lf, le] = labels[keys.join(",")];
      head = L ? `📍 **${cap(whatFr)} ${lf} :**` : `📍 **${cap(whatEn)} ${le}:**`;
    }
    if (!rows.length) {
      if (keys && keys.join(",") === "planned") {
        /* aucun projet à venir : on le dit et on liste ce qui est en cours */
        let msg = head + "\n" + (L
          ? `• Aucun ${whatFr.slice(0, -1)} n'est à venir pour le moment : tous les ${whatFr} d'Issa sont en cours ou terminés.`
          : `• No ${whatEn.slice(0, -1)} is upcoming right now: all of Issa's ${whatEn} are ongoing or completed.`);
        const ongoing = items.filter(x => (x.status || {}).key === "ongoing")
          .map(x => `• **${t(x.name || x.title, lang)}** — ${statusOf(x, lang)} · ${t(x.period, lang)}`);
        if (ongoing.length) msg += (L ? `\n\n📍 **${cap(whatFr)} en cours :**\n` : `\n\n📍 **Ongoing ${whatEn}:**\n`) + ongoing.join("\n");
        return msg;
      }
      return head + "\n" + (L ? "• Aucun pour le moment." : "• None at the moment.");
    }
    let tail = "";
    if (keys && keys.join(",") === "planned") tail = L ? "\n\nCes projets n'ont pas encore démarré : aucun résultat à ce jour." : "\n\nThese projects have not started yet: no results to date.";
    else if (keys && keys.join(",") === "done" && !force && !CRE.list_question_re.test(normQ)) {
      /* question oui / non (« ses projets sont finis ? ») : on n'omet pas ceux qui restent en cours */
      const rest = items.filter(x => ["ongoing", "planned"].includes((x.status || {}).key))
        .map(x => `• **${t(x.name || x.title, lang)}** — ${statusOf(x, lang)} · ${t(x.period, lang)}`);
      if (rest.length) tail = (L ? `\n\n⏳ **Pas tous : ${whatFr} encore en cours ou à venir :**\n` : `\n\n⏳ **Not all of them: ${whatEn} still ongoing or upcoming:**\n`) + rest.join("\n");
    }
    return head + "\n" + rows.join("\n") + tail;
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
    if (any("email", "e mail", "mail", "meil", "emai", "courriel", "gmail", "ecrire", "ecris", "ecrit", "write to", "email him")) return "email";
    if (any("linkedin", "linked in", "lkdn")) return "linkedin";
    if (any("github", "git hub")) return "github";
    if (any("localisation", "adresse", "habite", "ville", "reside", "domicile", "vit", "location", "located", "city", "based", "live", "lives", "arrondissement", "quartier", "postal", "zip", "neighbourhood", "neighborhood", "district", "paris")) return "location";
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
        if (intents.includes("status")) bits.push(statusAnswer(p, lang, "project"));
        if (intents.includes("duration"))
          bits.push(L ? `Le projet « ${name} » : période ${t(p.period, lang)} (durée : ${t(p.duration, lang)}).`
                      : `The project “${name}”: period ${t(p.period, lang)} (duration: ${t(p.duration, lang)}).`);
        if (intents.includes("team")) bits.push(teamAnswer(p, lang));
        /* titre d'abord : le lecteur sait de quel projet il s'agit */
        if (intents.includes("technologies"))
          bits.push(`🚀 **${name}** — ` + (L ? "technologies utilisées : " : "technologies used: ") + p.technologies.join(", ") + ".");
        if (intents.includes("metrics"))
          bits.push((L ? "Résultats obtenus : " : "Results achieved: ") + p.metrics[lang].join(" · ") + ".");
        if (intents.includes("cv_status"))
          bits.push(p.in_cv ? (L ? "Oui, ce projet est spécifié dans le CV d'Issa." : "Yes, this project is listed on Issa's CV.")
                            : (L ? "Non, ce projet n'est pas spécifié dans le CV d'Issa — il figure dans son dossier de projets." : "No, this project is not listed on Issa's CV — it appears in his project folder."));
        if (intents.includes("company"))
          bits.push(L ? `« ${name} » est un projet (${t(p.context, lang)}), pas un stage en entreprise.`
                      : `“${name}” is a project (${t(p.context, lang)}), not a company internship.`);
        if (bits.length) {
          setTopic(entity, Math.max(1, CTX.topic === entity ? CTX.depth : 1));
          return bits.join("\n\n");
        }
      }
      return itemAnswer(entity, lang, askLevel(entity, normQ), true, normQ);
    }

    if (STAGE_IDS.has(entity)) {
      const s = item("internships", entity);
      if (intents.length && !intents.includes("description")) {
        const bits = [];
        if (intents.includes("status")) bits.push(statusAnswer(s, lang, "internship"));
        if (intents.includes("duration"))
          bits.push(L ? `Ce stage chez ${t(s.company, lang)} a duré ${t(s.duration, lang)} (${t(s.period, lang)}).`
                      : `This internship at ${t(s.company, lang)} lasted ${t(s.duration, lang)} (${t(s.period, lang)}).`);
        if (intents.includes("company")) bits.push(t(s.company, lang) + ". " + t(s.company_details, lang));
        if (intents.includes("technologies"))
          bits.push(`💼 **${t(s.title, lang)}** (${t(s.company, lang)}) — ` + (L ? "environnement : " : "environment: ") + s.technologies.join(", ") + ".");
        if (intents.includes("metrics")) bits.push(s.metrics[lang].join(" · "));
        if (intents.includes("cv_status")) bits.push(L ? "Oui, ce stage est spécifié dans le CV d'Issa." : "Yes, this internship is listed on Issa's CV.");
        if (bits.length) {
          setTopic(entity, Math.max(1, CTX.topic === entity ? CTX.depth : 1));
          return bits.join("\n\n");
        }
      }
      return itemAnswer(entity, lang, askLevel(entity, normQ), true, normQ);
    }

    switch (entity) {
      case "about":
        return aboutAnswer(lang, 1);
      case "hobbies": {
        const hb = KB.profile.hobbies || {};
        const frL = hb.fr || [], enL = hb.en || [];
        const items = hb[lang] || frL;
        const out = (L ? "🎯 **Loisirs d'Issa :** " : "🎯 **Issa's hobbies:** ") + items.join(", ") + ".";
        const padded = ` ${normQ} `;
        /* précision absente de la base (équipe, club, compétition, niveau...) : réponse honnête, pas de « Oui ! » */
        const qual = CRE.hobby_qualifier_re.test(normQ);
        if (qual && CRE.sport_context_re.test(normQ)) return notInProfile(lang) + "\n\n———\n\n" + out;
        for (const [term, key] of Object.entries(CLASSIFIER.hobby_terms)) {
          if (!padded.includes(` ${term} `)) continue;
          /* loisir EXCLU par la question (« à part le foot », « d'autres sports que le foot ») : pas de « Oui ! » */
          if (new RegExp("\\b" + CLASSIFIER.except_re + " " + reEsc(term) + "\\b").test(normQ)) continue;
          /* activité absente des loisirs listés, ou détail non précisé : on le dit, sans rien inventer */
          if (key === "?" || (key && qual)) return notInProfile(lang) + "\n\n———\n\n" + out;
          if (!key) continue;
          for (let i = 0; i < items.length; i++) {
            const lab = normalize((i < frL.length ? frL[i] : "") + " " + (i < enL.length ? enL[i] : ""));
            if (lab.split(" ").includes(key)) {
              return (L ? `✅ Oui ! ${items[i]} fait partie des loisirs d'Issa.` : `✅ Yes! ${items[i]} is one of Issa's hobbies.`) + "\n\n" + out;
            }
          }
        }
        /* « il fait quoi à part ses études ? » : loisirs + activités parascolaires */
        if (CRE.outside_studies_re.test(normQ)) return out + "\n\n———\n\n" + answerFor("extracurricular", lang, [], normQ);
        return out;
      }
      case "education": {
        const rows = KB.education.map(e => `• ${t(e.degree, lang)} — ${t(e.school, lang)} (${t(e.period, lang)})`);
        return (L ? "🎓 **Parcours scolaire d'Issa :**\n" : "🎓 **Issa's educational background:**\n") + rows.join("\n");
      }
      case "skills": {
        /* compétence précise demandée (« Issa connaît-il Python ? ») → uniquement les lignes concernées */
        /* domaine (« data », « cloud », « IA générative ») → catégories entières */
        const [terms, cats, found] = skillHits(normQ);
        if (terms.length || cats.length) {
          const rows = [];
          for (const [ck, cat] of Object.entries(KB.skills)) {
            let hits = cat.items.filter(it => terms.some(w => hasTerm(normalize(it), w)));
            /* domaine entier, sauf si une compétence précise de ce domaine est citée
               (« can he code in JavaScript? » → JavaScript seulement) */
            if (cats.includes(ck) && !hits.length) hits = cat.items;
            if (hits.length) rows.push(`**${t(cat.label, lang)}** : ` + hits.join(", "));
          }
          if (rows.length) {
            let out = (L ? "✅ Oui — d'après ses CV, Issa a ces compétences :\n" : "✅ Yes — according to his CVs, Issa has these skills:\n") + rows.join("\n");
            /* projets qui UTILISENT cette compétence (nom + technologies, pas une simple mention
               « prochaine étape : ROS2 » ou « architecture cible non construite ») — liste courte */
            const keys = terms.concat(found.filter(f => !Object.prototype.hasOwnProperty.call(CLASSIFIER.skill_categories, f)));
            const used = KB.projects.filter(p => keys.some(w => hasTerm(techText(p), w)));
            if (used.length >= 1 && used.length <= 4) out += (L ? "\n📂 Projets concernés : " : "\n📂 Related projects: ") + used.map(p => t(p.name, lang)).join(" · ");
            /* activité parascolaire du même domaine (« plateforme web full-stack ») */
            const acts = (KB.extracurricular || []).filter(x => found.some(f => hasTerm(normalize(kbText(x.role, x.description)), f)));
            if (acts.length) out += (L ? "\n🤝 Activité liée : " : "\n🤝 Related activity: ") + acts.map(x => `${t(x.role, lang)} | ${t(x.org, lang)} — ${t(x.description, lang)}`).join(" · ");
            /* résultat d'un stage qui cite la compétence (« ROI » → « retour sur investissement estimé à
               10 mois » chez Capgemini) : termes + expressions qui y renvoient (synonymes) */
            const syn = CLASSIFIER.skill_synonyms;
            const mkeys = keys.concat(Object.keys(syn).filter(k => (Array.isArray(syn[k]) ? syn[k] : [syn[k]]).some(x => keys.includes(x))));
            const mlines = [];
            for (const s of KB.internships) for (const m of s.metrics[lang]) if (mkeys.some(k => hasTerm(normalize(m), k))) mlines.push(`${t(s.title, lang)} — ${m}`);
            if (mlines.length) out += (L ? "\n💼 Stage lié : " : "\n💼 Related internship: ") + mlines.slice(0, 2).join(" · ");
            return out;
          }
        }
        /* aucune compétence reconnue mais un terme absent de la base (« il maîtrise Excel ? ») :
           réponse honnête plutôt que la liste complète, qui sonnerait comme un « oui » */
        if (absentTerms(normQ).length) return notInProfile(lang);
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
        const loc = t(c.location, lang);
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
          return L ? `📍 Localisation d'Issa : **${loc}**` : `📍 Issa's location: **${loc}**`;
        /* Sinon : toutes les coordonnées. */
        return L
          ? `📫 **Contact :**\n• Email : ${c.email}\n• Téléphone : ${c.phone}\n• Localisation : ${loc}\n• LinkedIn : ${c.linkedin}${c.github ? `\n• GitHub : ${c.github}` : ""}${c.website ? `\n• Site web : ${c.website}` : ""}`
          : `📫 **Contact:**\n• Email: ${c.email}\n• Phone: ${c.phone}\n• Location: ${loc}\n• LinkedIn: ${c.linkedin}${c.github ? `\n• GitHub: ${c.github}` : ""}${c.website ? `\n• Website: ${c.website}` : ""}`;
      }
      case "objective": {
        const p = KB.profile;
        let out = "🎯 " + t(p.objective, lang);
        if (p.availability) out += "\n📅 " + (L ? "Disponibilité : " : "Availability: ") + t(p.availability, lang);
        const mob = (p.contact || {}).mobility;
        if (mob) out += "\n📍 " + t(mob, lang);
        return out;
      }
      case "projects_list": {
        const n = KB.projects.length;
        /* « quels projets utilisent le machine learning ? » → uniquement les projets concernés */
        const terms = filterTerms(normQ);
        if (terms.length) {
          /* nom + technologies, ou texte de la fiche sans les pistes / architectures non construites /
             limites (« pas de capteurs », « suites envisagées : ROS2 ») */
          const hits = filterItems(KB.projects, terms);
          const what = terms.join(" ");
          if (!hits.length) {
            const mentioned = KB.projects.filter(p => terms.every(w => termIn(itemText(p), w)));
            if (mentioned.length) {
              const names = mentioned.map(p => t(p.name, lang)).join(" · ");
              return L ? `🔎 D'après son profil, aucun projet d'Issa n'utilise « ${what} » : le terme n'apparaît que comme piste envisagée, limite ou architecture non construite (${names}).`
                       : `🔎 According to his profile, none of Issa's projects uses “${what}”: the term only appears as a next step, a stated limit or a target architecture that was not built (${names}).`;
            }
          }
          if (hits.length > 0 && hits.length < n) {
            const rowsF = hits.map(p => `• **${t(p.name, lang)}** — ${statusOf(p, lang)} · ${t(p.period, lang)} · ${t(p.team_type, lang)}`);
            let out = (L ? `🚀 **Projets d'Issa liés à « ${what} » (${hits.length}/${n}) :**\n` : `🚀 **Issa's projects related to “${what}” (${hits.length}/${n}):**\n`) + rowsF.join("\n");
            const st = filterItems(KB.internships, terms);
            if (st.length) out += (L ? "\n\n💼 **Stages liés :**\n" : "\n\n💼 **Related internships:**\n") + st.map(s => `• **${t(s.title, lang)}** — ${t(s.company, lang)}`).join("\n");
            return out;
          }
        }
        const rows = KB.projects.map(p => `• **${t(p.name, lang)}** — ${statusOf(p, lang)} · ${t(p.period, lang)} · ${t(p.team_type, lang)}`);
        const tail = L ? "\n\n💡 Demandez-moi les détails d'un projet (statut, équipe, durée, technologies, résultats) !"
                       : "\n\n💡 Ask me for the details of any project (status, team, duration, technologies, results)!";
        return (L ? `🚀 **Les ${n} projets d'Issa :**\n` : `🚀 **Issa's ${n} projects:**\n`) + rows.join("\n") + tail;
      }
      case "internships_list": {
        const rows = KB.internships.map(s => `• **${t(s.title, lang)}** — ${t(s.company, lang)} · ${t(s.period, lang)} (${t(s.duration, lang)})`);
        const n = KB.internships.length;
        const tail = L ? "\n\n💡 Demandez-moi les détails d'un stage (entreprise, durée, contenu) !"
                       : "\n\n💡 Ask me for the details of any internship (company, duration, content)!";
        return (L ? `💼 **Les ${n} stages d'Issa :**\n` : `💼 **Issa's ${n} internships:**\n`) + rows.join("\n") + tail;
      }
      case "soft_skills":
        return softAnswer(normQ, lang);
    }
    return null;
  }

  /* ---------- Classification (miroir de JesusChatbot.classify) ----------
     « greeting » | « thanks » | « on_topic » | « off_topic ». Voir CLASSIFIER
     pour l'ordre de décision ; mêmes listes et mêmes regex que le Python. */
  const CRE = {};
  for (const [k, v] of Object.entries(CLASSIFIER)) if (typeof v === "string" && k.endsWith("_re")) CRE[k] = new RegExp(v);
  const IMPERSONAL_G = new RegExp(CLASSIFIER.impersonal_re, "g");
  const VOCATIVE_G = new RegExp(CLASSIFIER.vocative_raw_re, "gi");
  const MATH_RAW = new RegExp(CLASSIFIER.math_raw_re);
  /* traduction d'un mot entre guillemets (« « compétences » en anglais ? ») : texte BRUT, insensible à la casse */
  const TRANSLATE_RAW = new RegExp(CLASSIFIER.translate_raw_re, "i");
  const reEsc = x => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const TASKS = CLASSIFIER.task_res.map(x => new RegExp(x));
  const TOPICS = CLASSIFIER.topic_res.map(x => new RegExp(x));
  const INJECTION = CRE.injection_re;
  const CLAUSE_RAW = new RegExp(CLASSIFIER.clause_split_raw_re);
  const CLAUSE_SPLIT = new RegExp(CLASSIFIER.clause_split_re);
  const HINTS_NORM = new Set([...FR_HINTS, ...EN_HINTS].map(normalize));
  const words = s => (s ? s.split(" ") : []);

  /* vocabulaire complet de la base (mots normalisés) */
  const KB_VOCAB = new Set();
  (function walk(x) {
    if (typeof x === "string") { for (const w of words(normalize(x))) KB_VOCAB.add(w); }
    else if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === "object") Object.values(x).forEach(walk);
  })(KB);

  /* Retire l'apostrophe au bot (« ISSA, raconte... » → « raconte... ») */
  function stripVocative(q) { return String(q == null ? "" : q).replace(VOCATIVE_G, " "); }

  /* Langage SMS → mots complets (« who r u » → « who are you ») */
  function chatspeak(normQ) {
    const cs = CLASSIFIER.chatspeak;
    return words(normQ).map(w => (Object.prototype.hasOwnProperty.call(cs, w) ? cs[w] : w)).join(" ");
  }

  /* Proposition où le visiteur se présente (« je suis RH chez ... ») sans parler d'Issa */
  function isSelfIntro(normClause) {
    const imp = normClause.replace(IMPERSONAL_G, " ");
    return CRE.self_intro_re.test(normClause) && !CRE.issa_ref_re.test(imp);
  }

  /* Tâche hors sujet (task_res) ; un verbe de calcul seul (« calculer », « solve ») n'en est une
     que sans référence à Issa (« il sait calculer un ROI ? » parle de lui) */
  function isTask(norm) {
    if (TASKS.some(r => r.test(norm))) return true;
    if (CRE.calc_verb_re.test(norm)) return !CRE.issa_ref_re.test(norm.replace(IMPERSONAL_G, " "));
    return false;
  }

  /* Retire les propositions où le visiteur se présente (si autre chose reste), ainsi que
     l'apposition qui suit (« I'm Tom, CTO at an AI startup. », « Je suis Paul, DRH d'une startup. ») */
  function stripSelfIntro(rawQ) {
    const src = String(rawQ == null ? "" : rawQ);
    const segs = src.split(/([?!.;:,\n]+|\s(?:et|and|mais|but)\s)/i);
    let out = "";
    let dropped = false;
    for (let i = 0; i < segs.length; i += 2) {
      const sep = i + 1 < segs.length ? segs[i + 1] : "";
      const n = normalize(segs[i]);
      const prev = i > 0 ? segs[i - 1] : "";
      const appos = dropped && prev.trim() === "," && !sep.includes("?") && !!n
        && !CRE.issa_ref_re.test(n.replace(IMPERSONAL_G, " "));
      if (isSelfIntro(n) || appos) { dropped = true; continue; }
      dropped = false;
      out += segs[i] + sep;
    }
    return normalize(out) ? out : src;
  }

  /* Retire les alias génériques (« experience », « management »), tels quels ou repliés */
  function stripGeneric(normQ) {
    const gen = new Set([...GENERIC].map(fold));
    return words(normQ).filter(w => !gen.has(fold(w))).join(" ");
  }

  /* Compétences citées → [termes de skill_terms, catégories entières de KB.skills, expressions
     trouvées]. Expressions testées de la plus longue à la plus courte, après repli singulier /
     pluriel ; une expression reconnue « consomme » ses mots (« web scraping » n'est pas aussi
     « web »). Un synonyme désigne un terme ou une LISTE de termes ; skill_categories → catégories. */
  function skillHits(normQ) {
    const syn = CLASSIFIER.skill_synonyms, cats = CLASSIFIER.skill_categories;
    const toks = words(normQ).filter(w => w);
    const ftoks = toks.map(fold);
    const mark = toks.map(() => false);
    const terms = [], catKeys = [], found = [];
    for (const ph of SKILL_PHRASES) {
      if (!markFolded(ftoks, mark, foldText(ph).split(" "))) continue;
      found.push(ph);
      if (Object.prototype.hasOwnProperty.call(cats, ph)) {
        for (const c of cats[ph]) if (!catKeys.includes(c)) catKeys.push(c);
        continue;
      }
      const vals = Object.prototype.hasOwnProperty.call(syn, ph) ? syn[ph] : ph;
      for (const v of (Array.isArray(vals) ? vals : [vals])) if (!terms.includes(v)) terms.push(v);
    }
    /* ordre stable : celui de skill_terms */
    const order = CLASSIFIER.skill_terms;
    const rank = w => (order.includes(w) ? order.indexOf(w) : order.length);
    terms.sort((a, b) => rank(a) - rank(b));
    return [terms, catKeys, found];
  }
  /* Compétences citées (termes de skill_terms ou synonymes → termes de skill_terms) */
  function skillTermsIn(normQ) { return skillHits(normQ)[0]; }

  function splitBilingual(text, lang) {
    const i = text.indexOf(" / ");
    if (i < 0) return text;
    return lang === "fr" ? text.slice(0, i) : text.slice(i + 3);
  }

  /* vocabulaire du profil retiré avant de chercher des mots « étrangers » */
  const PROFILE_VOCAB_G = ["ontopic_re", "summary_signal_re", "followup_re", "strengths_re"].map(k => new RegExp(CLASSIFIER[k], "g"));
  const NEUTRAL = new Set([...HINTS_NORM, ...CLASSIFIER.leftover_stop, ...CLASSIFIER.filler_words]);

  /* Mots de la question qui ne relèvent NI d'un alias du profil, NI du
     vocabulaire du profil, NI des mots-outils / mots de remplissage
     (« salaire moyen d'un ingénieur » → [moyen, ingenieur]). */
  function foreignWords(normQ) {
    let work = ` ${normQ} `;
    for (const [alias] of aliasIndex) {
      while (work.includes(` ${alias} `)) work = work.split(` ${alias} `).join(" ");
    }
    work = words(work.trim().replace(/\s+/g, " ")).join(" ");
    for (const rx of PROFILE_VOCAB_G) work = work.replace(rx, " ");
    /* alias et termes précis reconnus aussi après repli singulier / pluriel */
    const toks = work.split(/\s+/).filter(w => w);
    const ftoks = toks.map(fold);
    const mark = toks.map(() => false);
    for (const phrase of FOLDED_PHRASES) markFolded(ftoks, mark, phrase);
    return toks.filter((w, i) => !mark[i] && w.length > 2 && !/^[0-9]+$/.test(w) && !NEUTRAL.has(w));
  }

  /* mots du profil jamais « corrigés » : vocabulaire de recrutement / profil / infos absentes */
  const SPELL_GUARD = ["ontopic_re", "summary_signal_re", "followup_re", "strengths_re", "not_in_kb_re"].map(k => CRE[k]);

  /* Corrige les fautes de frappe sur les mots du profil (« competances »,
     « capgemni ») : mot ≥ 6 lettres absent de la base et des mots-outils →
     mot d'alias le plus proche (distance 1, ou 2 à partir de 9 lettres). */
  function spellFix(normQ) {
    const abbr = CLASSIFIER.abbreviations;
    /* expressions (« machin learning » → « machine learning ») */
    let padded = ` ${normQ} `;
    for (const [a, b] of Object.entries(CLASSIFIER.phrase_fixes)) padded = padded.split(` ${a} `).join(` ${b} `);
    return padded.split(/\s+/).filter(w => w).map(w => {
      /* abréviation familière (« perso » → « personnel ») */
      if (Object.prototype.hasOwnProperty.call(abbr, w)) return abbr[w];
      /* langage SMS « -ik » → « -ique » (« robotik », « informatik ») */
      if (w.length >= 6 && w.endsWith("ik") && (KB_VOCAB.has(w.slice(0, -2) + "ique") || SPELL_SET.has(w.slice(0, -2) + "ique")))
        return w.slice(0, -2) + "ique";
      /* mots du profil / du recrutement (« salaire », « visa », « permis »...) : jamais réécrits */
      if (w.length < 6 || /^[0-9]+$/.test(w) || KB_VOCAB.has(w) || NEUTRAL.has(w) || SPELL_SET.has(w)
          || PROTECTED.has(w) || SPELL_GUARD.some(rx => rx.test(w))) return w;
      const maxd = w.length < 9 ? 1 : 2;
      let best = w, bestD = maxd + 1;
      for (const cand of SPELL_WORDS) {
        if (Math.abs(cand.length - w.length) > maxd) continue;
        if (w.startsWith(cand) || cand.startsWith(w)) { best = w; bestD = 0; break; } /* simple flexion */
        const d = levenshtein(w, cand);
        if (d < bestD) { best = cand; bestD = d; }
      }
      return bestD <= maxd ? best : w;
    }).join(" ");
  }

  /* Texte normalisé d'une fiche (FR + EN), pour filtrer par mot-clé */
  function itemText(x) {
    const out = [];
    (function walk(v) {
      if (typeof v === "string") out.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    })(["name", "title", "context", "category", "team_type", "description", "highlights", "technologies"].map(k => x[k]));
    /* mots repliés (singulier / pluriel) : « twins » ↔ « twin » */
    return " " + foldText(normalize(out.join(" "))) + " ";
  }

  /* Texte normalisé du NOM et des TECHNOLOGIES d'une fiche (ce qu'elle utilise vraiment) */
  function techText(x) { return normalize(kbText(x.name, x.title, x.technologies)); }

  /* Texte normalisé et replié d'une fiche (FR + EN) SANS les phrases qui décrivent une piste,
     une limite ou une architecture non construite (not_built_re) */
  function cleanText(x) {
    const strs = [];
    (function walk(v) {
      if (typeof v === "string") strs.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    })(["name", "title", "context", "category", "team_type", "description", "highlights", "technologies"].map(k => x[k]));
    const parts = [];
    for (const v of strs) {
      for (const sent of v.split(/(?<=[.!?;])\s+/)) {
        const n = normalize(sent);
        if (n && !CRE.not_built_re.test(n)) parts.push(n);
      }
    }
    return " " + foldText(parts.join(" ")) + " ";
  }

  /* Le mot de filtre (ou une de ses variantes filter_synonyms) figure-t-il dans le texte replié ? */
  function termIn(text, w) {
    const syn = CLASSIFIER.filter_synonyms;
    const vs = Object.prototype.hasOwnProperty.call(syn, w) ? syn[w] : [w];
    return vs.some(v => text.includes(` ${foldText(normalize(v))} `));
  }

  /* Fiches qui UTILISENT les termes : nom + technologies, ou texte de la fiche sans les phrases de
     pistes / limites / architectures non construites */
  function filterItems(items, terms) {
    return items.filter(x => terms.every(w => termIn(" " + foldText(techText(x)) + " ", w))
      || terms.every(w => termIn(cleanText(x), w)));
  }

  /* Mots de la question étrangers au profil (hors alias, vocabulaire du profil, mots-outils,
     qualificatifs comme « strongest » / « meilleures ») ET absents de toute la base (« excel », « sap ») */
  function absentTerms(normQ) {
    const qual = new Set(CLASSIFIER.qualifier_words);
    return foreignWords(normQ).filter(w => !KB_VOCAB.has(w) && !KB_VOCAB.has(fold(w)) && !qual.has(w));
  }

  /* Mots porteurs d'une demande de liste (« quels projets utilisent le
     machine learning ? » → [machine, learning] ; « ses projets IA » → [ia]) */
  function filterTerms(normQ) {
    const stop = new Set([...NEUTRAL, ...CLASSIFIER.fuzzy_stop,
      ...["projects_list", "internships_list"].flatMap(e => ENTITY_ALIASES[e].flatMap(a => words(normalize(a))))]);
    const syn = CLASSIFIER.filter_synonyms;
    return words(normQ).filter(w => Object.prototype.hasOwnProperty.call(syn, w) || (w.length > 2 && !/^[0-9]+$/.test(w) && !stop.has(w)));
  }

  /* Entités du profil + références à Issa. Les alias faibles ne comptent
     que si la question parle d'Issa ou ne contient aucun mot étranger au
     profil (« le site », « dispo ? ») ; loisirs / compétences exigent une
     référence à Issa. → [entités, réf. Issa, mots étrangers, entités fortes, contexte] */
  function signals(normQ, rawQ) {
    const imp = normQ.replace(IMPERSONAL_G, " ");
    const context = CRE.context_re.test(imp);
    const issaRef = CRE.issa_ref_re.test(imp);
    const foreign = foreignWords(normQ);
    /* mot-clé seul, sans mot étranger ni tournure de définition (« vision par ordinateur ? ») */
    const definition = CRE.definition_re.test(normQ);
    const bare = !foreign.length && !definition;
    let strong = findEntities(normQ, rawQ, STRONG_ALIAS_INDEX);
    const hits = findEntityHits(normQ, rawQ);
    let ents = [];
    for (const [e] of hits) if (!ents.includes(e) && (strong.includes(e) || context || !foreign.length)) ents.push(e);
    if (definition && !context) ents = ents.filter(e => strong.includes(e) || !CLASSIFIER.concept_entities.includes(e));
    /* entités trouvées UNIQUEMENT par un alias générique (« experience », « management ») */
    const generic = ents.filter(e => hits.filter(([x]) => x === e).every(([, a]) => GENERIC.has(a)));
    if (ents.includes("languages") && CRE.code_lang_re.test(normQ)) {
      /* « what languages does he code in? » → langages de programmation (compétences) */
      const swapped = ents.map(e => e === "languages" ? "skills" : e);
      ents = swapped.filter((e, i) => !swapped.slice(0, i).includes(e));
      strong = strong.map(e => e === "languages" ? "skills" : e);
    }
    if ((context || bare) && ents.every(e => e === "about" || generic.includes(e))) {
      /* termes précis (loisir, compétence, domaine de projet, pays des stages) : entités fortes,
         prioritaires sur un alias générique ; sans référence à Issa, seuls compétences / domaines */
      const added = [];
      for (const [key, list, ent] of [["hobby_terms", Object.keys(CLASSIFIER.hobby_terms), "hobbies"],
        ["skill_terms", CLASSIFIER.skill_terms, "skills"], ["project_terms", CLASSIFIER.project_terms, "projects_list"],
        ["internship_place_terms", CLASSIFIER.internship_place_terms, "internships_list"]]) {
        if (!context && (key === "hobby_terms" || key === "internship_place_terms")) continue;
        let hit;
        if (key === "skill_terms") { const sh = skillHits(normQ); hit = sh[0].length > 0 || sh[1].length > 0; }
        else hit = list.some(w => hasTerm(normQ, w));
        if (hit && !added.includes(ent)) added.push(ent);
      }
      if (added.length) {
        ents = ents.filter(e => !generic.includes(e)).concat(added.filter(e => !ents.includes(e)));
        strong = strong.concat(added);
      }
    } else if (generic.length && ents.some(e => !generic.includes(e) && !["about", "projects_list", "internships_list"].includes(e))) {
      /* un sujet précis de la même question l'emporte sur un alias générique */
      ents = ents.filter(e => !generic.includes(e));
    }
    if (ents.includes("extracurricular") && hits.filter(([x]) => x === "extracurricular").every(([, a]) => a === "club" || a === "clubs")
        && CRE.sport_context_re.test(normQ)) {
      /* « club de foot », « il nage en club » : un loisir sportif, pas la vie associative */
      const sw = ents.map(e => e === "extracurricular" ? "hobbies" : e);
      ents = sw.filter((e, i) => !sw.slice(0, i).includes(e));
      strong = strong.concat(["hobbies"]);
    }
    return [ents, issaRef, foreign, strong, context, ents.filter(e => generic.includes(e))];
  }

  /* Découpe une question en propositions normalisées (ponctuation, puis
     « and / et / also / aussi / then / but / mais ») */
  function clauses(rawQ) {
    const out = [];
    for (const seg of String(rawQ == null ? "" : rawQ).split(CLAUSE_RAW)) {
      for (let c of normalize(seg).split(CLAUSE_SPLIT)) {
        c = c.trim();
        if (c) out.push(c);
      }
    }
    return out;
  }

  /* Question MIXTE (« ses langues ? et écris-moi un haïku ») : propositions qui
     demandent une entité PRÉCISE du profil (alias fort, hors « about »), à
     propos d'Issa ou d'un de ses projets / stages, sans tâche ni sujet hors
     périmètre. Une seule proposition (« write a poem about Issa ») → []. */
  function profileClauses(rawQ) {
    const cs = clauses(rawQ);
    if (cs.length < 2) return [];
    const keep = [];
    for (const c of cs) {
      if (INJECTION.test(c) || isTask(c) || TOPICS.some(r => r.test(c)) || isSelfIntro(c) || classify(c) !== "on_topic") continue;
      const [ents, issaRef, , strong] = signals(spellFix(c), c);
      /* alias faible accepté quand la proposition parle d'Issa (« what's his English level ») */
      const spec = ents.filter(e => e !== "about" && (strong.includes(e) || issaRef));
      if (spec.length && (issaRef || spec.some(e => PROJECT_IDS.has(e) || STAGE_IDS.has(e)))) keep.push(c);
    }
    return keep;
  }

  /* Propositions du profil d'une question qui contient AUSSI une tâche ou un
     sujet hors périmètre ([] si la question n'est pas mixte) */
  function mixedClauses(question) {
    const raw = stripVocative(question);
    const norm = normalize(raw);
    if (!norm || INJECTION.test(norm)) return [];
    if (!(isTask(norm) || MATH_RAW.test(raw) || TRANSLATE_RAW.test(raw) || TOPICS.some(r => r.test(norm)))) return [];
    return profileClauses(raw);
  }

  function classify(question) { return classifyKR(question)[0]; }
  /* {kind, reason} : pour off_topic, reason = « explicit » (motif hors sujet explicite : tâche, besoin
     personnel, météo, injection...) ou « default » (question simplement non reconnue) */
  function classifyDetail(question) {
    const [kind, reason] = classifyKR(question);
    return { kind, reason };
  }
  function classifyKR(question) {
    const raw = String(question == null ? "" : question);
    const norm = normalize(raw);
    if (!norm) return ["greeting", "match"];
    const cs = chatspeak(norm);
    if (CRE.greeting_re.test(cs) || CRE.identity_re.test(cs)) return ["greeting", "match"];
    const raw2 = stripVocative(raw);
    let norm2 = normalize(raw2);
    if (!norm2) return ["greeting", "match"];
    if (INJECTION.test(norm2)) return ["off_topic", "explicit"];
    /* relances de conversation (« plus de détails », « pourquoi ? », « résume », « oui », « ok ») */
    if (CRE.ack_re.test(norm2)) return ["thanks", "ack"];
    if (CRE.deeper_re.test(norm2) || CRE.accept_re.test(norm2) || CRE.summary_bare_re.test(norm2)
        || CRE.team_followup_re.test(norm2) || CRE.other_followup_re.test(norm2) || CRE.interview_bare_re.test(norm2)) return ["on_topic", "followup"];
    /* tâche hors sujet : refusée, sauf si une AUTRE proposition demande une entité précise du profil */
    if (isTask(norm2) || MATH_RAW.test(raw2) || TRANSLATE_RAW.test(raw2)) return profileClauses(raw2).length ? ["on_topic", "match"] : ["off_topic", "explicit"];
    /* tutoiement / vouvoiement sur un sujet professionnel → Issa (« quels sont tes projets ? ») */
    norm2 = spellFix(interviewee(norm2));
    const [ents, issaRef, foreign, strong, context] = signals(norm2, raw2);
    const specific = ents.filter(e => e !== "about");
    const vocab = CRE.ontopic_re.test(norm2) || CRE.summary_signal_re.test(norm2) || CRE.followup_re.test(norm2) || CRE.strengths_re.test(norm2);
    if (CRE.thanks_re.test(norm) && !specific.length && !vocab) return ["thanks", "match"];
    if (TOPICS.some(r => r.test(norm2))) {
      /* sujet hors périmètre : rattrapé seulement par une entité PRÉCISE (alias fort ou terme de
         loisir / compétence) demandée À PROPOS D'ISSA, ou par une autre proposition du profil.
         Un lieu, une entreprise ou un outil cité seul (« météo à El Jadida », « entretien chez
         Capgemini », « acheter un ESP32 ») ne suffit pas. */
      if (profileClauses(raw2).length) return ["on_topic", "match"];
      const anchored = specific.filter(e => strong.includes(e));
      return (anchored.length && issaRef) ? ["on_topic", "match"] : ["off_topic", "explicit"];
    }
    if (ents.length || issaRef) return ["on_topic", "match"];
    /* vocabulaire du profil SANS référence à Issa : pertinent seulement
       s'il ne porte pas sur autre chose (« salaire moyen d'un ingénieur ») */
    if (vocab && !foreign.length) return ["on_topic", "match"];
    /* relance d'intention courte (« combien de temps ? », « et les résultats ? ») : le dernier sujet */
    if (findIntents(norm2).some(i => i !== "description") && words(norm2).length <= CLASSIFIER.followup_max_words
        && foreign.every(w => CLASSIFIER.followup_words.includes(w))) return ["on_topic", "followup"];
    return ["off_topic", "default"];
  }

  /* ---------- Réponses « profil » sans fiche dédiée ---------- */
  function notInProfile(lang) {
    const email = KB.profile.contact.email;
    if (lang === "fr") {
      return "🔎 Cette information ne figure pas dans son profil — je préfère ne rien inventer. " +
        `Le plus simple est de poser la question directement à Issa : **${email}**.\n\n` +
        "Je peux en revanche vous parler de ses **projets**, de ses **stages**, de ses **compétences**, " +
        "de son **parcours** ou de sa **disponibilité**.";
    }
    return "🔎 That information is not in his profile — I'd rather not make anything up. " +
      `The easiest way is to ask Issa directly: **${email}**.\n\n` +
      "I can, however, tell you about his **projects**, **internships**, **skills**, **education** " +
      "or **availability**.";
  }

  /* Projets académiques EN COURS (contexte « projet académique / academic project ») */
  function currentSchoolProjects() {
    return KB.projects.filter(p => (p.status || {}).key === "ongoing" && CRE.school_project_re.test(normalize(kbText(p.context))))
      .map(p => p.id);
  }

  /* Projets académiques (contexte school_ctx_re), filtrés par l'établissement cité s'il y en a un
     (« ses projets à l'ENSAM ? ») */
  function schoolProjects(normQ) {
    const ctx = new Map(KB.projects.map(p => [p.id, normalize(kbText(p.context))]));
    const ids = [...ctx.keys()].filter(i => CRE.school_ctx_re.test(ctx.get(i)));
    const named = CLASSIFIER.school_names.filter(n => new RegExp("\\b" + n + "\\b").test(normQ));
    const sub = ids.filter(i => named.some(n => new RegExp("\\b" + n + "\\b").test(ctx.get(i))));
    return sub.length ? sub : ids;
  }

  /* Liste des projets d'école / académiques (statut, période, équipe, cadre) */
  function schoolList(ids, lang) {
    const L = lang === "fr";
    const n = KB.projects.length;
    const rows = ids.map(i => {
      const p = item("projects", i);
      return `• **${t(p.name, lang)}** — ${statusOf(p, lang)} · ${t(p.period, lang)} · ${t(p.team_type, lang)} — ${t(p.context, lang)}`;
    });
    const head = L ? `🎓 **Projets académiques d'Issa (${ids.length}/${n}) :**` : `🎓 **Issa's academic projects (${ids.length}/${n}):**`;
    return head + "\n" + rows.join("\n");
  }

  /* Une ligne d'identification d'un projet ou d'un stage (titre, statut / entreprise, période) */
  function headline(iid, lang) {
    if (STAGE_IDS.has(iid)) {
      const s = item("internships", iid);
      return `💼 **${t(s.title, lang)}** — ${t(s.company, lang)} · ${t(s.period, lang)}`;
    }
    const p = item("projects", iid);
    return `🚀 **${t(p.name, lang)}** — ${statusOf(p, lang)} · ${t(p.period, lang)}`;
  }

  /* Sujet absent de la base (« does he know Tableau? », « il a fait une appli mobile ? ») : réponse honnête,
     suivie de ce que son profil liste de proche (absent_related : Tableau → Power BI) */
  function absentAnswer(normQ, lang) {
    let out = notInProfile(lang);
    const rel = [];
    for (const [pat, term] of CLASSIFIER.absent_related) {
      if (!new RegExp(pat).test(normQ)) continue;
      for (const cat of Object.values(KB.skills))
        for (const it of cat.items) if (hasTerm(normalize(it), term) && !rel.includes(it)) rel.push(it);
    }
    if (rel.length) out += (lang === "fr" ? "\n\n📌 Ce que liste son profil : " : "\n\n📌 What his profile lists: ") + rel.join(", ") + ".";
    return out;
  }

  /* Mises en ligne / déploiements : projets en ligne (live_url), activités et compétences de déploiement
     (deploy_kb_re), puis ce qui n'a PAS été mis en production (no_deploy_kb_re, phrases des stages) */
  function deployAnswer(lang) {
    const L = lang === "fr";
    const dk = CRE.deploy_kb_re, nd = CRE.no_deploy_kb_re;
    const lines = [L ? "🌐 **Mises en ligne et déploiements (d'après son profil) :**"
                     : "🌐 **Online work and deployments (according to his profile):**"];
    for (const p of KB.projects) {
      if (!p.live_url) continue;
      let first = t(p.description, lang).split(/(?<=[.!?])\s+/)[0];
      first = first.split(/\s?[:;]\s/)[0];
      lines.push(`• **${t(p.name, lang)}** — ${first} · ${siteLink(p)}`);
    }
    for (const x of KB.extracurricular || []) {
      if (dk.test(normalize(t(x.description, lang))))
        lines.push(`• ${t(x.role, lang)} | ${t(x.org, lang)} (${t(x.date, lang)}) — ${t(x.description, lang)}`);
    }
    for (const cat of Object.values(KB.skills))
      for (const it of cat.items) if (dk.test(normalize(it))) lines.push((L ? "• Compétence : " : "• Skill: ") + it);
    for (const s of KB.internships) {
      for (const sent of t(s.description, lang).split(/(?<=[.!?])\s+/)) {
        if (nd.test(normalize(sent)))
          lines.push(`⚠️ **${t(s.title, lang)}** (${t(s.company, lang)})` + (L ? " : " : ": ") + sent);
      }
    }
    return lines.join("\n");
  }

  /* Points forts / pourquoi le recruter : UNIQUEMENT des faits de la base */
  function pitch(lang) {
    const L = lang === "fr";
    const p = KB.profile;
    const lines = [L ? "💡 **Pourquoi Issa ?** Voici ce que montre son profil :" : "💡 **Why Issa?** Here is what his profile shows:", ""];
    lines.push("🎯 " + (p.positioning ? `**${t(p.positioning, lang)}** — ` : "") + t(p.title, lang));
    const soft = ((KB.skills || {}).soft_skills || {}).items || [];
    if (soft.length) lines.push((L ? "🧠 Qualités : " : "🧠 Qualities: ") + soft.map(x => splitBilingual(x, lang)).join(", "));
    const res = [];
    for (const [iid, idxs] of CLASSIFIER.pitch_sources) {
      const x = item("projects", iid) || item("internships", iid);
      if (!x) continue;
      const ms = idxs.filter(i => i < x.metrics[lang].length).map(i => x.metrics[lang][i]);
      if (ms.length) res.push(`• **${t(x.name || x.title, lang)}** : ` + ms.join(" · "));
    }
    if (res.length) lines.push("", L ? "🏆 Résultats phares :" : "🏆 Flagship results:", ...res);
    lines.push("", (L ? "📅 Disponibilité : " : "📅 Availability: ") + t(p.availability || p.objective, lang), "✉️ " + p.contact.email);
    return lines.join("\n");
  }

  /* Qualités (soft skills) : confirme celles citées dans la question puis le pitch */
  function softAnswer(normQ, lang) {
    const L = lang === "fr";
    const cat = (KB.skills || {}).soft_skills || {};
    const items = cat.items || [];
    const own = cat["items_" + lang];
    const shown = (own && own.length) ? own : items.map(x => splitBilingual(x, lang));
    const found = [];
    for (const [key, terms] of Object.entries(CLASSIFIER.soft_skill_terms)) {
      if (!terms.some(a => hasTerm(normQ, a))) continue;
      for (let i = 0; i < items.length; i++) {
        if ((` ${normalize(items[i])} `).includes(` ${key} `)) {
          const lab = i < shown.length ? shown[i] : splitBilingual(items[i], lang);
          if (!found.includes(lab)) found.push(lab);
          break;
        }
      }
    }
    const out = pitch(lang);
    setTopic("iv:achievement", 0);  /* « plus de détails » → ses réalisations les plus marquantes */
    if (!found.length) return out;
    const q = found.map(x => L ? `« ${x} »` : `“${x}”`).join(", ");
    const head = L ? (found.length === 1 ? `✅ Oui — qualité listée dans son profil : ${q}.` : `✅ Oui — qualités listées dans son profil : ${q}.`)
                   : `✅ Yes — listed among his soft skills: ${q}.`;
    return head + "\n\n" + out;
  }

  /* ---------- Repli : recherche de la meilleure SECTION de la base ----------
     Sections (chaque projet, chaque stage, parcours, chaque compétence, langues,
     certifications, vie associative, loisirs, contact, objectif / disponibilité)
     → mots repliés FR + EN ; score pondéré : mots rares √(N / df). */
  function kbText(...xs) {
    const out = [];
    (function walk(v) {
      if (typeof v === "string") out.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    })(xs);
    return out.join(" ");
  }
  const SECTIONS = (function buildSections() {
    const lab = CLASSIFIER.section_labels;
    const prof = KB.profile;
    const c = prof.contact || {};
    const secs = [];
    /* « tête » d'une fiche (titre, cadre, catégorie, rôle, technologies, 1re phrase de la description) :
       un seul mot commun suffit s'il en fait partie */
    const heads = {};
    const firstSentence = d => { const out = []; (function walk(v) {
      if (typeof v === "string") out.push(v.split(/(?<=[.!?])\s/)[0]);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    })(d); return out.join(" "); };
    for (const p of KB.projects) {
      secs.push(["project", p.id, kbText(...["name", "context", "category", "role", "description", "highlights", "technologies"].map(k => p[k]))]);
      heads[p.id] = kbText(p.name, p.context, p.category, p.role, p.technologies, firstSentence(p.description));
    }
    for (const s of KB.internships) {
      secs.push(["internship", s.id, kbText(...["title", "type", "company", "role", "description", "highlights", "technologies"].map(k => s[k]))]);
      heads[s.id] = kbText(s.title, s.type, s.company, s.role, s.technologies, firstSentence(s.description));
    }
    secs.push(["section", "education", kbText(KB.education, lab.education)]);
    for (const [key, cat] of Object.entries(KB.skills)) cat.items.forEach((it, i) => secs.push(["skill", `${key}:${i}`, kbText(cat.label, it)]));
    secs.push(["section", "languages", kbText(prof.languages_spoken, lab.languages)]);
    secs.push(["section", "certifications", kbText(KB.certifications.map(x => [x.name, x.issuer, x.date]), lab.certifications)]);
    secs.push(["section", "extracurricular", kbText(KB.extracurricular, lab.extracurricular)]);
    secs.push(["section", "hobbies", kbText(prof.hobbies, lab.hobbies)]);
    secs.push(["section", "contact", kbText(c.location, c.mobility, lab.contact)]);
    secs.push(["section", "objective", kbText(prof.objective, prof.availability, c.mobility, lab.objective)]);
    const stop = new Set([...NEUTRAL, ...CLASSIFIER.fuzzy_stop, ...CLASSIFIER.retrieval_stop]);
    const docs = [], df = new Map();
    for (const [kind, sid, text] of secs) {
      const toks = [];
      for (const w of words(normalize(text))) {
        const f = fold(w);
        if (f.length >= 3 && !/^[0-9]+$/.test(f) && !stop.has(w) && !stop.has(f) && !toks.includes(f)) toks.push(f);
      }
      const head = (kind === "project" || kind === "internship") ? new Set(words(normalize(heads[sid])).map(fold)) : null;
      docs.push([kind, sid, new Set(toks), head]);
      for (const f of toks) df.set(f, (df.get(f) || 0) + 1);
    }
    return { docs, df, stop };
  })();

  function retrieve(normQ, lang) {
    const { docs, df, stop } = SECTIONS;
    const n = docs.length;
    const qt = [], sfx = new Set();
    const prefixes = [...CLASSIFIER.compound_prefixes].sort(byLenThenAlpha);
    for (const w of words(normQ)) {
      let f = fold(w);
      if (f.length < CLASSIFIER.retrieval_min_len || /^[0-9]+$/.test(f) || stop.has(w) || stop.has(f)) continue;
      if (!df.has(f)) {
        /* mot composé (« cybersécurité » → « sécurité ») : seulement après un vrai préfixe et pour un
           suffixe d'au moins compound_min_len lettres (« langchain » ne devient pas « chain ») */
        for (const pre of prefixes) {
          const rest = f.slice(pre.length);
          if (f.startsWith(pre) && rest.length >= CLASSIFIER.compound_min_len && df.has(rest) && !stop.has(rest)) {
            f = rest;
            sfx.add(f);
            break;
          }
        }
      }
      if (df.has(f) && !qt.includes(f)) qt.push(f);
    }
    if (!qt.length) return null;
    const minHits = CLASSIFIER.retrieval_card_min_hits;
    const scores = docs.map(([, , toks, head]) => {
      let sc = 0;
      const hit = qt.filter(f => toks.has(f));
      /* fiche de projet / stage : 2 mots communs, ou 1 mot de sa « tête » (titre, technologies, 1re phrase...) ;
         un mot isolé de la description (« gère », « notice ») ne suffit pas */
      /* (un mot obtenu par le repli « mot composé » ne compte pas comme mot de tête) */
      if (head === null || hit.length >= minHits || hit.some(f => head.has(f) && !sfx.has(f))) {
        for (const f of hit) sc += Math.sqrt(n / df.get(f));
      }
      return sc;
    });
    const best = Math.max(...scores);
    if (best < CLASSIFIER.retrieval_min_score) return null;
    /* égalité : la section la plus ciblée (le moins de mots) l'emporte, puis l'ordre de la base */
    let ib = -1;
    scores.forEach((sc, i) => { if (sc === best && (ib < 0 || docs[i][2].size < docs[ib][2].size)) ib = i; });
    const [kind, sid] = docs[ib];
    if (kind === "project" || kind === "internship") return itemAnswer(sid, lang, entryLevel(normQ), true, normQ);
    if (kind === "section") return answerFor(sid, lang, [], normQ);
    /* compétences : toutes celles proches du meilleur score, groupées par catégorie */
    const cut = best * CLASSIFIER.retrieval_ratio;
    const keys = docs.filter((d, i) => d[0] === "skill" && scores[i] >= cut).map(d => d[1]).slice(0, 8);
    const L = lang === "fr";
    const rows = [];
    for (const [ck, cat] of Object.entries(KB.skills)) {
      const its = keys.filter(k => k.split(":")[0] === ck).map(k => cat.items[parseInt(k.split(":")[1], 10)]);
      if (its.length) rows.push(`**${t(cat.label, lang)}** : ` + its.join(", "));
    }
    return (L ? "✅ D'après ses CV, Issa a ces compétences :\n" : "✅ According to his CVs, Issa has these skills:\n") + rows.join("\n");
  }

  /* Mots de la question absents de toute la base (→ info hors profil) */
  function unknownTerms(normQ) {
    const stop = new Set(CLASSIFIER.leftover_stop);
    return words(normQ).filter(w => w.length >= 3 && !HINTS_NORM.has(w) && !stop.has(w) && !KB_VOCAB.has(w));
  }

  /* ---------- Recouvrement lexical (uniquement pour une question on_topic) ----------
     Seuls les mots RARES comptent : ≥ 4 lettres, hors mots courants
     (« temps », « paris », « projet »…), présents dans au plus 2 fiches ;
     il en faut au moins 2 en commun. */
  function fuzzyBest(normQ, lang) {
    const stop = new Set([...HINTS_NORM, ...CLASSIFIER.fuzzy_stop]);
    const qtok = new Set(words(normQ).filter(w => w.length >= 4 && !stop.has(w)));
    if (!qtok.size) return null;
    const docs = [];
    for (const p of KB.projects) docs.push([new Set(words(normalize(`${t(p.name, lang)} ${t(p.description, lang)} ${p.technologies.join(" ")}`))), "p", p]);
    for (const s of KB.internships) docs.push([new Set(words(normalize(`${t(s.title, lang)} ${t(s.description, lang)}`))), "s", s]);
    const rare = new Set([...qtok].filter(w => { const n = docs.filter(d => d[0].has(w)).length; return n >= 1 && n <= 2; }));
    let bestScore = 0, best = null;
    for (const [toks, kind, x] of docs) {
      let score = 0;
      for (const w of rare) if (toks.has(w)) score++;
      if (score > bestScore) { bestScore = score; best = [kind, x]; }
    }
    if (bestScore < 2) return null;
    return itemAnswer(best[1].id, lang, entryLevel(normQ), true, normQ);
  }

  /* Refus poli (hors sujet) : pool REFUSALS de js/rag.js (chargé avant ce
     fichier) ; repli minimal si rag.js est absent. */
  const REFUSAL_FALLBACK = {
    fr: "Je suis ISSA, l'assistant dédié **uniquement** au parcours d'Issa Lamkharbech. Ça sort de mon domaine — mais je peux tout te dire sur ses projets, ses stages, ses compétences ou son parcours. Que veux-tu savoir sur Issa ? 🙂",
    en: "I'm ISSA, the assistant dedicated **only** to Issa Lamkharbech's background. That's outside my scope — but I'd love to tell you about his projects, internships, skills or education. What would you like to know about Issa? 🙂"
  };
  function refusal(lang) {
    const R = window.JesusRAG;
    if (R && R.refusal) return R.refusal(lang);
    return REFUSAL_FALLBACK[lang === "en" ? "en" : "fr"];
  }

  function greeting(lang, fallback, how, who) {
    if (fallback) return refusal(lang);
    if (who) {
      /* question sur l'interlocuteur : ISSA est l'assistant, pas Issa lui-même */
      const email = KB.profile.contact.email;
      if (lang === "fr") {
        return "🤖 Vous échangez avec **ISSA**, l'assistant virtuel d'Issa Lamkharbech — pas avec Issa lui-même, ni avec un humain. Je réponds uniquement à partir de son profil (projets, stages, compétences, parcours). Pour le joindre directement : **" + email + "**.\n\nEssayez par exemple :\n• « Qui est Issa ? »\n• « Quelles sont ses compétences en IA ? »";
      }
      return "🤖 You are chatting with **ISSA**, Issa Lamkharbech's virtual assistant — not with Issa himself, nor with a human. I only answer from his profile (projects, internships, skills, background). To reach him directly: **" + email + "**.\n\nTry for example:\n• “Who is Issa?”\n• “What are his AI skills?”";
    }
    const howTxt = how ? (lang === "fr" ? "Ça va très bien, merci ! 😊 " : "I'm doing great, thanks! 😊 ") : "";
    return howTxt + pick("greet_open", lang) + " " + pick("greet_body", lang) + "\n" + pick("greet_examples", lang);
  }

  /* ==========================================================================
     CONVERSATION D'ENTRETIEN : contexte, profondeur, variété (miroir de JesusChatbot)
       * réponse COURTE d'abord (l'essentiel + un résultat chiffré), puis, à la demande
         (« plus de détails », « pourquoi ? », « tell me more »), le niveau suivant :
         vue d'ensemble → détails techniques → résultats & limites → rôle / construction → fiche complète ;
       * « résume » : résumé du DERNIER sujet (ou de tout le profil) ;
       * formulations en rotation : jamais deux fois de suite la même.
     ========================================================================== */
  let CTX = null, ROT = {}, PENDING = null;
  function resetContext() {
    CTX = { topic: null, depth: 0, lang: null, shown: [], next: null };
    ROT = {};
    PENDING = null;
  }
  resetContext();
  function getContext() { return Object.assign({}, CTX, { shown: CTX.shown.slice() }); }

  /* Formulation suivante du pool CLASSIFIER.phrases[key] (rotation, jamais deux fois de suite) */
  function pick(key, lang) {
    const pool = CLASSIFIER.phrases[key][lang === "en" ? "en" : "fr"];
    const n = ROT[key] || 0;
    ROT[key] = n + 1;
    return pool[n % pool.length];
  }
  function setTopic(topic, depth) { PENDING = [topic, depth]; }
  const emailOf = () => KB.profile.contact.email;
  /* Assemble des lignes en ignorant les vides en fin de message (offre « vide ») */
  function joinLines(lines) {
    while (lines.length && !lines[lines.length - 1]) lines.pop();
    return lines.join("\n");
  }
  const isItem = iid => PROJECT_IDS.has(iid) || STAGE_IDS.has(iid);
  const getItem = iid => item("projects", iid) || item("internships", iid);

  /* Nom court d'un projet (avant « — », « ( », « : ») ou « Stage chez <entreprise> » */
  function shortName(iid, lang) {
    if (STAGE_IDS.has(iid)) {
      let comp = t(item("internships", iid).company, lang);
      for (const sep of [" (", ","]) { const i = comp.indexOf(sep); if (i > 0) comp = comp.slice(0, i); }
      return (lang === "fr" ? "Stage chez " : "Internship at ") + comp;
    }
    let name = t(item("projects", iid).name, lang);
    for (const sep of [" — ", " (", " : "]) { const i = name.indexOf(sep); if (i > 0) name = name.slice(0, i); }
    return name;
  }
  function sentences(text) { return String(text || "").trim().split(/(?<=[.!?])\s+/).filter(s => s); }
  /* Nombre de phrases d'accroche : la 1re, plus la 2e si la 1re est courte */
  function leadN(x, lang) {
    const ss = sentences(t(x.description, lang));
    return (ss.length > 1 && ss[0].length < 120) ? 2 : Math.min(1, ss.length);
  }
  function leadOf(x, lang) { return sentences(t(x.description, lang)).slice(0, leadN(x, lang)).join(" "); }
  /* Résultat chiffré mis en avant : celui des pitch_sources, sinon le premier */
  function keyMetric(iid, lang) {
    const ms = getItem(iid).metrics[lang];
    for (const [pid, idxs] of CLASSIFIER.pitch_sources) {
      if (pid === iid && idxs.length && idxs[0] < ms.length) return ms[idxs[0]];
    }
    return ms.length ? ms[0] : "";
  }
  /* Résultat chiffré le plus proche de la question (« how much faster » → « ×1000 plus rapide ») */
  function bestMetric(iid, lang, normQ) {
    const x = getItem(iid);
    /* mots-outils courts ignorés ; un mot-outil long et parlant (« faster ») compte */
    const stop = new Set([...CLASSIFIER.fuzzy_stop, ...CLASSIFIER.leftover_stop, ...[...HINTS_NORM].filter(h => h.length < 6)]);
    const qw = new Set(words(normQ || "").filter(w => w.length >= 4 && !stop.has(w)).map(fold));
    let best = "", bestN = 0;
    if (qw.size) {
      for (const m of x.metrics[lang]) {
        const mw = new Set(words(normalize(m)).map(fold));
        let n = 0;
        for (const w of qw) if (mw.has(w)) n++;
        if (n > bestN) { best = m; bestN = n; }
      }
    }
    return best || keyMetric(iid, lang);
  }
  function limitSentences(x, lang) { return sentences(t(x.description, lang)).filter(s => CRE.limits_re.test(normalize(s))); }
  /* Première proposition d'un texte (avant « ; », puis avant « : » si elle reste longue) */
  function clauseOf(text) {
    for (const sep of [" ; ", "; "]) { const i = text.indexOf(sep); if (i > 0) text = text.slice(0, i); }
    if (text.length > 160) {
      for (const sep of [" : ", ": "]) { const i = text.indexOf(sep); if (i > 0) text = text.slice(0, i); }
    }
    return text.replace(/[ .]+$/, "");
  }
  /* Premier texte de la liste qui contient l'un des mots-clés (normalisés) */
  function findText(items, ...keys) {
    for (const it of items) {
      const n = normalize(it);
      if (keys.some(k => new RegExp("\\b" + k + "\\b").test(n))) return it;
    }
    return "";
  }
  function summarySentence(lang, ...keys) { return findText(sentences(t(KB.profile.summary, lang)), ...keys); }

  /* ---- niveaux d'une fiche (projet / stage) ---- */
  const MAX_ITEM_LEVEL = 5, MAX_ABOUT_LEVEL = 3;
  /* Niveau d'entrée selon la question : fiche complète, rôle / construction, limites, technique, ou court */
  function entryLevel(normQ) {
    if (CRE.full_card_re.test(normQ)) return 5;
    if (CRE.level_role_re.test(normQ)) return 4;
    if (CRE.level_limits_re.test(normQ)) return 3;
    if (CRE.level_tech_re.test(normQ)) return 2;
    return 1;
  }
  /* Niveau demandé pour un projet / stage nommé ; « tell me more about X » → niveau suivant */
  function askLevel(iid, normQ) {
    let lvl = entryLevel(normQ);
    if (lvl === 1 && CRE.deeper_word_re.test(normQ)) lvl = CTX.topic === iid ? CTX.depth + 1 : 2;
    return lvl;
  }

  /* Réponse sur un projet / stage au niveau demandé (1 = court ... 5 = fiche complète) */
  function itemAnswer(iid, lang, level, offer, normQ) {
    if (offer === undefined) offer = true;
    normQ = normQ || "";
    const L = lang === "fr";
    const x = getItem(iid);
    const stage = STAGE_IDS.has(iid);
    level = Math.max(1, Math.min(level, MAX_ITEM_LEVEL));
    setTopic(iid, level);
    if (!CTX.shown.includes(iid)) CTX.shown.push(iid);
    const title = t(stage ? x.title : x.name, lang);
    const icon = stage ? "💼" : "🚀";
    if (level >= 5) return stage ? internshipCard(x, lang, []) : projectCard(x, lang, []);
    const lines = [];
    if (level === 1) {
      if (stage) lines.push(`${icon} **${title}** — ${t(x.company, lang)} · ${t(x.period, lang)} (${t(x.duration, lang)})`);
      else lines.push(`${icon} **${title}** — ${statusOf(x, lang)} · ${t(x.team_type, lang)} · ${t(x.period, lang)}`);
      lines.push(leadOf(x, lang));
      const km = bestMetric(iid, lang, normQ);
      if (km) lines.push(pick("metric_lead", lang) + " " + km);
      if (x.live_url) lines.push((L ? "🌐 Site en ligne : " : "🌐 Live site: ") + siteLink(x));
      if (offer) lines.push(pick("offer_l1", lang));
      return joinLines(lines);
    }
    if (level === 2) {
      lines.push(`${pick("open_l2", lang)} ${icon} **${shortName(iid, lang)}**`);
      const lim = new Set(limitSentences(x, lang));
      const rest = sentences(t(x.description, lang)).slice(leadN(x, lang)).filter(s => !lim.has(s));
      let body = "";
      for (const s of rest) {
        if (body && body.length + s.length > 700) break;
        body = (body + " " + s).trim();
      }
      if (body) lines.push(body);
      const hl = highlightsOf(x, lang);
      if (hl.length) lines.push((L ? "✨ Points clés : " : "✨ Highlights: ") + hl.slice(0, 3).join(" · "));
      lines.push((stage ? (L ? "🛠️ Environnement : " : "🛠️ Environment: ") : (L ? "🛠️ Technologies : " : "🛠️ Technologies: "))
        + x.technologies.join(", "));
      if (offer) lines.push(pick("offer_l2", lang));
      return joinLines(lines);
    }
    if (level === 3) {
      lines.push(`${pick("open_l3", lang)} ${icon} **${shortName(iid, lang)}**`);
      for (const m of x.metrics[lang]) lines.push("• " + m);
      const allM = x.metrics[lang].join(" ");
      const lim = limitSentences(x, lang).filter(s => !allM.includes(s)).slice(0, 2);
      if (lim.length) lines.push((L ? "⚠️ Limites : " : "⚠️ Limits: ") + lim.join(" "));
      if (offer) lines.push(pick("offer_l3", lang));
      return joinLines(lines);
    }
    /* level 4 : rôle, équipe, cadre, construction */
    lines.push(`${pick("open_l4", lang)} ${icon} **${shortName(iid, lang)}**`);
    if (x.role) lines.push((L ? "🎯 Rôle : " : "🎯 Role: ") + t(x.role, lang));
    if (stage) {
      lines.push((L ? "🏷️ Type : " : "🏷️ Type: ") + t(x.type, lang));
      lines.push((L ? "🏢 Entreprise : " : "🏢 Company: ") + t(x.company, lang));
    } else {
      lines.push(teamAnswer(x, lang).split("\n")[0]);
      lines.push("📌 " + t(x.context, lang));
    }
    lines.push((L ? "🗓️ Période : " : "🗓️ Period: ") + t(x.period, lang) + " — " + (L ? "durée : " : "duration: ") + t(x.duration, lang));
    if (x.how_built) lines.push((L ? "🏗️ Construction : " : "🏗️ How it was built: ") + sentences(t(x.how_built, lang)).slice(0, 3).join(" "));
    if (x.live_url) lines.push((L ? "🌐 Site en ligne : " : "🌐 Live site: ") + siteLink(x));
    const links = linksMd(x);
    if (links) lines.push((L ? "🔗 Liens : " : "🔗 Links: ") + links);
    if (offer) lines.push(pick("offer_l4", lang));
    return joinLines(lines);
  }

  /* Résumé en 4-6 lignes d'un projet / stage */
  function itemSummary(iid, lang) {
    const x = getItem(iid);
    const stage = STAGE_IDS.has(iid);
    setTopic(iid, Math.max(CTX.topic === iid ? CTX.depth : 1, 1));
    const lines = [pick("open_summary", lang)];
    if (stage) lines.push(`💼 **${t(x.title, lang)}** — ${t(x.company, lang)} · ${t(x.period, lang)}`);
    else lines.push(`🚀 **${t(x.name, lang)}** — ${statusOf(x, lang)} · ${t(x.period, lang)} · ${t(x.team_type, lang)}`);
    const ss = sentences(t(x.description, lang));
    if (ss.length) lines.push("• " + ss[0]);
    if (x.role) lines.push("• 🎯 " + clauseOf(t(x.role, lang)) + ".");
    const km = keyMetric(iid, lang);
    if (km) lines.push("• 📊 " + km);
    return joinLines(lines);
  }

  /* ---- profil (« Qui est Issa ? ») : 1 = court, 2 = parcours complet, 3 = résultats phares ---- */
  function aboutAnswer(lang, level) {
    const p = KB.profile;
    level = Math.max(1, Math.min(level || 1, MAX_ABOUT_LEVEL));
    setTopic("about", level);
    if (level === 2) {
      const pos = p.positioning ? "🧭 " + t(p.positioning, lang) + "\n\n" : "\n";
      return `👋 **${p.name}** — ${t(p.title, lang)}\n` + pos + t(p.summary, lang) + "\n\n🎯 " + t(p.objective, lang);
    }
    if (level === 3) return pitch(lang);
    const lines = [`👋 **${p.name}** — ${t(p.title, lang)}`];
    if (p.positioning) lines.push("🧭 " + t(p.positioning, lang));
    const cap = summarySentence(lang, "capgemini");
    if (cap) lines.push("💼 " + cap);
    lines.push("🎯 " + t(p.objective, lang));
    lines.push(pick("offer_about", lang));
    return joinLines(lines);
  }

  /* Résumé du profil en 4-6 lignes (« résume », « en bref » sans sujet en cours) */
  function profileSummary(lang) {
    const p = KB.profile;
    setTopic("about", 1);
    const lines = [pick("open_summary", lang), `👋 **${p.name}** — ${t(p.title, lang)}`];
    if (KB.education && KB.education.length) {
      const e = KB.education[0];
      lines.push(`• 🎓 ${t(e.degree, lang)} — ${t(e.school, lang)}`);
    }
    for (const key of ["capgemini", "aegisai"]) {
      const s = summarySentence(lang, key);
      if (s) lines.push((key === "capgemini" ? "• 💼 " : "• 🚀 ") + s);
    }
    lines.push(`• 🎯 ${t(p.objective, lang)} ✉️ ${emailOf()}`);
    return joinLines(lines);
  }

  /* ---- sujets d'entretien : niveaux (listes de lignes), uniquement à partir de la base ---- */
  function ivLevels(topic, lang, normQ) {
    const L = lang === "fr";
    const p = KB.profile;
    const cap = item("internships", "capgemini");
    const aeg = item("projects", "aegisai");
    const drone = item("projects", "drone");
    const soft = (KB.skills || {}).soft_skills || {};
    const own = soft["items_" + lang];
    const softItems = (own && own.length) ? own : (soft.items || []).map(x => splitBilingual(x, lang));
    const softNamed = (...keys) => softItems.filter(s => keys.some(k => new RegExp("\\b" + k + "\\b").test(normalize(s))));
    const metric = (x, ...keys) => x ? findText(x.metrics[lang], ...keys) : "";
    const sent = (x, ...keys) => x ? findText(sentences(t(x.description, lang)), ...keys) : "";
    const persoProjects = () => KB.projects.filter(x => /\b(?:personnel|personal)\b/.test(normalize(t(x.context, lang)))).map(x => shortName(x.id, lang));
    const lv = [];
    let rel = null;
    if (topic === "achievement") {
      rel = "capgemini";
      const l1 = [];
      if (cap) {
        const src = CLASSIFIER.pitch_sources.find(([pid]) => pid === "capgemini");
        const idxs = src ? src[1] : [0];
        const ms = idxs.filter(i => i < cap.metrics[lang].length).map(i => cap.metrics[lang][i]);
        l1.push(`• 💼 **${shortName("capgemini", lang)}** — ` + ms.join(" · "));
        const use = metric(cap, "variantes", "variants");
        if (use) l1.push("  " + use);
      }
      if (aeg) l1.push(`• 🚀 **${shortName("aegisai", lang)}** — ` + keyMetric("aegisai", lang));
      lv.push(l1);
      const l2 = [];
      if (cap) {
        const obj = metric(cap, "objectifs", "objectives");
        if (obj) l2.push(`• 💼 ${shortName("capgemini", lang)} — ${obj}`);
      }
      const ai = item("projects", "ai_act");
      if (ai) l2.push(`• ⚖️ **${shortName("ai_act", lang)}** — ${ai.metrics[lang][0]}`);
      if (drone) l2.push(`• 🛠️ **${shortName("drone", lang)}** — ${keyMetric("drone", lang)}`);
      lv.push(l2);
    } else if (topic === "difficulty") {
      rel = "capgemini";
      const l1 = [];
      const leak = sent(cap, "fuite de donnees", "data leakage", "data leak");
      if (leak) l1.push(`• 💼 ${shortName("capgemini", lang)} ` + (L ? "(modèle prédictif)" : "(predictive model)") + ` — ${leak}`);
      const opt = sent(drone, "optimistes", "optimistic");
      if (opt) l1.push(`• 🛠️ ${shortName("drone", lang)} — ${opt}`);
      lv.push(l1);
      const l2 = [];
      const simu = sent(drone, "limites", "limits");
      if (simu && simu !== opt) l2.push(`• 🛠️ ${shortName("drone", lang)} — ${simu}`);
      const mir = item("projects", "mir100");
      if (mir) l2.push(`• 🤖 ${shortName("mir100", lang)} — ${mir.metrics[lang][0]}`);
      const ma = item("projects", "multi_agents");
      const bug = sent(ma, "bug");
      if (bug) l2.push(`• 🛰️ ${shortName("multi_agents", lang)} — ${bug}`);
      lv.push(l2);
    } else if (topic === "motivation") {
      rel = "aegisai";
      const l1 = [];
      if (p.positioning) l1.push(`• 🧭 **${t(p.positioning, lang)}** — ${t(p.objective, lang)}`);
      else l1.push("• 🎯 " + t(p.objective, lang));
      let s = summarySentence(lang, "capgemini");
      if (s) l1.push("• 💼 " + s);
      lv.push(l1);
      const l2 = [];
      s = summarySentence(lang, "aegisai");
      if (s) l2.push("• 🚀 " + s);
      const hb = (p.hobbies || {})[lang] || [];
      const aiH = hb.filter(h => /\b(?:ia|ai|llms?)\b/.test(normalize(h)));
      if (aiH.length) l2.push((L ? "• 🎯 Jusque dans ses loisirs : " : "• 🎯 Even in his hobbies: ") + aiH.join(", ") + ".");
      const perso = persoProjects();
      if (perso.length) l2.push((L ? "• 🛠️ Projets personnels, en dehors des cours : " : "• 🛠️ Personal projects, outside his courses: ") + perso.join(" · "));
      lv.push(l2);
    } else if (topic === "career") {
      const l1 = [];
      if (CRE.interview_longterm_re.test(normQ)) {
        l1.push("• 🔎 " + (L ? "Ses plans à long terme ne figurent pas dans son profil — je préfère ne rien inventer. Ce qu'il vise aujourd'hui :"
          : "His long-term plans are not in his profile — I'd rather not make anything up. What he is aiming for today:"));
      }
      l1.push("• 🎯 " + t(p.objective, lang));
      if (p.positioning) l1.push("• 🧭 " + t(p.positioning, lang));
      const mob = (p.contact || {}).mobility;
      if (mob) l1.push("• 📍 " + t(mob, lang));
      lv.push(l1);
      const l2 = [];
      if (KB.education && KB.education.length) {
        const e = KB.education[0];
        l2.push(`• 🎓 ${t(e.degree, lang)} — ${t(e.school, lang)}`);
      }
      const gov = (KB.skills || {}).ai_governance;
      if (gov) l2.push(`• 🧠 **${t(gov.label, lang)}** : ` + gov.items.slice(0, 5).join(", "));
      lv.push(l2);
    } else if (topic === "leadership") {
      rel = "aegisai";
      const l1 = [];
      const sn = softNamed("autonomie", "autonomy", "proactivite", "proactivity");
      if (sn.length) l1.push((L ? "• 🧠 Qualité listée dans son profil : " : "• 🧠 Listed among his qualities: ") + sn.join(", ") + ".");
      for (const x of KB.extracurricular || []) {
        if (/\b(?:responsable|lead|leader)\b/.test(normalize(t(x.role, lang))))
          l1.push(`• 🤝 **${t(x.role, lang)}** | ${t(x.org, lang)} (${t(x.date, lang)}) — ${t(x.description, lang)}`);
      }
      if (aeg && aeg.role) l1.push(`• 🚀 **${shortName("aegisai", lang)}** — ${clauseOf(t(aeg.role, lang))}.`);
      lv.push(l1);
      const l2 = [];
      if (drone && drone.role) l2.push(`• 🛠️ **${shortName("drone", lang)}** (${t(drone.team_type, lang)}) — ${clauseOf(t(drone.role, lang))}.`);
      if (cap && cap.role) l2.push(`• 💼 **${shortName("capgemini", lang)}** — ${t(cap.role, lang)}`);
      lv.push(l2);
    } else if (topic === "teamwork") {
      rel = "drone";
      const l1 = [];
      const sn = softNamed("equipe", "team");
      if (sn.length) l1.push((L ? "• 🧠 Qualité listée dans son profil : " : "• 🧠 Listed among his qualities: ") + sn.join(", ") + ".");
      const grp = KB.projects.filter(x => Number.isInteger(x.team_size) && x.team_size > 1);
      if (grp.length) l1.push((L ? "• 👥 Projets d'équipe : " : "• 👥 Team projects: ") + grp.map(x => `${shortName(x.id, lang)} (${t(x.team_type, lang)})`).join(" · "));
      lv.push(l1);
      const l2 = [];
      for (const x of grp) if (x.role) l2.push(`• ${shortName(x.id, lang)} — ${t(x.role, lang)}`);
      for (const x of KB.extracurricular || []) {
        if (/\b(?:equipe|team)\b/.test(normalize(t(x.description, lang))))
          l2.push(`• 🤝 ${t(x.role, lang)} | ${t(x.org, lang)} — ${t(x.description, lang)}`);
      }
      l2.push(L ? "(Les noms des coéquipiers ne sont pas communiqués ici.)" : "(Teammates' names are not shared here.)");
      lv.push(l2);
    } else if (topic === "work_style") {
      rel = "aegisai";
      const l1 = [];
      const obj = metric(cap, "objectifs", "objectives");
      if (obj) l1.push(`• 🎯 ${shortName("capgemini", lang)} — ${obj}`);
      const tests = metric(aeg, "tests");
      if (tests) l1.push(`• 🧪 ${shortName("aegisai", lang)} — ${tests}`);
      const mg = (KB.skills || {}).management;
      if (mg) l1.push(`• 🧭 **${t(mg.label, lang)}** : ` + mg.items.slice(0, 4).join(", "));
      lv.push(l1);
      const l2 = [];
      const sn = softNamed("rigueur", "rigour", "autonomie", "autonomy", "analyse", "analytical");
      if (sn.length) l2.push((L ? "• 🧠 Qualités listées : " : "• 🧠 Listed qualities: ") + sn.join(", ") + ".");
      const mir = item("projects", "mir100");
      if (mir) l2.push((L ? "• 🔎 Il documente aussi ce qui n'est pas prouvé — " : "• 🔎 He also documents what is not proven — ")
        + `${shortName("mir100", lang)} : ${mir.metrics[lang][0]}`);
      lv.push(l2);
    } else if (topic === "pressure") {
      rel = "capgemini";
      const l1 = [];
      if (/\b(?:stress\w*|pression|pressure)\b/.test(normQ)) {
        l1.push("• 🔎 " + (L ? `Sa gestion du stress ne figure pas dans son profil en tant que telle (pour en parler avec lui : **${emailOf()}**) ; ce qu'il montre concrètement :`
          : `How he handles stress is not in his profile as such (to discuss it with him: **${emailOf()}**); what he shows concretely:`));
      }
      const sn = softNamed("temps", "time");
      if (sn.length) l1.push((L ? "• 🧠 Qualité listée dans son profil : " : "• 🧠 Listed among his qualities: ") + sn.join(", ") + ".");
      if (cap) {
        const obj = metric(cap, "objectifs", "objectives");
        l1.push(`• 💼 ${shortName("capgemini", lang)} (${t(cap.duration, lang)}) — ${obj}`);
      }
      const ai = item("projects", "ai_act");
      if (ai) l1.push(`• ⚖️ ${shortName("ai_act", lang)} — ${t(ai.duration, lang)}`);
      lv.push(l1);
      const l2 = [];
      const ongoing = KB.projects.filter(x => (x.status || {}).key === "ongoing").map(x => shortName(x.id, lang));
      if (ongoing.length) l2.push((L ? "• 📍 Projets menés en parallèle en ce moment : " : "• 📍 Projects he is running in parallel right now: ") + ongoing.join(" · "));
      if (drone) l2.push(`• 🛠️ ${shortName("drone", lang)} — ${t(drone.duration, lang)} · ${t(drone.context, lang)}`);
      lv.push(l2);
    } else if (topic === "learning") {
      rel = "ai_act";
      const l1 = [];
      const certs = KB.certifications || [];
      if (certs.length) l1.push((L ? "• 📜 Certifications : " : "• 📜 Certifications: ") + certs.map(c => `${c.name} (${t(c.issuer, lang)}, ${t(c.date, lang)})`).join(" · "));
      const perso = persoProjects();
      if (perso.length) l1.push((L ? "• 🛠️ Projets personnels, en dehors des cours : " : "• 🛠️ Personal projects, outside his courses: ") + perso.join(" · "));
      const sn = softNamed("curiosite", "curiosity", "adaptabilite", "adaptability");
      if (sn.length) l1.push((L ? "• 🧠 Qualités listées : " : "• 🧠 Listed qualities: ") + sn.join(", ") + ".");
      lv.push(l1);
      const l2 = [];
      const hb = (p.hobbies || {})[lang] || [];
      const rd = hb.filter(h => /\b(?:lecture|reading|ia|ai)\b/.test(normalize(h)));
      if (rd.length) l2.push((L ? "• 📖 Loisirs : " : "• 📖 Hobbies: ") + rd.join(", ") + ".");
      const basics = Object.values(KB.skills || {}).flatMap(cat => cat.items || []).filter(it => /\bnotions\b/.test(normalize(it)));
      if (basics.length) l2.push((L ? "• 🌱 Compétences listées au niveau « notions » : " : "• 🌱 Skills listed at a “basics” level: ") + basics.slice(0, 5).join(", "));
      lv.push(l2);
    } else if (topic === "current") {
      rel = "aegisai";
      const l1 = [];
      for (const x of KB.projects) {
        if ((x.status || {}).key !== "ongoing") continue;
        const solo = isSolo(x) ? (L ? " — mené seul" : " — run alone") : "";
        l1.push(`• **${t(x.name, lang)}** — ${statusOf(x, lang)} · ${t(x.context, lang)}${solo}`);
      }
      l1.push("• 🎯 " + t(p.objective, lang));
      lv.push(l1);
      const l2 = [];
      for (const x of KB.projects) {
        if ((x.status || {}).key === "ongoing") l2.push(`• **${shortName(x.id, lang)}** — ${leadOf(x, lang)}`);
      }
      lv.push(l2);
    }
    return [lv.filter(l => l.length), rel];
  }

  /* Réponse à un sujet d'entretien au niveau demandé ; au-delà, on propose le projet lié */
  function interviewAnswer(topic, lang, level, normQ) {
    const [levels, rel] = ivLevels(topic, lang, normQ || "");
    level = level || 1;
    if (level > levels.length) return endAnswer(lang, rel);
    setTopic("iv:" + topic, level);
    const lines = [];
    if (level === 1) lines.push(pick("iv_" + topic, lang));
    lines.push(...levels[level - 1]);
    if (level < levels.length) lines.push(pick("offer_topic", lang));
    else if (rel) lines.push(offerItem(rel, lang));
    return joinLines(lines);
  }

  /* Proposition de passer à un projet / stage (« oui » → sa présentation courte) */
  function offerItem(iid, lang) {
    const name = shortName(iid, lang);
    CTX.next = iid;
    return lang === "fr" ? `Voulez-vous que je vous présente « ${name} » ?` : `Would you like me to walk you through “${name}”?`;
  }

  /* Sujet épuisé : on le dit, on donne l'email, on propose d'autres sujets (jamais d'invention) */
  function endAnswer(lang, rel) {
    const lines = [pick("end_topic", lang), pick("end_contact", lang).replace("{email}", emailOf())];
    const cur = CTX.topic;
    let sug = CLASSIFIER.showcase_order.filter(i => isItem(i) && i !== cur && !CTX.shown.includes(i)).slice(0, 3);
    if (rel && rel !== cur && isItem(rel)) sug = [rel].concat(sug.filter(i => i !== rel).slice(0, 2));
    if (sug.length) {
      lines.push(pick("suggest", lang) + " " + sug.map(i => shortName(i, lang)).join(" · "));
      CTX.next = sug[0];
    }
    setTopic(cur, CTX.depth || 0);
    return joinLines(lines);
  }

  /* Résumé d'une rubrique (compétences : domaines et nombre d'éléments ; sinon la rubrique elle-même) */
  function sectionSummary(sec, lang, normQ) {
    setTopic(sec, 1);
    if (sec === "skills") {
      const cats = Object.values(KB.skills);
      return joinLines([pick("open_summary", lang)].concat(cats.map(c => `• **${t(c.label, lang)}** (${c.items.length}) : ` + c.items.slice(0, 3).join(", "))));
    }
    if (sec.startsWith("iv:")) return interviewAnswer(sec.slice(3), lang, 1);
    if (sec === "about") return profileSummary(lang);
    const a = answerFor(sec, lang, [], normQ || "");
    return a ? pick("open_summary", lang) + "\n" + a : profileSummary(lang);
  }

  /* Relance « plus de détails », « pourquoi ? », « oui » : niveau suivant du DERNIER sujet */
  function deeper(lang, normQ) {
    const topic = CTX.topic, depth = CTX.depth || 0;
    const nxt = CTX.next;
    CTX.next = null;
    /* « oui » à « Voulez-vous que je vous présente X ? » */
    if (nxt && CRE.accept_re.test(normQ)) return itemAnswer(nxt, lang, 1);
    if (!topic) return aboutAnswer(lang, 1);
    if (isItem(topic)) return depth >= MAX_ITEM_LEVEL ? endAnswer(lang) : itemAnswer(topic, lang, depth + 1);
    if (topic === "about") return depth >= MAX_ABOUT_LEVEL ? endAnswer(lang) : aboutAnswer(lang, depth + 1);
    if (topic.startsWith("iv:")) return interviewAnswer(topic.slice(3), lang, depth + 1);
    if (topic === "skills" && depth < 2) return skillsInProjects(lang);
    if (topic === "education" && depth < 2) {
      setTopic("education", 2);
      return schoolList(schoolProjects(""), lang);
    }
    return endAnswer(lang);
  }

  /* Compétences → où elles ont servi (technologies de chaque projet / stage) */
  function skillsInProjects(lang) {
    setTopic("skills", 2);
    const lines = ["🧩 " + (lang === "fr" ? "Où ces compétences ont servi :" : "Where these skills were used:")];
    for (const iid of CLASSIFIER.showcase_order) {
      const x = getItem(iid);
      if (x && x.technologies && x.technologies.length) lines.push(`• **${shortName(iid, lang)}** — ` + x.technologies.slice(0, 5).join(", "));
    }
    return joinLines(lines);
  }

  /* « Quoi d'autre ? » : la réalisation suivante, pas encore présentée */
  function otherItem(lang) {
    const cur = CTX.topic;
    for (const iid of CLASSIFIER.showcase_order) {
      if (isItem(iid) && iid !== cur && !CTX.shown.includes(iid)) return pick("other_open", lang) + "\n" + itemAnswer(iid, lang, 1);
    }
    return endAnswer(lang);
  }

  /* Relance d'intention sans sujet (« combien de temps ? ») : on demande de quel projet il s'agit */
  function clarify(lang) {
    const sug = CLASSIFIER.showcase_order.slice(0, 4).filter(isItem).map(i => shortName(i, lang));
    return pick("clarify", lang) + "\n" + (lang === "fr" ? "Par exemple : " : "For example: ") + sug.join(" · ");
  }

  /* Relances « nues » : résumé, équipe, autre réalisation, approfondissement ; null si ce n'en est pas une */
  function followupAnswer(normQ, lang) {
    const topic = CTX.topic;
    if (CRE.summary_bare_re.test(normQ)) {
      if (topic && isItem(topic)) return itemSummary(topic, lang);
      if (topic) return sectionSummary(topic, lang, normQ);
      return profileSummary(lang);
    }
    if (CRE.team_followup_re.test(normQ)) {
      if (topic && PROJECT_IDS.has(topic)) {
        setTopic(topic, CTX.depth || 1);
        return teamAnswer(item("projects", topic), lang);
      }
      return null;
    }
    if (CRE.other_followup_re.test(normQ)) return otherItem(lang);
    if (CRE.deeper_re.test(normQ) || CRE.accept_re.test(normQ)) return deeper(lang, normQ);
    return null;
  }

  /* Le visiteur interroge le bot comme le candidat (« quels sont tes projets ? », « comment gérez-vous la
     pression ? ») : sur un sujet PROFESSIONNEL (you_res), le tutoiement / vouvoiement désigne Issa →
     pronoms de 3e personne. Avis, conseils, aide, jeu de rôle, goûts (you_block_re) : texte inchangé. */
  const YOU_RES = CLASSIFIER.you_res.map(x => new RegExp(x));
  const INTERVIEW = CLASSIFIER.interview_topics.map(([k, v]) => [k, new RegExp(v)]);
  function interviewee(normQ) {
    if (!normQ || !CRE.you_word_re.test(normQ)) return normQ;
    const cs = chatspeak(normQ);
    if (CRE.you_block_re.test(cs) || !YOU_RES.some(r => r.test(cs))) return normQ;
    const pm = CLASSIFIER.you_pronoun_map, vm = CLASSIFIER.you_verb_map;
    const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
    const toks = cs.split(" ");
    const out = toks.slice();
    const imp = CLASSIFIER.you_imperatives;
    for (let i = 0; i < toks.length; i++) {
      const w = toks[i];
      if (has(imp, w) && !has(pm, w)) out[i] = imp[w];  /* « parlez-moi de vous » → « parle moi de lui » */
      if (!has(pm, w)) continue;
      out[i] = pm[w];
      if (["vous", "toi"].includes(w) && i > 0 && has(imp, toks[i - 1])) {
        /* « présentez-vous » → « presente le » */
        out[i - 1] = imp[toks[i - 1]];
        out[i] = "le";
        continue;
      }
      if (["vous", "toi", "you"].includes(w) && i > 0 && CLASSIFIER.you_prepositions.includes(toks[i - 1])) {
        out[i] = w !== "you" ? "lui" : "him";
        continue;
      }
      if (!["tu", "vous", "you", "u", "t"].includes(w)) continue;
      for (const j of [i - 1, i + 1]) {
        if (j < 0 || j >= toks.length || has(pm, toks[j])) continue;
        const v = toks[j];
        if (has(vm, v)) out[j] = vm[v];
        else if (w === "tu" && v.length > 4 && v.endsWith("es")) out[j] = v.slice(0, -1);
        else if (w === "vous" && v.length > 4 && v.endsWith("ez")) out[j] = v.slice(0, -2) + "e";
      }
    }
    return out.join(" ");
  }
  /* Sujet d'entretien (motivation, difficultés, leadership...) d'une question réécrite, ou null */
  function interviewTopic(normQ) {
    for (const [k, rx] of INTERVIEW) if (rx.test(normQ)) return k;
    return null;
  }

  /* ---------- Point d'entrée public ---------- */
  function reply(question, forcedLang, inner) {
    if (inner) return replyCore(question, forcedLang || detectLanguage(question), true);
    let lang = forcedLang;
    if (!lang) {
      lang = detectLanguage(question);
      const [fr, en] = langCounts(question);
      const norm = normalize(stripVocative(question));
      /* relance sans mot-outil (« oui », « ok », « why? ») : langue de la conversation */
      if (fr === 0 && en === 0 && CTX.lang && (CRE.accept_re.test(norm) || CRE.ack_re.test(norm)
          || CRE.deeper_re.test(norm) || CRE.summary_bare_re.test(norm))) lang = CTX.lang;
    }
    PENDING = null;
    const ans = replyCore(question, lang, false);
    if (PENDING) { CTX.topic = PENDING[0]; CTX.depth = PENDING[1]; }
    CTX.lang = lang;
    return ans;
  }
  /* Tour traité par le LLM : met à jour le contexte (sujet, profondeur) sans afficher de réponse */
  function observe(question) { reply(question); }

  function replyCore(question, lang, inner) {
    const L = lang === "fr";
    const [cls, reason] = classifyKR(question);
    if (cls === "greeting") {
      /* « c'est toi Issa ? », « am I talking to a bot? » : on dit clairement qui répond */
      const cs = chatspeak(normalize(question));
      const who = CRE.identity_re.test(cs) && !CRE.greeting_re.test(cs)
        && CRE.identity_person_re.test(chatspeak(normalize(stripVocative(question))));
      return greeting(lang, false, CRE.howareyou_re.test(normalize(question)), who);
    }
    if (cls === "thanks") return pick(reason === "ack" ? "ack" : "thanks", lang);
    if (cls === "off_topic") return refusal(lang);

    /* Question MIXTE : on répond à la partie « profil » et on décline poliment le reste */
    if (!inner) {
      const mixed = mixedClauses(question);
      if (mixed.length) {
        /* une réponse par proposition du profil (sans doublon) */
        const parts = [];
        for (const c of mixed) {
          const a = reply(c, lang, true);
          if (!parts.includes(a)) parts.push(a);
        }
        return parts.join("\n\n———\n\n") + "\n\n" + pick("mixed_tail", lang);
      }
    }

    /* le visiteur qui se présente (« je suis RH chez ... ») ne pose pas de question sur Issa */
    const rawQ = stripSelfIntro(stripVocative(question));
    /* tutoiement / vouvoiement sur un sujet professionnel → Issa (« tes projets » → « ses projets ») */
    const normQ = spellFix(interviewee(normalize(rawQ)));
    /* vie privée (« Issa a un chat ? ») : absent du profil, même si « chat » désigne aussi un projet */
    if (CRE.personal_re.test(normQ)) return notInProfile(lang);
    /* relances « nues » : résumé / détails / équipe / autre réalisation du DERNIER sujet */
    if (!inner) {
      const fa = followupAnswer(normQ, lang);
      if (fa) return fa;
    }
    const sig = signals(normQ, rawQ);
    let entities = sig[0];
    const genericOnly = sig[5];
    const intents = findIntents(normQ);
    const isSpecific = e => PROJECT_IDS.has(e) || STAGE_IDS.has(e);
    /* relance courte sur le DERNIER projet / stage (« combien de temps ? », « et les résultats ? »,
       « quel était son rôle ? ») : la question ne nomme aucun projet ni stage et ne dit rien d'autre */
    const topic = CTX.topic;
    if (!inner && !entities.some(isSpecific) && entities.every(e => e === "about" || e === "skills")
        && words(normQ).length <= CLASSIFIER.followup_max_words + 2
        && sig[2].every(w => CLASSIFIER.followup_words.includes(w))
        && !CRE.availability_re.test(normQ) && !CRE.current_work_re.test(normQ)) {
      const asked = intents.filter(i => ["duration", "metrics", "technologies", "team", "status", "cv_status"].includes(i));
      const lvl = entryLevel(normQ);
      const bare = !entities.length || (entities.length === 1 && entities[0] === "about");
      if (topic && isItem(topic)) {
        if (asked.length && (bare || (asked.length === 1 && asked[0] === "technologies"))) return answerFor(topic, lang, asked, normQ);
        if (lvl > 1 && bare) return itemAnswer(topic, lang, lvl);
      } else if (asked.length && !entities.length && !sig[1] && asked.every(i => ["duration", "metrics", "technologies"].includes(i))) {
        return clarify(lang);
      }
    }
    /* projet d'école ACTUEL (« son projet d'école actuel ? ») : le projet académique en cours */
    let genericOnly2 = genericOnly;
    let schoolIds = [];
    if (CRE.school_now_re.test(normQ) && !entities.some(isSpecific)) {
      const cur = currentSchoolProjects();
      if (cur.length) { entities = cur; genericOnly2 = []; }
    } else if (CRE.school_list_re.test(normQ) && !entities.some(isSpecific)) {
      /* projets d'école en général (« his school projects? ») : les projets académiques */
      schoolIds = schoolProjects(normQ);
    }
    /* seuls des alias GÉNÉRIQUES (« experience », « management ») : un sujet plus précis trouvé
       dans la base par les autres mots l'emporte (« change management », « acoustic signals ») */
    /* (sauf mise en ligne / déploiement : « il a de l'expérience en prod ? » → deployAnswer plus bas) */
    if (genericOnly2.length && entities.every(e => genericOnly2.includes(e) || e === "about") && !CRE.deploy_re.test(normQ)) {
      const sec = retrieve(stripGeneric(normQ), lang);
      if (sec) return sec;
      /* sujet précis absent de la base (« experience with acoustic signals ») : réponse honnête
         plutôt que la liste générique des stages */
      if (absentTerms(stripGeneric(normQ)).length) return notInProfile(lang);
    }

    /* Priorité aux sujets précis (projet / stage) ; sinon « Issa » / « lui »
       n'ajoutent pas tout le profil à une question ciblée. */
    const hasItem = entities.some(isSpecific);
    if (hasItem) {
      entities = entities.filter(isSpecific);
      /* détail absent de la fiche (« il était payé chez JESA ? ») : réponse honnête + la fiche concernée */
      if (CRE.item_nip_re.test(normQ)) return notInProfile(lang) + "\n\n———\n\n" + entities.map(e => headline(e, lang)).join("\n");
    } else if (entities.length > 1 && entities.includes("about")) {
      entities = entities.filter(e => e !== "about");
    }

    /* Infos personnelles absentes du profil / points forts (hors fiche précise) */
    if (!hasItem) {
      /* sujet absent qu'un mot proche ferait passer pour un « oui » (Tableau, appli mobile) */
      if (CRE.absent_topic_re.test(normQ)) return absentAnswer(normQ, lang);
      /* mises en ligne / déploiements (« has he deployed anything to production? ») */
      if (CRE.deploy_re.test(normQ)) return deployAnswer(lang);
      /* résumé d'un parcours / profil (« sum up his background in two sentences ») */
      if (CRE.summary_target_re.test(normQ)) return profileSummary(lang);
      /* sujet d'entretien (motivation, difficultés, leadership, pression...) : réponse courte, à approfondir */
      const itop = interviewTopic(normQ);
      if (itop && !CRE.not_in_kb_re.test(normQ) && !CRE.availability_re.test(normQ)) {
        const allowed = new Set(CLASSIFIER.interview_entities);
        if (itop === "difficulty" && !/\b(?:jou\w*|play\w*|aux|partie|parties)\b/.test(normQ)) allowed.add("hobbies");  /* « son plus grand échec » ≠ les échecs (loisir) */
        if (entities.every(e => allowed.has(e))) return interviewAnswer(itop, lang, 1, normQ);
      }
      const parts = [];
      /* date de début (« il peut commencer en mars ? ») → disponibilité, avant le statut des projets */
      if (CRE.availability_re.test(normQ)) parts.push(answerFor("objective", lang, [], normQ));
      if (CRE.not_in_kb_re.test(normQ)) {
        let nip = notInProfile(lang);
        const mob = (KB.profile.contact || {}).mobility;
        /* déplacements / mobilité : seule la mobilité connue est rappelée (« Basé à Paris ») */
        if (mob && CRE.mobility_q_re.test(normQ)) nip += (L ? "\n\n📍 Ce que dit son profil : " : "\n\n📍 What his profile says: ") + t(mob, lang) + ".";
        parts.push(nip);
      }
      /* points forts / qualités (« pourquoi le choisir ? », « il sait vulgariser ? ») → pitch */
      if (CRE.strengths_re.test(normQ) || entities.includes("soft_skills")) parts.push(softAnswer(normQ, lang));
      if (parts.length) return parts.join("\n\n———\n\n");
      if (schoolIds.length) return schoolList(schoolIds, lang);
    }

    /* Question de STATUT sans projet précis → liste filtrée par statut */
    if (intents.includes("status") && entities.every(e => ["projects_list", "internships_list", "about"].includes(e))) {
      return statusList(lang, normQ, entities);
    }

    const generic = entities.every(e => ["projects_list", "about"].includes(e));
    /* « Il travaille seul ? », « avec qui ? » sans projet précis → équipe de chaque projet ;
       « équipe(s) » complément d'autre chose (« workshops with business teams ») → section de la base */
    if (intents.includes("team") && generic) {
      if (!CRE.team_overview_re.test(normQ)) {
        const sec = retrieve(normQ, lang);
        if (sec) return sec;
      }
      return teamOverview(lang);
    }
    /* « Sur quoi travaille-t-il en ce moment ? » → projets en cours (seul ou non), objectif */
    if (CRE.current_work_re.test(normQ) && generic) return interviewAnswer("current", lang, 1, normQ);

    if (!entities.length || (entities.length === 1 && entities[0] === "about")) {
      /* Demande de RÉSUMÉ sans sujet précis → résumé du profil (4-6 lignes) ; présentation → profil court */
      if (CRE.summary_word_re.test(normQ)) return profileSummary(lang);
      if (SUMMARY_RE.test(normQ) || CRE.summary_signal_re.test(normQ)) return aboutAnswer(lang, 1);
      const fz = fuzzyBest(normQ, lang);
      if (fz) return fz;
      /* repli : meilleure section de la base (projet, stage, compétence, langues...) */
      const sec = retrieve(normQ, lang);
      if (sec) return sec;
      if (unknownTerms(normQ).length) return notInProfile(lang);
      return aboutAnswer(lang, 1);
    }

    const answers = [];
    for (const ent of entities.slice(0, 3)) {
      const a = answerFor(ent, lang, intents, normQ);
      if (a) answers.push(a);
    }
    if (answers.length) {
      if (!PENDING) setTopic(entities[0], 1);
      return answers.join("\n\n———\n\n");
    }
    return retrieve(normQ, lang) || notInProfile(lang);
  }

  /* ---------- Markdown léger (gras, italique, code, puces, titres, liens) → HTML SÛR ----------
     Protection XSS : TOUS les caractères dangereux (& < > " ') sont échappés AVANT
     toute mise en forme ; seules quelques balises fixes sont ensuite produites
     (strong, em, code, a http/https, span de mise en page). Aucune entrée — même
     une réponse LLM manipulée — ne peut injecter de balise ni casser un attribut. */
  function escHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function mdInline(s) {
    return s
      .replace(/`([^`\n]+)`/g, "<code>$1</code>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[\s(])\*(?![\s*])([^*\n]+?)\*(?=[\s).,;:!?]|$)/g, "$1<em>$2</em>")
      /* liens Markdown [texte](url) : le texte visible peut différer de l'URL
         (ex. « lamkharbechissa.com » pointant vers l'URL réelle GitHub Pages).
         Uniquement http/https. À faire AVANT l'auto-lien des URL brutes. */
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s()<>"']+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      /* auto-lien des URL brutes restantes (jamais celles déjà dans un href :
         le caractère précédent ne doit être ni «"» ni «>» ni «=») */
      .replace(/(^|[^"'>=])(https?:\/\/[^\s<>"']+)/g,
        '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
  }
  function mdToHtml(text) {
    const lines = escHtml(text).replace(/\r\n?/g, "\n").split("\n");
    let html = "";
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let m;
      if (/^\s*$/.test(line)) { if (html) html += '<span class="jw-gap"></span>'; continue; }
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { html += '<span class="jw-gap"></span>'; continue; }
      if ((m = line.match(/^\s{0,3}#{1,4}\s+(.+)$/))) { html += '<span class="jw-h">' + mdInline(m[1].replace(/\*\*/g, "")) + "</span>"; continue; }
      if ((m = line.match(/^\s*(?:[-*•▪]|&#8226;)\s+(.+)$/))) { html += '<span class="jw-li">' + mdInline(m[1]) + "</span>"; continue; }
      if ((m = line.match(/^\s*(\d{1,2})[.)]\s+(.+)$/))) { html += '<span class="jw-li jw-ol"><b class="jw-n">' + m[1] + ".</b> " + mdInline(m[2]) + "</span>"; continue; }
      html += '<span class="jw-p">' + mdInline(line) + "</span>";
    }
    return html;
  }

  /* ==========================================================================
     WIDGET DE CHAT — injecté dans la page (bouton flottant + fenêtre)
       * mode « IA conversationnelle » (relais LLM + RAG, js/rag.js) ou
         « hors ligne » (moteur à règles ci-dessus), badge dans l'en-tête ;
       * réponse affichée au fil de l'eau (streaming), bouton Arrêter ;
       * après chaque réponse : puces de relance (Approfondir, Résumer, sujets liés).
     Points d'accroche utilisés par js/notify.js (NE PAS RENOMMER) :
       #jw-messages, #jw-form, .jw-chip, #jesus-launcher, .jw-close.
     ========================================================================== */
  const UI = {
    fr: {
      launcher: "Discuter avec ISSA", openChat: "Ouvrir le chat avec ISSA", close: "Fermer le chat",
      dialog: "ISSA, l'assistant IA d'Issa Lamkharbech",
      placeholder: "Posez votre question, comme en entretien…", inputLabel: "Votre question",
      send: "Envoyer", stop: "Arrêter la réponse",
      modeLlm: "IA conversationnelle", modeOffline: "Mode hors ligne",
      tipLlm: "Réponses générées par IA, uniquement à partir du parcours réel d'Issa",
      tipOffline: "Réponses instantanées du moteur local, à partir du parcours réel d'Issa",
      history: "Historique des conversations", newConv: "Nouvelle conversation",
      historyTitle: "Mes conversations", closeHistory: "Fermer l'historique",
      suggestions: "Suggestions de questions", chipAria: "Demander : ",
      fallback: "Réponse du mode hors ligne : l'IA est momentanément indisponible.",
      interrupted: "Réponse interrompue (délai dépassé).",
      stopped: "Réponse arrêtée.",
      sources: "D'après : ", jump: "Aller au dernier message",
      greetLlm: "Bonjour ! Je suis **ISSA**, l'assistant IA d'Issa Lamkharbech : je réponds en son nom, à partir de son parcours réel. Interrogez-moi comme en entretien — je peux résumer ou approfondir.",
      greetOffline: "Bonjour ! Je suis **ISSA**, l'assistant IA d'Issa Lamkharbech. Je réponds à partir de son parcours réel : posez vos questions comme en entretien — je peux résumer ou approfondir.",
      starters: [["📝 Résume ton parcours", "Résume ton parcours"],
                 ["🚀 Ton projet le plus impressionnant ?", "Ton projet le plus impressionnant ?"],
                 ["🎯 Pourquoi te recruter ?", "Pourquoi te recruter ?"]],
      deeper: ["🔎 Approfondir", "Approfondis"], summary: ["📝 Résumer", "Résume"],
      whyHire: ["🎯 Pourquoi te recruter ?", "Pourquoi te recruter ?"],
      project: n => "Parle-moi du projet " + n, internship: n => "Parle-moi de ton stage chez " + n
    },
    en: {
      launcher: "Chat with ISSA", openChat: "Open the chat with ISSA", close: "Close the chat",
      dialog: "ISSA, Issa Lamkharbech's AI assistant",
      placeholder: "Ask your question, as in an interview…", inputLabel: "Your question",
      send: "Send", stop: "Stop the answer",
      modeLlm: "Conversational AI", modeOffline: "Offline mode",
      tipLlm: "AI-generated answers, based only on Issa's real background",
      tipOffline: "Instant answers from the local engine, based on Issa's real background",
      history: "Conversation history", newConv: "New conversation",
      historyTitle: "My conversations", closeHistory: "Close history",
      suggestions: "Suggested questions", chipAria: "Ask: ",
      fallback: "Offline-mode answer: the AI is temporarily unavailable.",
      interrupted: "Answer interrupted (time limit reached).",
      stopped: "Answer stopped.",
      sources: "Based on: ", jump: "Jump to the latest message",
      greetLlm: "Hello! I'm **ISSA**, Issa Lamkharbech's AI assistant: I answer on his behalf, from his real background. Ask me anything as in an interview — I can summarize or dive deeper.",
      greetOffline: "Hello! I'm **ISSA**, Issa Lamkharbech's AI assistant. I answer from his real background: ask your questions as in an interview — I can summarize or dive deeper.",
      starters: [["📝 Summarize your background", "Summarize your background"],
                 ["🚀 Your most impressive project?", "Your most impressive project?"],
                 ["🎯 Why should we hire you?", "Why should we hire you?"]],
      deeper: ["🔎 Dive deeper", "Dive deeper"], summary: ["📝 Summarize", "Summarize"],
      whyHire: ["🎯 Why hire you?", "Why should we hire you?"],
      project: n => "Tell me about the " + n + " project", internship: n => "Tell me about your internship at " + n
    }
  };
  /* sujets transverses proposés en relance quand le relais les a utilisés comme sources */
  const TOPIC_CHIPS = {
    skills: { fr: ["🧰 Compétences", "Quelles sont tes compétences ?"], en: ["🧰 Skills", "What are your skills?"] },
    soft_skills: { fr: ["🤝 Savoir-être", "Quelles sont tes qualités humaines ?"], en: ["🤝 Soft skills", "What are your soft skills?"] },
    teamwork: { fr: ["👥 Travail en équipe", "Comment travailles-tu en équipe ?"], en: ["👥 Teamwork", "How do you work in a team?"] },
    lessons: { fr: ["🧗 Leçons apprises", "Qu'as-tu appris de tes difficultés ?"], en: ["🧗 Lessons learned", "What did you learn from your setbacks?"] },
    education: { fr: ["🎓 Formation", "Parle-moi de ta formation"], en: ["🎓 Education", "Tell me about your education"] },
    certifications: { fr: ["📜 Certifications", "Quelles certifications as-tu ?"], en: ["📜 Certifications", "What certifications do you have?"] },
    languages: { fr: ["🌍 Langues", "Quelles langues parles-tu ?"], en: ["🌍 Languages", "Which languages do you speak?"] },
    extracurricular: { fr: ["🎯 Vie associative", "Parle-moi de tes activités parascolaires"], en: ["🎯 Extracurricular", "Tell me about your extracurricular activities"] }
  };
  /* « AegisAI — Autonomous … » → « AegisAI » (même règle que short_name de jesus_rag.py) */
  function chipName(name) {
    const s = String(name || "").split(/ — | – | \(| : |: /)[0].trim();
    return s.length <= 70 ? s : s.slice(0, 67).replace(/\s+\S*$/, "") + "…";
  }
  function clipLabel(s, n) { return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s; }
  /* Puce « en parler » pour un projet / stage / sujet transverse, ou null */
  function topicChip(entity, lang) {
    const L = UI[lang], tx = f => (f && typeof f === "object") ? (f[lang] || f.fr || "") : (f || "");
    const pr = (KB.projects || []).find(p => p.id === entity);
    if (pr) { const n = chipName(tx(pr.name)); return { id: entity, label: "🚀 " + clipLabel(n, 30), prompt: L.project(n) }; }
    const st = (KB.internships || []).find(s => s.id === entity);
    if (st) { const n = chipName(tx(st.company)); return { id: entity, label: "💼 " + clipLabel(n, 30), prompt: L.internship(n) }; }
    const tc = TOPIC_CHIPS[entity];
    return tc ? { id: entity, label: tc[lang][0], prompt: tc[lang][1] } : null;
  }

  function buildWidget() {
    const RAG = () => window.JesusRAG;
    const wrap = document.createElement("div");
    wrap.id = "jesus-widget";
    wrap.innerHTML = `
      <button id="jesus-launcher" type="button" aria-label="Ouvrir le chat avec ISSA" aria-haspopup="dialog" aria-expanded="false">
        <span class="jl-icon" aria-hidden="true">💬</span>
        <span class="jl-label">Discuter avec ISSA</span>
        <span class="jl-pulse"></span>
      </button>
      <div id="jesus-window" class="jesus-hidden" role="dialog" aria-label="ISSA">
        <div class="jw-header">
          <div class="jw-avatar" aria-hidden="true">IA</div>
          <div class="jw-title">
            <strong>ISSA</strong>
            <span class="jw-status" data-mode="offline" role="status"><span class="jw-dot" aria-hidden="true"></span><span class="jw-mode-label"></span></span>
          </div>
          <button type="button" class="jw-icon-btn jw-history-btn" aria-label="Historique des conversations" title="Historique" hidden>🕑</button>
          <button type="button" class="jw-icon-btn jw-new-btn" aria-label="Nouvelle conversation" title="Nouvelle conversation" hidden>✚</button>
          <button type="button" class="jw-close" aria-label="Fermer">×</button>
        </div>
        <div class="jw-history-panel" id="jw-history-panel" hidden>
          <div class="jw-history-head"><span class="jw-history-title">Mes conversations</span><button type="button" class="jw-history-close" aria-label="Fermer l'historique">×</button></div>
          <div class="jw-history-list" id="jw-history-list"></div>
        </div>
        <div class="jw-body">
          <div class="jw-messages" id="jw-messages" role="log" aria-live="polite" aria-relevant="additions"></div>
          <button type="button" class="jw-jump" hidden aria-label="Aller au dernier message">↓</button>
        </div>
        <div class="jw-suggestions" id="jw-suggestions" role="group" aria-label="Suggestions"></div>
        <form class="jw-inputbar" id="jw-form">
          <input id="jw-input" type="text" autocomplete="off" maxlength="600" enterkeyhint="send"
                 placeholder="Posez votre question, comme en entretien…" aria-label="Votre question">
          <button type="submit" class="jw-send" aria-label="Envoyer"><span aria-hidden="true">➤</span></button>
        </form>
      </div>`;
    document.body.appendChild(wrap);

    const $w = sel => wrap.querySelector(sel);
    const launcher = $w("#jesus-launcher");
    const win = $w("#jesus-window");
    const closeBtn = $w(".jw-close");
    const messages = $w("#jw-messages");
    const jumpBtn = $w(".jw-jump");
    const form = $w("#jw-form");
    const input = $w("#jw-input");
    const sendBtn = $w(".jw-send");
    const suggestions = $w("#jw-suggestions");
    const status = $w(".jw-status");
    const modeLabel = $w(".jw-mode-label");
    const historyBtn = $w(".jw-history-btn");
    const newBtn = $w(".jw-new-btn");
    const historyPanel = $w("#jw-history-panel");
    const historyList = $w("#jw-history-list");
    const historyCloseBtn = $w(".jw-history-close");
    const HIST = window.ISSAHistory;

    /* état de la conversation */
    let busy = false;            /* une réponse est en cours */
    let controller = null;       /* AbortController du bouton Arrêter */
    let epoch = 0;               /* compteur de conversation : une réponse lancée avant un changement de conversation est ignorée */
    let convLang = null;         /* langue de la conversation (dernière question) */
    let pinned = true;           /* l'utilisateur est en bas de la conversation */
    const explored = new Set();  /* sujets déjà abordés (pas reproposés en puce) */
    const asked = new Set();     /* questions déjà envoyées par puce */

    function currentLang() {
      return (document.documentElement.getAttribute("data-lang") === "en" ? "en" : "fr");
    }

    /* persistance (historique local / Supabase) — silencieuse si non configurée */
    function persist(role, content) {
      if (HIST && HIST.enabled) HIST.addMessage(role, content, currentLang());
    }

    /* ---------- libellés de l'interface (suivent la langue du site) ---------- */
    function applyChrome() {
      const L = UI[currentLang()];
      const lbl = $w(".jl-label");
      if (lbl) lbl.textContent = L.launcher;
      launcher.setAttribute("aria-label", L.openChat);
      win.setAttribute("aria-label", L.dialog);
      closeBtn.setAttribute("aria-label", L.close);
      historyBtn.setAttribute("aria-label", L.history); historyBtn.title = L.history;
      newBtn.setAttribute("aria-label", L.newConv); newBtn.title = L.newConv;
      $w(".jw-history-title").textContent = L.historyTitle;
      historyCloseBtn.setAttribute("aria-label", L.closeHistory);
      input.placeholder = L.placeholder;
      input.setAttribute("aria-label", L.inputLabel);
      suggestions.setAttribute("aria-label", L.suggestions);
      jumpBtn.setAttribute("aria-label", L.jump); jumpBtn.title = L.jump;
      setBusy(busy);
      renderMode();
    }

    /* ---------- badge de mode : IA conversationnelle / hors ligne ---------- */
    function currentMode() { const r = RAG(); return r && r.mode ? r.mode() : "offline"; }
    function renderMode() {
      const L = UI[currentLang()], m = currentMode();
      status.dataset.mode = m;
      modeLabel.textContent = m === "llm" ? L.modeLlm : L.modeOffline;
      status.title = m === "llm" ? L.tipLlm : L.tipOffline;
    }
    if (RAG() && RAG().onModeChange) RAG().onModeChange(renderMode);

    /* ---------- défilement : suit la réponse sans lutter contre l'utilisateur ---------- */
    const nearBottom = () => messages.scrollHeight - messages.scrollTop - messages.clientHeight < 72;
    messages.addEventListener("scroll", () => {
      pinned = nearBottom();
      if (pinned) jumpBtn.hidden = true;
    }, { passive: true });
    function autoScroll(force) {
      if (force) pinned = true;
      if (pinned) { messages.scrollTop = messages.scrollHeight; jumpBtn.hidden = true; }
      else jumpBtn.hidden = false;
    }
    jumpBtn.addEventListener("click", () => {
      pinned = true;
      messages.scrollTo({ top: messages.scrollHeight, behavior: "smooth" });
      jumpBtn.hidden = true;
      input.focus();
    });

    /* ---------- messages ---------- */
    function addMessage(text, who) {
      const div = document.createElement("div");
      div.className = "jw-msg " + who;
      if (who === "bot") {
        div.innerHTML = `<div class="jw-msg-avatar" aria-hidden="true">IA</div><div class="jw-bubble">${mdToHtml(text)}</div>`;
      } else {
        div.innerHTML = `<div class="jw-bubble">${mdToHtml(text)}</div>`;
      }
      messages.appendChild(div);
      autoScroll(who === "user");
      return div;
    }
    function addNote(div, text, kind) {
      const bubble = div && div.querySelector(".jw-bubble");
      if (!bubble) return;
      const n = document.createElement("span");
      n.className = "jw-note" + (kind ? " jw-note-" + kind : "");
      n.textContent = text;
      bubble.appendChild(n);
    }
    function addSources(div, meta, lang) {
      const bubble = div && div.querySelector(".jw-bubble");
      const src = (meta && Array.isArray(meta.sources)) ? meta.sources : [];
      if (!bubble || !src.length) return;
      const seen = [];
      for (const s of src) {
        const base = String(s.title || "").split(" — ")[0].replace(/\s*\(\d+\/\d+\)\s*$/, "").trim();
        if (base && !seen.includes(base)) seen.push(base);
        if (seen.length >= 3) break;
      }
      if (!seen.length) return;
      const n = document.createElement("span");
      n.className = "jw-sources";
      n.textContent = UI[lang].sources + seen.join(" · ");
      bubble.appendChild(n);
    }
    function addSystemNote(text) {
      const n = document.createElement("div");
      n.className = "jw-sys";
      n.textContent = text;
      messages.appendChild(n);
      autoScroll();
    }
    function showTyping() {
      const typing = document.createElement("div");
      typing.className = "jw-msg bot jw-typing-row";
      typing.setAttribute("aria-hidden", "true");
      typing.innerHTML = `<div class="jw-msg-avatar">IA</div><div class="jw-bubble jw-typing"><span></span><span></span><span></span></div>`;
      messages.appendChild(typing);
      autoScroll();
      return typing;
    }

    /* ---------- puces (démarrage et relances) ---------- */
    function renderChips(list) {
      suggestions.innerHTML = "";
      const L = UI[convLang || currentLang()];
      for (const c of list) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "jw-chip";
        b.textContent = c.label;
        b.setAttribute("aria-label", L.chipAria + c.prompt);
        b.addEventListener("click", () => {
          if (busy) return;
          asked.add(c.prompt);
          if (c.id) explored.add(c.id);
          handleQuestion(c.prompt);
        });
        suggestions.appendChild(b);
      }
      suggestions.hidden = !list.length;
    }
    function starterChips(lang) {
      return UI[lang].starters.filter(s => !asked.has(s[1])).map(s => ({ label: s[0], prompt: s[1] }));
    }
    /* sujets suivants à découvrir (stages puis projets, dans l'ordre de la base) */
    function discoveryChips(lang, n) {
      const out = [];
      const ids = (KB.internships || []).map(s => s.id).concat((KB.projects || []).map(p => p.id));
      for (const id of ids) {
        if (out.length >= n) break;
        if (explored.has(id)) continue;
        const c = topicChip(id, lang);
        if (c && !asked.has(c.prompt)) out.push(c);
      }
      return out;
    }
    function followupChips(lang, meta) {
      const L = UI[lang];
      const chips = [{ label: L.deeper[0], prompt: L.deeper[1] }, { label: L.summary[0], prompt: L.summary[1] }];
      const extra = [];
      const src = (meta && Array.isArray(meta.sources)) ? meta.sources : [];
      const main = src.length ? src[0].entity : null;
      for (const s of src) {
        if (extra.length >= 2) break;
        if (!s || s.entity === main || explored.has(s.entity) || extra.some(c => c.id === s.entity)) continue;
        const c = topicChip(s.entity, lang);
        if (c && !asked.has(c.prompt)) extra.push(c);
      }
      if (extra.length < 2 && !asked.has(L.whyHire[1]) && explored.size >= 2) extra.push({ label: L.whyHire[0], prompt: L.whyHire[1] });
      if (extra.length < 2) extra.push(...discoveryChips(lang, 2 - extra.length));
      return chips.concat(extra.slice(0, 2));
    }
    function engineTopic() {
      try { return (window.Jesus.getContext() || {}).topic || null; } catch (_) { return null; }
    }

    /* ---------- état « réponse en cours » : bouton Envoyer ⇄ Arrêter ---------- */
    function setBusy(on) {
      busy = on;
      const L = UI[currentLang()];
      sendBtn.classList.toggle("jw-stop", on);
      sendBtn.setAttribute("aria-label", on ? L.stop : L.send);
      sendBtn.title = on ? L.stop : L.send;
      sendBtn.firstElementChild.textContent = on ? "■" : "➤";
      suggestions.classList.toggle("jw-busy", on);
      suggestions.querySelectorAll(".jw-chip").forEach(b => { b.disabled = on; });
    }

    /* ---------- réponses ---------- */
    const isRefusal = ans => {
      const R = RAG();
      return Boolean(R && R.REFUSALS && (R.REFUSALS.fr.includes(ans) || R.REFUSALS.en.includes(ans)));
    };

    /* Moteur hors ligne (instantané) : salutations, refus, questions mixtes, repli */
    function localAnswer(q, lang, opts) {
      opts = opts || {};
      const my = epoch;
      const finish = () => {
        if (my !== epoch) return;   /* conversation changée entre-temps : réponse périmée */
        const ans = opts.answer != null ? opts.answer : reply(q);
        const div = addMessage(ans, "bot");
        if (opts.note) addNote(div, UI[lang].fallback, "fallback");
        persist("assistant", ans);
        const substantive = opts.kind === "on_topic" && !isRefusal(ans);
        if (substantive) {
          const R = RAG();
          if (R && R.remember) R.remember(q, ans);
          const tp = engineTopic();
          if (tp) explored.add(tp);
          renderChips(followupChips(lang, null));
        } else {
          renderChips(starterChips(lang).length ? starterChips(lang) : discoveryChips(lang, 3));
        }
      };
      if (opts.delay === 0) { finish(); return; }
      busy = true;   /* courte pause « écrit… » (sans basculer le bouton en Arrêter) */
      const typing = showTyping();
      setTimeout(() => { typing.remove(); busy = false; finish(); }, opts.delay || 320);
    }

    /* Mode IA conversationnelle : relais LLM + RAG en streaming */
    async function llmAnswer(q, lang) {
      const R = RAG();
      const my = epoch;   /* « Nouvelle conversation » / conversation rouverte pendant le flux -> on ignore la suite */
      setBusy(true);
      controller = new AbortController();
      const typing = showTyping();
      let div = null, bubble = null, full = "", meta = null, raf = 0;
      const paint = () => { raf = 0; if (bubble) { bubble.innerHTML = mdToHtml(full); autoScroll(); } };
      const open = () => {
        if (div) return;
        typing.remove();
        div = document.createElement("div");
        div.className = "jw-msg bot";
        div.innerHTML = `<div class="jw-msg-avatar" aria-hidden="true">IA</div><div class="jw-bubble jw-streaming" aria-busy="true"></div>`;
        bubble = div.querySelector(".jw-bubble");
        messages.appendChild(div);
      };
      const settle = text => {
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        open();
        bubble.innerHTML = mdToHtml(text);
        bubble.classList.remove("jw-streaming");
        bubble.removeAttribute("aria-busy");
      };
      const keep = (text, noteText, kind) => {
        if (my !== epoch) return;
        settle(text);
        if (noteText) addNote(div, noteText, kind);
        else addSources(div, meta, lang);
        autoScroll();
        persist("assistant", text);
        if (R.remember) R.remember(q, text);
        try { if (window.Jesus.observe) window.Jesus.observe(q); } catch (_) { /* contexte hors ligne facultatif */ }
        const src = meta && meta.sources;
        if (src && src.length && src[0].entity) explored.add(src[0].entity);
        renderChips(followupChips(lang, meta));
      };
      try {
        const res = await R.ask(q, lang, {
          signal: controller.signal,
          onMeta: m => { meta = m; },
          onToken: (_d, all) => {
            full = all;
            open();
            if (!raf) raf = requestAnimationFrame(paint);
          }
        });
        meta = res.meta || meta;
        keep(res.text);
      } catch (err) {
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        typing.remove();
        if (my !== epoch) return;   /* le finally remet quand même busy / controller à zéro */
        const partial = (err && err.partial) || full;
        if (err && err.kind === "aborted") {
          if (partial.trim()) keep(partial, UI[lang].stopped, "stopped");
          else {
            if (div) div.remove();
            addSystemNote(UI[lang].stopped);
            renderChips(starterChips(lang).length ? starterChips(lang) : discoveryChips(lang, 3));
          }
        } else if (partial.trim() && partial.length > 80) {
          keep(partial + " …", UI[lang].interrupted, "fallback");
        } else {
          /* échec du relais (quota, réseau, délai…) → repli transparent hors ligne */
          if (div) div.remove();
          console.warn("ISSA : relais IA indisponible, repli hors ligne —", err && err.message);
          localAnswer(q, lang, { note: true, kind: "on_topic", delay: 0 });
        }
      } finally {
        controller = null;
        setBusy(false);
        renderMode();
      }
    }

    /* ======================= CHEMIN D'ENVOI (aiguillage) =======================
       classifyDetail(q) du moteur décide AVANT tout appel réseau :
         salutation / remerciement / « ok »        → moteur local, instantané
         hors sujet « explicit » (tâche, injection…) → refus local, aucun appel
         garde-fou OFFTOPIC_PATTERNS (rag.js)       → refus local, aucun appel
         question mixte (profil + tâche hors sujet) → moteur local
         hors sujet « default » (non reconnu)       → relais IA si disponible (le LLM
                                                       répond ou décline poliment),
                                                       sinon moteur local
         sujet professionnel                        → relais IA si disponible, sinon
                                                       moteur local ; échec → repli local */
    function route(q) {
      const det = classifyDetail(q);
      const R = RAG();
      const mixed = det.kind === "on_topic" && mixedClauses(q).length > 0;
      if (det.kind === "greeting" || det.kind === "thanks") return { path: "local", kind: det.kind };
      if (det.kind === "off_topic" && det.reason === "explicit") return { path: "refuse", kind: det.kind };
      if (!mixed && R && R.isOffTopicTask && R.isOffTopicTask(q)) return { path: "refuse", kind: "off_topic" };
      if (mixed) return { path: "local", kind: "on_topic" };
      if (R && R.llmAvailable && R.llmAvailable()) return { path: "llm", kind: det.kind };
      return { path: "local", kind: det.kind };
    }

    function handleQuestion(raw) {
      if (busy) return;
      const q = String(raw || "").trim().slice(0, 600);
      if (!q) return;
      addMessage(q, "user");
      persist("user", q);
      /* langue : celle de la question ; une relance très courte (« ok », « why? »,
         « AegisAI ? ») garde la langue de la conversation */
      let lang = detectLanguage(q) === "en" ? "en" : "fr";
      if (convLang && normalize(q).split(" ").length <= 2) lang = convLang;
      convLang = lang;
      const r = route(q);
      if (r.path === "refuse") {
        localAnswer(q, lang, { answer: refusal(lang), kind: "off_topic", delay: 200 });
      } else if (r.path === "llm") {
        llmAnswer(q, lang);
      } else {
        localAnswer(q, lang, { kind: r.kind, delay: (r.kind === "greeting" || r.kind === "thanks") ? 150 : 320 });
      }
    }

    /* ---------- ouverture / fermeture ---------- */
    function greet() {
      const lang = currentLang();
      convLang = null;
      const L = UI[lang];
      addMessage(currentMode() === "llm" ? L.greetLlm : L.greetOffline, "bot");
      renderChips(starterChips(lang));
    }
    let opened = false;
    let healthChecked = false;
    function openWin() {
      win.classList.remove("jesus-hidden");
      launcher.classList.add("jl-hidden");
      launcher.setAttribute("aria-expanded", "true");
      const R = RAG();
      if (!healthChecked && R && R.configured && R.configured()) {
        healthChecked = true;
        R.health().then(renderMode);   /* relais joignable ? sinon badge « hors ligne » */
      }
      if (!opened) {
        opened = true;
        applyChrome();
        greet();
      }
      input.focus();
    }
    function closeWin() {
      win.classList.add("jesus-hidden");
      launcher.classList.remove("jl-hidden");
      launcher.setAttribute("aria-expanded", "false");
      launcher.focus();
    }

    launcher.addEventListener("click", openWin);
    closeBtn.addEventListener("click", closeWin);
    win.addEventListener("keydown", e => {
      if (e.key === "Escape") {
        if (!historyPanel.hidden) { historyPanel.hidden = true; return; }
        if (busy && controller) { controller.abort(); return; }
        closeWin();
      }
    });
    form.addEventListener("submit", e => {
      e.preventDefault();
      /* pendant une réponse : seul le bouton (devenu « Arrêter ») interrompt ;
         la touche Entrée ne fait rien, la question tapée attend la fin */
      if (busy) { if (controller && e.submitter === sendBtn) controller.abort(); return; }
      const q = input.value.trim();
      if (!q) return;
      input.value = "";
      handleQuestion(q);
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
        row.innerHTML = `<button type="button" class="jw-hi-main"><span class="jw-hi-title"></span>
          <span class="jw-hi-date">${escHtml(fmtDate(c.updated_at))}</span></button>
          <button type="button" class="jw-hi-del" aria-label="${L ? "Supprimer" : "Delete"}" title="${L ? "Supprimer" : "Delete"}">🗑</button>`;
        row.querySelector(".jw-hi-title").textContent = c.title || "Conversation";
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

    function abortCurrent() { if (controller) controller.abort(); }
    function resetState() {
      explored.clear(); asked.clear(); convLang = null;
      try { if (window.Jesus.resetContext) window.Jesus.resetContext(); } catch (_) { /* ignoré */ }
    }

    async function openConversation(id) {
      if (!(HIST && HIST.enabled)) return;
      epoch++;
      abortCurrent();
      const msgs = await HIST.open(id);
      resetState();
      messages.innerHTML = "";
      for (const m of msgs) addMessage(m.content, m.role === "user" ? "user" : "bot");
      /* restaure la mémoire du relais et le contexte du moteur hors ligne pour CONTINUER */
      const R = RAG();
      if (R && R.setHistory) R.setHistory(msgs);
      const users = msgs.filter(m => m.role === "user").slice(-4);
      try { users.forEach(m => window.Jesus.observe(m.content)); } catch (_) { /* ignoré */ }
      const last = users.length ? users[users.length - 1].content : "";
      convLang = last ? (detectLanguage(last) === "en" ? "en" : "fr") : currentLang();
      historyPanel.hidden = true;
      renderChips(last ? followupChips(convLang, null) : starterChips(convLang));
      autoScroll(true);
      input.focus();
    }

    function startNewConversation(silent) {
      epoch++;
      abortCurrent();
      if (HIST) HIST.currentId = null;
      const R = RAG();
      if (R && R.resetConversation) R.resetConversation();
      resetState();
      messages.innerHTML = "";
      greet();
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

    /* Initialise la persistance : si l'historique est disponible, on montre les
       boutons historique/nouveau ; sinon le chat reste tel quel. */
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

    /* Le changement de langue du site met à jour l'interface et, avant toute
       question, les puces de démarrage */
    document.addEventListener("jesus:langchange", () => {
      applyChrome();
      if (opened && !convLang && !busy) renderChips(starterChips(currentLang()));
    });
    applyChrome();
  }

  window.Jesus = { reply, classify, classifyDetail, mixedClauses, refusal, detectLanguage, findEntities, findIntents, normalize, greeting,
                   resetContext, getContext, observe };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildWidget);
  } else {
    buildWidget();
  }
})();
