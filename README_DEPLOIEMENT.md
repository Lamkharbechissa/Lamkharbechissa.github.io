# 🚀 Guide de déploiement — Portfolio d'Issa Lamkharbech + chatbot Jesus

Le site est **100% statique** (HTML/CSS/JS, chatbot inclus) : il se déploie
gratuitement, sans serveur, et sera indexé par Google.

---

## 📁 Contenu du dossier

```
website_issa/
├── index.html              ← le site complet (SEO + JSON-LD inclus)
├── css/style.css           ← design blanc premium, animations
├── js/kb.js                ← base de connaissances (générée depuis le JSON)
├── js/jesus.js             ← moteur du chatbot Jesus (bilingue FR/EN)
├── js/main.js              ← animations + bilingue FR/EN du site
├── chatbot/
│   ├── jesus_chatbot.py    ← construction détaillée du chatbot (Python)
│   └── knowledge_base.json ← source unique de vérité (CV, projets, stages)
├── robots.txt              ← autorise l'indexation Google
├── sitemap.xml             ← plan du site pour Google
└── README_DEPLOIEMENT.md   ← ce guide
```

---

## ✅ Option recommandée : GitHub Pages (gratuit, ~10 minutes)

### Étape 1 — Créer un compte GitHub (si besoin)
https://github.com/signup — choisissez idéalement le pseudo **issa-lamkharbech**
(l'URL du site sera alors `https://lamkharbechissa.github.io/`, déjà configurée
dans les balises SEO du site).

### Étape 2 — Créer le dépôt
1. https://github.com/new
2. Nom du dépôt : **`lamkharbechissa.github.io`** (exactement : `Lamkharbechissa.github.io`)
3. Public → « Create repository »

### Étape 3 — Pousser le site (le dépôt git local est déjà prêt !)
Dans PowerShell, depuis ce dossier :

```powershell
cd "C:\Users\hp\Desktop\Develop_website_with_chatbot\website_issa"
git remote add origin https://github.com/Lamkharbechissa/Lamkharbechissa.github.io.git
git push -u origin main
```
(GitHub vous demandera de vous connecter la première fois.)

### Étape 4 — Activer GitHub Pages
Sur GitHub : dépôt → **Settings → Pages** → Source : `Deploy from a branch`,
branche `main`, dossier `/ (root)` → Save.
⏱ 2 à 3 minutes plus tard, le site est en ligne sur
`https://Lamkharbechissa.github.io/`.

> ⚠️ Si votre pseudo n'est pas `issa-lamkharbech`, remplacez l'URL dans :
> `index.html` (balises `canonical`, `og:url`, JSON-LD), `robots.txt` et `sitemap.xml`.

---

## ✝️ Jesus 2.0 — mode LLM conversationnel (RAG + Groq)

Jesus peut devenir un vrai chatbot conversationnel type ChatGPT (LLM distant
gratuit + RAG), strictement réservé au dossier d\'Issa. Suivez le guide dédié :
**GUIDE_JESUS_LLM.md** (clé Groq gratuite + worker Cloudflare gratuit).
Sans configuration, le moteur local instantané répond à sa place.

---

## 🔎 Être trouvé sur Google en tapant « Issa Lamkharbech »

Le site contient déjà tout ce que Google demande : titre et meta optimisés
« Issa Lamkharbech », données structurées JSON-LD de type *Person*,
`robots.txt`, `sitemap.xml`, contenu riche.

Pour accélérer l'indexation (sinon Google trouve le site seul en 1 à 4 semaines) :

1. **Google Search Console** : https://search.google.com/search-console
   → « Ajouter une propriété » → collez l'URL du site
   → validation automatique (via GitHub Pages, choisir la méthode « balise HTML » :
   copiez la balise `<meta name="google-site-verification" ...>` fournie dans le
   `<head>` de `index.html`, poussez, puis cliquez « Valider »).
2. Menu **Sitemaps** → soumettez `sitemap.xml`.
3. Menu **Inspection d'URL** → collez l'URL du site → « Demander une indexation ».
4. **Boostez le référencement** : ajoutez le lien du site sur votre profil
   **LinkedIn** (section Coordonnées + bannière), votre GitHub et vos CV.
   Les liens entrants accélèrent énormément l'indexation.

---

## 🔁 Mettre à jour le site plus tard

1. Modifiez `chatbot/knowledge_base.json` (nouveau projet, nouveau stage…)
2. Régénérez la base du site : `python chatbot/jesus_chatbot.py --export`
3. Poussez :
```powershell
git add -A
git commit -m "Mise à jour du contenu"
git push
```
Le site ET le chatbot Jesus sont mis à jour automatiquement (même source de données).

---

## 🧪 Tester en local

```powershell
cd "C:\Users\hp\Desktop\Develop_website_with_chatbot\website_issa"
python -m http.server 8765
# puis ouvrez http://localhost:8765
```

Chatbot en console : `python chatbot\jesus_chatbot.py`
Suite de tests bilingue : `python chatbot\jesus_chatbot.py --test`
API REST optionnelle : `python chatbot\jesus_chatbot.py --api`

---

## 🌐 Alternatives gratuites à GitHub Pages

- **Netlify** (https://app.netlify.com/drop) : glissez-déposez simplement le
  dossier `website_issa` — en ligne en 30 secondes (compte gratuit requis).
- **Vercel** (https://vercel.com) : import du dépôt GitHub en 2 clics.
- **Nom de domaine personnalisé** (optionnel, ~10 €/an) : `issa-lamkharbech.com`
  se configure dans Settings → Pages → Custom domain.
