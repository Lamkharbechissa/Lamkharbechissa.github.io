# 🔒 Sécurité du site & du chatbot ISSA

Ce document résume les protections **déjà en place** dans le code et la
**checklist** des réglages à activer côté GitHub / Cloudflare / Groq.

---

## ✅ Protections déjà intégrées (dans le code)

| Menace | Protection en place | Fichier |
|---|---|---|
| **Vol de la clé API** | La clé n'est jamais dans le site : elle vit dans le *Secret* du worker (prod) ou dans `config.local.js` (local, exclu de git). | `worker/jesus-worker.js`, `.gitignore` |
| **Abus de votre quota** (autre site qui utilise votre worker) | **Allowlist d'origines** : le worker refuse (403) toute requête ne venant pas de votre domaine. | `worker/jesus-worker.js` |
| **Détournement du worker** (changer le modèle, injecter des paramètres) | Modèle, température, `max_tokens` **imposés côté serveur** ; seuls `role`/`content` sont acceptés du client. | `worker/jesus-worker.js` |
| **DoS léger / requêtes géantes** | Bornage du nombre de messages (24) et de la taille totale (24 000 caractères). | `worker/jesus-worker.js` |
| **Fuite d'information** | Les erreurs du service LLM ne sont pas renvoyées en détail au client. | `worker/jesus-worker.js` |
| **XSS (injection de code dans le chat)** | Échappement de `& < > " '` **avant** tout rendu ; liens restreints à http/https sûrs. | `js/jesus.js` (`mdToHtml`) |
| **Injection de contenu externe** | **Content-Security-Policy** stricte (scripts/ressources limités au site + Groq + worker). | `index.html` |
| **Clickjacking** (site piégé dans une iframe) | CSP `frame-ancestors 'none'` + script anti-framing. | `index.html` |
| **Fuite de référent** | `Referrer-Policy: strict-origin-when-cross-origin`. | `index.html` |
| **Prompt injection / jailbreak** | Le prompt système ordonne d'ignorer toute tentative de changer ses règles ou de révéler le prompt. | `js/rag.js`, `chatbot/jesus_rag.py` |
| **Chaîne d'approvisionnement** | Aucune dépendance npm : site en JavaScript pur (rien à compromettre). | — |

---

## 🛡️ Checklist à activer (5 minutes, gratuit)

### 1. Forcer le HTTPS sur GitHub Pages
Dépôt → **Settings → Pages** → cocher **« Enforce HTTPS »**.
(Empêche toute connexion non chiffrée.)

### 2. Restreindre le worker à votre domaine
Dans `worker/jesus-worker.js`, la liste `ALLOWED_ORIGINS` contient déjà
`https://lamkharbechissa.github.io`. Si vous changez de domaine, mettez-le à jour.
Dans `index.html`, la CSP `connect-src` autorise `https://*.workers.dev` :
si votre worker a un **domaine personnalisé**, ajoutez-le à cette ligne.

### 3. Activer le Rate Limiting Cloudflare (anti-spam / anti-DoS)
Dashboard Cloudflare → votre worker → **Security → WAF → Rate limiting rules**
→ créer une règle, ex. **30 requêtes / minute par IP** sur le chemin `/chat`.
(Gratuit, bloque automatiquement quelqu'un qui martèle le chatbot.)

### 4. 🔑 Régénérer la clé Groq (IMPORTANT)
La clé partagée pendant le développement doit être **révoquée puis recréée** :
console.groq.com → **API Keys** → supprimer l'ancienne → **Create API Key** →
mettre la nouvelle dans le *Secret* du worker (et dans `config.local.js` en local).

### 5. Ne jamais publier la clé
- `config.local.js` est **exclu de git** (`.gitignore`) : vérifiez avec
  `git status` qu'il n'apparaît **jamais** avant un `git push`.
- Ne remplissez **jamais** `groqApiKey` dans `js/config.js` (ce fichier, lui,
  est publié). En production, seul le worker connaît la clé.

### 6. (Optionnel) Alertes GitHub
Dépôt → **Settings → Code security** → activer **Secret scanning** :
GitHub vous alerte si une clé se retrouve par erreur dans le code.

---

## 🧪 Vérifier la sécurité après mise en ligne

- **Clé introuvable** : ouvrez le site en ligne → F12 → onglet *Sources* →
  la clé Groq ne doit apparaître **nulle part**.
- **CORS actif** : depuis un autre site, un appel à votre worker doit renvoyer
  **403 Origine non autorisée**.
- **HTTPS** : le cadenas 🔒 doit être présent dans la barre d'adresse.
- **En-têtes** : testez l'URL sur https://securityheaders.com (note visée : A).
- **CSP** : la console (F12) ne doit pas afficher d'erreur CSP en usage normal.

---

## 📌 Rappel important sur le modèle de menace

C'est un **site vitrine statique** : il n'y a **ni base de données, ni compte
utilisateur, ni données personnelles stockées** côté visiteur. La surface
d'attaque est donc minime. Les deux seuls vrais risques — **fuite de la clé API**
et **abus du worker** — sont couverts par les protections ci-dessus.
