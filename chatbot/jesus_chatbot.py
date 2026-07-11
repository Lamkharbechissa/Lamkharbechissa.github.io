# -*- coding: utf-8 -*-
"""
================================================================================
 JESUS — Chatbot personnel d'Issa Lamkharbech
================================================================================

Ce fichier détaille la CONSTRUCTION COMPLÈTE du chatbot « ISSA », l'assistant
intelligent intégré au site web d'Issa Lamkharbech. Il répond, en français et
en anglais, à toute question sur les projets, les stages, les compétences, le
parcours scolaire, les certifications, les langues et la vie associative
d'Issa — exclusivement à partir du dossier de documents fourni (CV, rapports
de projets, rapports de stages, READMEs, code source), sans rien ajouter ni
retrancher.

--------------------------------------------------------------------------------
 ARCHITECTURE DU CHATBOT (5 étapes)
--------------------------------------------------------------------------------

  Question utilisateur
        │
        ▼
  [1] DÉTECTION DE LANGUE  (français ou anglais)
        │   → score de mots-outils FR vs EN ("quel", "est" vs "what", "is"...)
        ▼
  [2] NORMALISATION        (minuscules, suppression des accents/ponctuation)
        │
        ▼
  [3] DÉTECTION D'ENTITÉ   (de quoi parle-t-on ? drone ? Capgemini ? JESA ?)
        │   → dictionnaire d'alias FR/EN par entité (projets, stages, sections)
        ▼
  [4] DÉTECTION D'INTENTION (que veut-on savoir ? durée ? équipe ? technos ?)
        │   → familles de mots-clés : durée, entreprise, équipe, technologies,
        │     métriques, description, groupe/solo, CV, contact, formation...
        ▼
  [5] COMPOSITION DE LA RÉPONSE
            → la réponse est assemblée à partir de la base de connaissances
              (knowledge_base.json) dans la langue détectée. Si aucune entité
              n'est trouvée, un score de recouvrement lexical (fuzzy matching)
              sélectionne le meilleur passage. Sinon, le bot se présente et
              propose des questions.

POURQUOI CE CHOIX (et pas un LLM distant) ?
  * Temps de réponse quasi instantané (< 5 ms) : tout est local, aucun appel
    réseau — exigence n°1 du cahier des charges (« très rapide à répondre »).
  * Fidélité totale : le bot ne peut répondre QUE ce que contient le dossier
    (aucune hallucination, « sans ajouter ni retrancher »).
  * Déployable gratuitement sur un site statique (GitHub Pages / Netlify) :
    le même moteur est porté en JavaScript (../js/jesus.js) pour tourner
    directement dans le navigateur du visiteur.
  * Ce fichier Python est la RÉFÉRENCE : il permet de tester le bot en console,
    de servir une API (FastAPI) et de régénérer la base JS du site web.

--------------------------------------------------------------------------------
 UTILISATION
--------------------------------------------------------------------------------
  python jesus_chatbot.py               # chat interactif dans le terminal
  python jesus_chatbot.py --export      # régénère ../js/kb.js pour le site web
  python jesus_chatbot.py --api         # sert l'API REST (pip install fastapi uvicorn)
  python jesus_chatbot.py --test        # exécute la suite de tests bilingues
================================================================================
"""

import json
import os
import re
import sys
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
KB_PATH = os.path.join(HERE, "knowledge_base.json")

# La console Windows utilise cp1252 par défaut : on force l'UTF-8 pour
# pouvoir afficher les emojis et les accents du chatbot.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


# ==============================================================================
# ÉTAPE 0 — CHARGEMENT DE LA BASE DE CONNAISSANCES
# ==============================================================================
def load_kb(path: str = KB_PATH) -> dict:
    """Charge knowledge_base.json — la source unique de vérité du chatbot,
    construite exclusivement à partir des documents du dossier d'Issa."""
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


