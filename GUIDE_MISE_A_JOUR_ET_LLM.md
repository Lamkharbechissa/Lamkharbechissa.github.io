# 📘 Guide — Mettre à jour le site & activer le mode LLM en ligne

Ce guide couvre deux choses :
1. **Mettre à jour le site + le chatbot** (contenu, projets, corrections) et publier en ligne.
2. **Activer le vrai mode LLM (ChatGPT-like) en ligne** via le proxy Cloudflare Worker.

---

## 1) 🔄 Mettre à jour le site et le chatbot

Le site et le chatbot partagent **une seule source de données** :
`chatbot/knowledge_base.json`. On modifie ce fichier, on régénère, on pousse.
GitHub Pages reconstruit le site **automatiquement** (~1–2 min).

### Étape par étape

**1. Modifier le contenu**
Ouvrez `chatbot/knowledge_base.json` et modifiez ce que vous voulez
(nouveau projet, nouveau stage, nouvelle compétence, contact…).
👉 Toujours en **bilingue** : chaque texte a une clé `"fr"` et une clé `"en"`.

**2. Régénérer la base du site (`js/kb.js`)**
Dans PowerShell, depuis le dossier `website_issa` :
```powershell
python chatbot/jesus_chatbot.py --export
```
Cela réécrit `js/kb.js` à partir du JSON. Le site **et** le chatbot sont alors à jour.

**3. (Recommandé) Forcer le rechargement chez les visiteurs**
Dans `index.html`, augmentez le numéro de version des fichiers (cache-busting) :
remplacez tous les `?v=18` par `?v=19` (puis `?v=20` la fois suivante, etc.).
> Astuce PowerShell rapide :
> ```powershell
> (Get-Content index.html -Raw).Replace('?v=18','?v=19') | Set-Content index.html -Encoding UTF8
> ```

**4. Publier en ligne (automatique)**
```powershell
git add -A
git commit -m "Mise a jour du contenu"
git push
```
✅ C'est tout. GitHub Pages redéploie seul. Rafraîchissez le site après 1–2 min.

### Tester en local AVANT de publier (optionnel mais conseillé)
```powershell
python -m http.server 8765
# puis ouvrez http://localhost:8765
```

---

## 2) 🧠 Activer le mode LLM (ChatGPT-like) EN LIGNE — Cloudflare Worker

> **Pourquoi un worker ?** Le site est public : on ne peut PAS y mettre la clé API
> (tout le monde la verrait et pourrait l'utiliser). Le worker Cloudflare garde la
> clé **secrète côté serveur** et n'autorise que **votre** site à l'appeler.
> Sans worker, le site en ligne utilise le **moteur local** (déjà complet) ;
> avec le worker, ISSA devient **conversationnel** (Llama 3.3 70B).

C'est **gratuit** (100 000 requêtes/jour). Compter ~10 minutes.

### Étape 1 — Récupérer une clé Groq (gratuite)
1. Allez sur <https://console.groq.com> → connectez-vous.
2. **API Keys** → **Create API Key** → copiez la clé (commence par `gsk_...`).
   *(Vous avez déjà une clé `gsk_...` : vous pouvez la réutiliser.)*

### Étape 2 — Créer le worker
1. Allez sur <https://dash.cloudflare.com> → créez un compte gratuit si besoin.
2. **Workers & Pages** → **Create** → **Create Worker**.
3. Donnez un nom, ex. `issa-llm` → **Deploy** (un worker d'exemple est créé).
4. Cliquez **Edit code** : **effacez tout** et **collez le contenu** du fichier
   `worker/jesus-worker.js` (de ce dossier) → **Deploy**.

### Étape 3 — Mettre la clé en SECRET (jamais dans le code)
1. Dans le worker : **Settings** → **Variables and Secrets**.
2. **Add** → type **Secret** :
   - Nom : `GROQ_API_KEY`
   - Valeur : votre clé `gsk_...`
3. *(Optionnel)* Ajoutez une variable `MODEL` = `llama-3.3-70b-versatile`.
4. **Save and deploy**.

### Étape 4 — Vérifier l'allowlist (déjà bonne)
Dans `worker/jesus-worker.js`, la liste `ALLOWED_ORIGINS` autorise déjà
`https://lamkharbechissa.github.io` (votre site) + localhost. Rien à changer.
Si un jour vous mettez un domaine perso, ajoutez-le ici.

### Étape 5 — Brancher le site sur le worker
1. Copiez l'URL de votre worker (ex. `https://issa-llm.VOTRE-SOUS-DOMAINE.workers.dev`).
2. Ouvrez `js/config.js` et renseignez **uniquement** `apiUrl` :
   ```js
   window.JESUS_CONFIG = {
     apiUrl: "https://issa-llm.VOTRE-SOUS-DOMAINE.workers.dev",  // ← votre worker
     groqApiKey: "",   // ← LAISSER VIDE sur le site publié (sécurité)
     ...
   };
   ```
   ⚠️ **Ne mettez JAMAIS la clé `gsk_...` dans `groqApiKey`** sur le site publié :
   elle serait visible par tous. En production, seul `apiUrl` (le worker) est utilisé.

### Étape 6 — Publier
```powershell
git add js/config.js
git commit -m "Activation du mode LLM via worker Cloudflare"
git push
```
Après 1–2 min, ISSA répond **en mode conversationnel** sur le site en ligne. 🎉
En cas de souci (worker down, quota), il **repli automatiquement** sur le moteur local :
le visiteur a toujours une réponse.

### (Bonus sécurité) Limiter le débit
Dashboard Cloudflare → votre worker → **Security / WAF → Rate limiting rules**
→ créez une règle (ex. 30 requêtes/min par IP). Gratuit, anti-abus.

---

## 🧪 Tester le mode LLM SANS rien déployer (juste sur votre PC)
Dans le chat du site (en local ou en ligne, sur **votre** navigateur uniquement),
tapez :
```
/key gsk_votre_cle
```
ISSA passe en mode LLM sur **ce navigateur seulement** (la clé reste stockée
localement, jamais publiée). Pour revenir au moteur local : `/key off`.
> Pratique pour tester, mais pour que **tous** les visiteurs aient le mode LLM,
> il faut le worker (partie 2).

---

## 📌 Mémo express
| Action | Commande / geste |
|---|---|
| Modifier le contenu | éditer `chatbot/knowledge_base.json` (fr + en) |
| Régénérer le site | `python chatbot/jesus_chatbot.py --export` |
| Forcer le rechargement | `?v=N` → `?v=N+1` dans `index.html` |
| Publier | `git add -A && git commit -m "..." && git push` |
| Délai de mise en ligne | ~1–2 min (GitHub Pages, automatique) |
| Activer LLM en ligne | worker Cloudflare + `apiUrl` dans `js/config.js` |
| Tester LLM sur mon PC | `/key gsk_...` dans le chat (`/key off` pour stopper) |