# ==============================================================================
# ÉTAPE 1 — DÉTECTION DE LA LANGUE (FR / EN)
# ==============================================================================
FR_HINTS = {
    "quel", "quelle", "quels", "quelles", "qui", "est", "quoi", "combien",
    "ou", "où", "comment", "pourquoi", "quand", "le", "la", "les", "un",
    "une", "des", "du", "de", "et", "il", "elle", "sur", "avec", "dans",
    "son", "sa", "ses", "parle", "moi", "dis", "donne", "c'est", "cest",
    "stage", "projet", "projets", "duree", "durée", "entreprise", "equipe",
    "équipe", "compétences", "competences", "parcours", "études", "etudes",
    "formation", "langues", "bonjour", "salut", "merci",
}
EN_HINTS = {
    "what", "who", "which", "how", "when", "where", "why", "is", "are",
    "was", "the", "a", "an", "of", "and", "his", "her", "about", "tell",
    "me", "did", "does", "do", "with", "on", "in", "at", "long", "many",
    "internship", "internships", "project", "projects", "skills", "company",
    "team", "duration", "education", "background", "languages", "hello",
    "hi", "thanks", "please", "can", "you",
}


def detect_language(text: str) -> str:
    """Compte les mots-outils français vs anglais. Retourne 'fr' ou 'en'.
    En cas d'égalité, le français (langue principale du site) l'emporte."""
    words = re.findall(r"[a-zA-ZÀ-ÿ']+", text.lower())
    fr = sum(1 for w in words if w in FR_HINTS)
    en = sum(1 for w in words if w in EN_HINTS)
    return "en" if en > fr else "fr"


# ==============================================================================
# ÉTAPE 2 — NORMALISATION DU TEXTE
# ==============================================================================
def normalize(text: str) -> str:
    """minuscules + suppression des accents + nettoyage de la ponctuation,
    pour que « Capgémini », « capgemini » ou « CAPGEMINI ? » se recoupent."""
    text = unicodedata.normalize("NFD", text.lower())
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


# ==============================================================================
# ÉTAPE 3 — DICTIONNAIRE D'ENTITÉS (alias FR + EN → entité de la base)
# ==============================================================================
# Chaque entité du dossier (projet, stage, section du profil) est décrite par
# une liste d'alias : tous les mots/expressions par lesquels un visiteur
# pourrait la désigner, dans les deux langues.
ENTITY_ALIASES = {
    # ---- Stages ----
    "capgemini":      ["capgemini", "capgemini engineering", "mg2", "stage ingenieur",
                       "engineering internship", "fem", "elements finis", "finite element",
                       "mecanique computationnelle", "computational mechanics",
                       "peugeot", "pointnet", "gemini"],
    "jesa":           ["jesa", "jorf lasfar", "stage d observation", "observation internship",
                       "ahf", "acide fluorhydrique", "hydrofluoric", "ocp", "worley",
                       "sogea", "phileas", "innovx", "safety walk", "hse", "stage d initiation"],
    # ---- Projets ----
    "drone":          ["drone", "bi rotor", "birotor", "bimoteur", "bi moteur", "banc d essai",
                       "test bench", "maintenance predictive", "predictive maintenance",
                       "detection de defauts", "fault detection", "arduino", "drone ai"],
    "mir100":         ["mir100", "mir 100", "agv", "jumeau numerique mir", "logistique",
                       "logistics", "robot mobile", "cobot", "bras ur", "qr code",
                       "priorisation", "mission"],
    "salle_connectee": ["salle connectee", "salle informatique", "connected classroom",
                        "classroom", "gi iads", "giads", "esp32", "esp8266", "laravel",
                        "salle intelligente", "smart room", "industrie 4 0 salle", "lampe", "lamp"],
    "multi_agents":   ["multi agents", "multi agent", "multiagents", "cartographie",
                       "mapping", "surveillance", "slam", "yolo", "yolov8", "webots",
                       "e puck", "epuck", "swarm", "robots cooperatifs"],
    "cat_emotion":    ["chat", "chats", "cat", "cats", "emotion", "emotions", "felin",
                       "miaulement", "meow", "cat emotion", "sante des chats", "tkinter"],
    "portfolio_ia":   ["portfolio", "site web", "website", "ce site", "this site", "ce chatbot",
                       "this chatbot", "toi meme", "yourself", "supabase", "groq", "cloudflare",
                       "assistant ia", "ai assistant", "comment tu es fait", "how are you built",
                       "ce projet", "this project", "site actuel"],
    # ---- Sections du profil ----
    "education":      ["parcours", "etudes", "formation", "formations", "scolaire", "ecole",
                       "education", "school", "studies", "background", "ensam", "arts et metiers",
                       "bac", "baccalaureat", "prepa", "preparatoire", "diplome", "degree",
                       "aix en provence", "meknes"],
    "skills":         ["competences", "skills", "maitrise", "technologies", "stack",
                       "outils", "tools", "langages", "sait faire", "capable"],
    "languages":      ["langues", "languages", "arabe", "arabic", "francais", "french",
                       "anglais", "english", "espagnol", "spanish", "parle quelles"],
    "certifications": ["certification", "certifications", "certificat", "certificats",
                       "certificate", "mitx", "edx", "coursera", "ibm", "lean six sigma",
                       "yellow belt", "eclee", "agile", "scrum"],
    "extracurricular": ["parascolaire", "extrascolaire", "club", "clubs", "associatif",
                        "association", "alhayat", "caravan", "pompage solaire", "solar",
                        "extracurricular", "volunteer", "benevolat"],
    "contact":        ["contact", "contacter", "email", "mail", "telephone", "phone",
                       "linkedin", "github", "joindre", "reach", "coordonnees", "adresse"],
    "objective":      ["alternance", "apprenticeship", "recherche", "looking for",
                       "disponible", "available", "objectif", "objective", "embauche", "recruter", "hire"],
    "about":          ["qui est issa", "qui es tu", "who is issa", "presente", "presentation",
                       "profil", "profile", "about", "a propos", "lamkharbech", "issa", "lui", "him"],
    "projects_list":  ["projets", "projects", "realisations", "portfolio", "travaux", "works"],
    "internships_list": ["stages", "internships", "experiences", "experience professionnelle",
                         "work experience", "entreprises", "companies"],
}

# ==============================================================================
# ÉTAPE 4 — FAMILLES D'INTENTIONS (que veut savoir le visiteur ?)
# ==============================================================================
INTENT_KEYWORDS = {
    "duration":   ["duree", "combien de temps", "how long", "duration", "periode",
                   "period", "quand", "when", "date", "dates", "mois", "months", "lasted"],
    "company":    ["entreprise", "societe", "company", "employeur", "employer",
                   "chez qui", "chez quelle", "where did", "organisation", "organization"],
    "team":       ["equipe", "team", "groupe", "group", "seul", "alone", "solo",
                   "binome", "avec qui", "with whom", "membres", "members", "combien de personnes",
                   "how many people", "individuel", "individual", "encadre", "supervised", "encadrant"],
    "technologies": ["technologie", "technologies", "technos", "outils", "tools",
                     "stack", "langage", "language utilise", "framework", "librairies",
                     "libraries", "utilise quoi", "built with", "developpe avec"],
    "metrics":    ["resultat", "resultats", "results", "metriques", "metrics",
                   "performance", "performances", "accuracy", "precision", "score", "kpi", "chiffres"],
    "cv_status":  ["cv", "resume", "specifie", "mentionne", "figure", "listed", "specified"],
    "description": ["decris", "describe", "detail", "details", "explique", "explain",
                    "parle moi", "tell me about", "contenu", "content", "quoi exactement",
                    "en quoi consiste", "what is", "c est quoi", "raconte"],
}


class JesusChatbot:
    """Le moteur du chatbot ISSA : rapide, bilingue, 100% fidèle au dossier."""

    def __init__(self, kb: dict = None):
        self.kb = kb or load_kb()
        # Index inversé : alias normalisé -> id d'entité (le plus long d'abord,
        # pour que « stage d observation » gagne sur « stage »).
        self._alias_index = []
        for entity, aliases in ENTITY_ALIASES.items():
            for alias in aliases:
                self._alias_index.append((normalize(alias), entity))
        self._alias_index.sort(key=lambda t: -len(t[0]))

    # ---- étape 3 : quelles entités sont mentionnées ? -----------------------
    def find_entities(self, norm_q: str) -> list:
        found, consumed = [], norm_q
        padded = f" {norm_q} "
        for alias, entity in self._alias_index:
            if f" {alias} " in padded or (len(alias) > 5 and alias in norm_q):
                if entity not in found:
                    found.append(entity)
        return found

    # ---- étape 4 : quelles intentions ? -------------------------------------
    def find_intents(self, norm_q: str) -> list:
        intents = []
        for intent, kws in INTENT_KEYWORDS.items():
            if any(normalize(k) in norm_q for k in kws):
                intents.append(intent)
        return intents

    # ---- helpers de formatage ------------------------------------------------
    @staticmethod
    def _t(field, lang):
        """Renvoie la variante linguistique d'un champ bilingue."""
        if isinstance(field, dict):
            return field.get(lang) or field.get("fr") or ""
        return field

    def _item(self, kind, iid):
        for it in self.kb[kind]:
            if it["id"] == iid:
                return it
        return None

    # ---- fiches complètes ------------------------------------------------------
    def project_card(self, p, lang, intents):
        t = self._t
        L = lang == "fr"
        lines = [f"🚀 **{t(p['name'], lang)}**"]
        lines.append(f"📌 {t(p['context'], lang)}")
        lines.append(("🗓️ Période : " if L else "🗓️ Period: ") + t(p["period"], lang)
                     + (" — " + ("durée : " if L else "duration: ") + t(p["duration"], lang)))
        lines.append("👥 " + t(p["team_type"], lang)
                     + (" — " + (", ".join(p["team"])) if p.get("team") else ""))
        if p.get("supervisors"):
            lines.append(("🎓 Encadré par : " if L else "🎓 Supervised by: ") + ", ".join(p["supervisors"]))
        lines.append(("📄 Spécifié dans le CV : " if L else "📄 Listed on the CV: ")
                     + (("oui" if L else "yes") if p["in_cv"] else ("non" if L else "no")))
        if not intents or "description" in intents:
            lines.append("")
            lines.append(t(p["description"], lang))
        lines.append("")
        lines.append(("🛠️ Technologies : " if L else "🛠️ Technologies: ") + ", ".join(p["technologies"]))
        lines.append(("📊 Résultats : " if L else "📊 Results: ") + " · ".join(p["metrics"][lang]))
        return "\n".join(lines)

    def internship_card(self, s, lang, intents):
        t = self._t
        L = lang == "fr"
        lines = [f"💼 **{t(s['title'], lang)}**"]
        lines.append(("🏷️ Type : " if L else "🏷️ Type: ") + t(s["type"], lang))
        lines.append(("🏢 Entreprise : " if L else "🏢 Company: ") + t(s["company"], lang))
        lines.append(("🗓️ Période : " if L else "🗓️ Period: ") + t(s["period"], lang)
                     + " — " + ("durée : " if L else "duration: ") + t(s["duration"], lang))
        if not intents or "description" in intents:
            lines.append("")
            lines.append(t(s["description"], lang))
        if "company" in intents:
            lines.append("")
            lines.append(t(s["company_details"], lang))
        lines.append("")
        lines.append(("🛠️ Environnement : " if L else "🛠️ Environment: ") + ", ".join(s["technologies"]))
        lines.append(("📊 Points clés : " if L else "📊 Highlights: ") + " · ".join(s["metrics"][lang]))
        return "\n".join(lines)

    # ---- réponses ciblées (entité + intention) ---------------------------------
    def answer_for(self, entity, lang, intents):
        t = self._t
        L = lang == "fr"
        kb = self.kb

        # Projet ou stage précis --------------------------------------------------
        proj = self._item("projects", entity) if entity in [p["id"] for p in kb["projects"]] else None
        stag = self._item("internships", entity) if entity in [s["id"] for s in kb["internships"]] else None

        if proj:
            name = t(proj["name"], lang)
            if intents and "description" not in intents:
                bits = []
                if "duration" in intents:
                    bits.append((f"Le projet « {name} » s'est déroulé sur la période : {t(proj['period'], lang)} "
                                 f"(durée : {t(proj['duration'], lang)}).") if L else
                                (f"The project “{name}” took place over: {t(proj['period'], lang)} "
                                 f"(duration: {t(proj['duration'], lang)})."))
                if "team" in intents:
                    team = ", ".join(proj["team"]) if proj.get("team") else ""
                    sup = ", ".join(proj["supervisors"]) if proj.get("supervisors") else ""
                    msg = (f"C'est un {t(proj['team_type'], lang).lower()}" if L
                           else f"It is a {t(proj['team_type'], lang).lower()}")
                    if team:
                        msg += (f", réalisé par : {team}" if L else f", carried out by: {team}")
                    if sup:
                        msg += (f". Encadrement : {sup}." if L else f". Supervised by: {sup}.")
                    bits.append(msg)
                if "technologies" in intents:
                    bits.append((f"Technologies utilisées : {', '.join(proj['technologies'])}.") if L
                                else (f"Technologies used: {', '.join(proj['technologies'])}."))
                if "metrics" in intents:
                    bits.append((f"Résultats obtenus : {' · '.join(proj['metrics']['fr'])}.") if L
                                else (f"Results achieved: {' · '.join(proj['metrics']['en'])}."))
                if "cv_status" in intents:
                    yes = proj["in_cv"]
                    bits.append((f"Oui, ce projet est spécifié dans le CV d'Issa." if yes else
                                 "Non, ce projet n'est pas spécifié dans le CV d'Issa — il figure dans son dossier de projets.") if L
                                else (f"Yes, this project is listed on Issa's CV." if yes else
                                      "No, this project is not listed on Issa's CV — it appears in his project folder."))
                if "company" in intents:
                    bits.append((f"« {name} » est un projet académique ({t(proj['context'], lang)}), pas un stage en entreprise.") if L
                                else (f"“{name}” is an academic project ({t(proj['context'], lang)}), not a company internship."))
                if bits:
                    return "\n\n".join(bits)
            return self.project_card(proj, lang, intents)

        if stag:
            if intents and "description" not in intents:
                bits = []
                if "duration" in intents:
                    bits.append((f"Ce stage chez {t(stag['company'], lang)} a duré {t(stag['duration'], lang)} "
                                 f"({t(stag['period'], lang)}).") if L else
                                (f"This internship at {t(stag['company'], lang)} lasted {t(stag['duration'], lang)} "
                                 f"({t(stag['period'], lang)})."))
                if "company" in intents:
                    bits.append(t(stag["company"], lang) + ". " + t(stag["company_details"], lang))
                if "technologies" in intents:
                    bits.append((f"Environnement : {', '.join(stag['technologies'])}.") if L
                                else (f"Environment: {', '.join(stag['technologies'])}."))
                if "metrics" in intents:
                    bits.append(" · ".join(stag["metrics"][lang]))
                if "cv_status" in intents:
                    bits.append(("Oui, ce stage est spécifié dans le CV d'Issa." if L
                                 else "Yes, this internship is listed on Issa's CV."))
                if bits:
                    return "\n\n".join(bits)
            return self.internship_card(stag, lang, intents)

        # Sections du profil ------------------------------------------------------
        if entity == "about":
            p = kb["profile"]
            head = (f"👋 **{p['name']}** — {t(p['title'], lang)}\n\n" +
                    t(p["summary"], lang) + "\n\n🎯 " + t(p["objective"], lang))
            return head

        if entity == "education":
            rows = [f"• {t(e['degree'], lang)} — {t(e['school'], lang)} ({t(e['period'], lang)})"
                    for e in kb["education"]]
            title = "🎓 **Parcours scolaire d'Issa :**\n" if L else "🎓 **Issa's educational background:**\n"
            return title + "\n".join(rows)

        if entity == "skills":
            out = ["🧠 **Compétences d'Issa (telles que listées dans ses CV) :**" if L
                   else "🧠 **Issa's skills (as listed on his CVs):**", ""]
            for key, cat in kb["skills"].items():
                out.append(f"**{t(cat['label'], lang)}** : " + ", ".join(cat["items"]))
            return "\n".join(out)

        if entity == "languages":
            rows = [f"• {t(l_['name'], lang)} : {t(l_['level'], lang)}" for l_ in kb["profile"]["languages_spoken"]]
            return ("🗣️ **Langues parlées :**\n" if L else "🗣️ **Spoken languages:**\n") + "\n".join(rows)

        if entity == "certifications":
            rows = [f"• {c['name']} — {t(c['issuer'], lang)} ({t(c['date'], lang)})" for c in kb["certifications"]]
            return ("📜 **Licences et certifications :**\n" if L else "📜 **Licenses and certifications:**\n") + "\n".join(rows)

        if entity == "extracurricular":
            rows = [f"• {t(x['role'], lang)} | {t(x['org'], lang)} ({t(x['date'], lang)}) — {t(x['description'], lang)}"
                    for x in kb["extracurricular"]]
            return ("🤝 **Activités parascolaires :**\n" if L else "🤝 **Extracurricular activities:**\n") + "\n".join(rows)

        if entity == "contact":
            c = kb["profile"]["contact"]
            return (("📫 **Contact :**\n• Email : {e}\n• Téléphone : {p}\n• Localisation : {l}\n• LinkedIn : {li}"
                     if L else
                     "📫 **Contact:**\n• Email: {e}\n• Phone: {p}\n• Location: {l}\n• LinkedIn: {li}")
                    .format(e=c["email"], p=c["phone"], l=t(c["location"], lang), li=c["linkedin"]))

        if entity == "objective":
            return "🎯 " + t(kb["profile"]["objective"], lang)

        if entity == "projects_list":
            rows = []
            for p in kb["projects"]:
                rows.append(f"• **{t(p['name'], lang)}** — {t(p['period'], lang)} · {t(p['team_type'], lang)}")
            tail = ("\n\n💡 Demandez-moi les détails d'un projet (équipe, durée, technologies, résultats) !" if L
                    else "\n\n💡 Ask me for the details of any project (team, duration, technologies, results)!")
            return (("🚀 **Les projets d'Issa :**\n" if L else "🚀 **Issa's projects:**\n") + "\n".join(rows) + tail)

        if entity == "internships_list":
            rows = []
            for s in kb["internships"]:
                rows.append(f"• **{t(s['title'], lang)}** — {t(s['company'], lang)} · {t(s['period'], lang)} ({t(s['duration'], lang)})")
            tail = ("\n\n💡 Demandez-moi les détails d'un stage (entreprise, durée, contenu) !" if L
                    else "\n\n💡 Ask me for the details of any internship (company, duration, content)!")
            return (("💼 **Les stages d'Issa :**\n" if L else "💼 **Issa's internships:**\n") + "\n".join(rows) + tail)

        return None

    # ---- étape 5 : point d'entrée public ----------------------------------------
    def reply(self, question: str) -> str:
        lang = detect_language(question)
        L = lang == "fr"
        norm_q = normalize(question)

        if not norm_q or norm_q in {"bonjour", "salut", "hello", "hi", "hey", "coucou"}:
            return self._greeting(lang)
        if any(w in norm_q for w in ("merci", "thank")):
            return ("Avec plaisir ! 😊 Autre chose sur le parcours d'Issa ?" if L
                    else "You're welcome! 😊 Anything else about Issa's background?")

        entities = self.find_entities(norm_q)
        intents = self.find_intents(norm_q)

        # Priorité aux sujets précis : si un projet ou un stage est identifié,
        # on écarte les sections génériques (« compétences », « profil »...)
        # qui n'auraient été déclenchées que par des mots ambigus
        # (« technologies », « tell me about »...).
        specific = {p["id"] for p in self.kb["projects"]} | {s["id"] for s in self.kb["internships"]}
        if any(e in specific for e in entities):
            entities = [e for e in entities if e in specific]

        # « ses projets » sans autre entité → liste ; « ses stages » → liste
        answers = []
        for ent in entities[:3]:  # au plus 3 sujets par réponse pour rester lisible
            a = self.answer_for(ent, lang, intents)
            if a:
                answers.append(a)
        if answers:
            return "\n\n———\n\n".join(answers)

        # Fallback : recouvrement lexical avec les descriptions de la base
        best = self._fuzzy_best(norm_q, lang)
        if best:
            return best

        return self._greeting(lang, fallback=True)

    def _fuzzy_best(self, norm_q, lang):
        """Score de recouvrement de tokens entre la question et chaque fiche."""
        qtok = set(norm_q.split())
        qtok -= {normalize(w) for w in FR_HINTS | EN_HINTS}
        if not qtok:
            return None
        best_score, best_answer = 0, None
        for p in self.kb["projects"]:
            blob = normalize(self._t(p["name"], lang) + " " + self._t(p["description"], lang)
                             + " " + " ".join(p["technologies"]))
            score = len(qtok & set(blob.split()))
            if score > best_score:
                best_score, best_answer = score, self.project_card(p, lang, [])
        for s in self.kb["internships"]:
            blob = normalize(self._t(s["title"], lang) + " " + self._t(s["description"], lang))
            score = len(qtok & set(blob.split()))
            if score > best_score:
                best_score, best_answer = score, self.internship_card(s, lang, [])
        return best_answer if best_score >= 2 else None

    def _greeting(self, lang, fallback=False):
        if lang == "fr":
            intro = ("Je n'ai pas trouvé cette information dans le dossier d'Issa. "
                     if fallback else "")
            return (f"{intro}🤖 Bonjour ! Je suis **ISSA**, l'assistant personnel d'Issa Lamkharbech. "
                    "Je connais en détail ses projets, ses stages, ses compétences et son parcours. "
                    "Essayez par exemple :\n"
                    "• « Qui est Issa ? »\n"
                    "• « Parle-moi du stage chez Capgemini »\n"
                    "• « Le projet drone était-il en groupe ? »\n"
                    "• « Quelles sont ses compétences en IA ? »\n"
                    "• « Quel est son parcours scolaire ? »")
        intro = ("I couldn't find that information in Issa's folder. " if fallback else "")
        return (f"{intro}🤖 Hello! I'm **ISSA**, Issa Lamkharbech's personal assistant. "
                "I know his projects, internships, skills and background in detail. "
                "Try for example:\n"
                "• “Who is Issa?”\n"
                "• “Tell me about the Capgemini internship”\n"
                "• “Was the drone project a group project?”\n"
                "• “What are his AI skills?”\n"
                "• “What is his educational background?”")


# ==============================================================================
# EXPORT VERS LE SITE WEB — régénère js/kb.js à partir de knowledge_base.json
# ==============================================================================
def export_kb_js():
    kb = load_kb()
    out_path = os.path.normpath(os.path.join(HERE, "..", "js", "kb.js"))
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as fh:
        fh.write("// Généré automatiquement par chatbot/jesus_chatbot.py --export\n")
        fh.write("// Source unique : chatbot/knowledge_base.json — NE PAS ÉDITER À LA MAIN.\n")
        fh.write("window.JESUS_KB = ")
        json.dump(kb, fh, ensure_ascii=False, indent=2)
        fh.write(";\n")
    print(f"OK -> {out_path}")


# ==============================================================================
# API REST optionnelle (FastAPI) : POST /chat {"message": "..."}
# ==============================================================================
def serve_api():
    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel
    import uvicorn

    bot = JesusChatbot()
    app = FastAPI(title="ISSA — chatbot d'Issa Lamkharbech")
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

    class Msg(BaseModel):
        message: str

    @app.post("/chat")
    def chat(m: Msg):
        return {"reply": bot.reply(m.message)}

    uvicorn.run(app, host="0.0.0.0", port=8000)


# ==============================================================================
# TESTS BILINGUES
# ==============================================================================
TEST_QUESTIONS = [
    "Qui est Issa ?",
    "Parle-moi du stage chez Capgemini",
    "Combien de temps a duré le stage chez JESA ?",
    "Le projet drone était-il en groupe ?",
    "Quelles technologies pour le jumeau numérique MiR100 ?",
    "Quelles sont ses compétences ?",
    "Quel est son parcours scolaire ?",
    "Quelles langues parle-t-il ?",
    "Ses certifications ?",
    "Comment le contacter ?",
    "Le projet des chats est-il dans son CV ?",
    "Who is Issa?",
    "Tell me about the JESA internship",
    "How long was the Capgemini internship?",
    "Was the multi-agent mapping project a group project?",
    "What are his skills in AI?",
    "What is his educational background?",
    "What are the results of the drone project?",
    "List his projects",
    "his internships?",
]


def run_tests():
    bot = JesusChatbot()
    for q in TEST_QUESTIONS:
        print("=" * 70)
        print("Q:", q)
        print("-" * 70)
        print(bot.reply(q))
        print()


# ==============================================================================
# CHAT CONSOLE
# ==============================================================================
def main():
    if "--export" in sys.argv:
        export_kb_js()
        return
    if "--api" in sys.argv:
        serve_api()
        return
    if "--test" in sys.argv:
        run_tests()
        return
    bot = JesusChatbot()
    print(bot._greeting("fr"))
    while True:
        try:
            q = input("\nVous > ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        if q.lower() in {"quit", "exit", "q"}:
            break
        print("\nISSA >", bot.reply(q))


if __name__ == "__main__":
    main()
