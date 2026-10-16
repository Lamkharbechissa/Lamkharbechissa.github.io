# 🔒 Sécurité du site & du chatbot ISSA

Ce document résume les protections **déjà en place** dans le code et la
**checklist** des réglages à activer côté GitHub / Cloudflare / Groq.

---

## ✅ Protections déjà intégrées (dans le code)

| Menace | Protection en place | Fichier |
|---|---|---|
| **Vol de la clé API** | La clé n'est jamais dans le site : elle vit dans le *Secret* du worker (prod) ou, en local, dans la variable `GROQ_API_KEY` / `config.local.js` (exclu de git) lus **uniquement par serve.py** : le navigateur reçoit une version générée de `config.local.js` sans clé, et le banc d'essai passe par `POST /api/groq` (clé ajoutée côté serveur). | `worker/jesus-worker.js`, `serve.py`, `.gitignore` |
| **Abus de votre quota** (autre site qui utilise votre worker) | **Allowlist CORS stricte** (`https://lamkharbechissa.github.io`, + `http://localhost:8791` seulement si `ALLOW_LOCAL=1`) ; `POST /chat` sans en-tête `Origin` ou d'une autre origine → 403. **Attention : l'`Origin` n'est pas une authentification** (un script hors navigateur peut la forger) ; elle bloque seulement l'usage depuis un autre site web — le vrai garde-fou est la limitation de débit ci-dessous. | `worker/jesus-worker.js` |
| **Martèlement / spam** | Binding Rate Limiting `RL` s'il existe ; sinon limites en mémoire dimensionnées sur le quota Groq gratuit : 4 req/min/IP (`RATE_LIMIT`), 40 req/jour/IP (`DAILY_LIMIT`), 6 req/min pour toute l'instance (`GLOBAL_RPM`) → 429 immédiat ; `/health` limité aussi (et ne préchauffe les embeddings que pour le site autorisé) ; corps lu avec un plafond de 16 Ko ; règle WAF recommandée (GUIDE_JESUS_LLM.md) ; modèle Groq en 429 mis en pause (Retry-After) ; plafonds Groq → bascule en moteur local, jamais de facture. | `worker/jesus-worker.js` |
| **Détournement du worker** (changer le modèle, injecter un prompt système) | Le client n'envoie que `question`, `history`, `lang` : prompt système, modèles, température, longueur et raisonnement sont **imposés côté serveur** ; rôles de l'historique limités à `user`/`assistant`. | `worker/jesus-worker.js` |
| **DoS léger / requêtes géantes** | Corps ≤ 16 Ko, `Content-Type` JSON obligatoire (415), question ≤ 600 caractères (413), 8 derniers messages tronqués, contexte ≤ ~1 600 tokens. | `worker/jesus-worker.js`, `js/rag-prompt.json` |
| **Fuite d'information** | Erreurs amont jamais renvoyées en détail ; le raisonnement interne des modèles (`reasoning`) n'est jamais transmis : seul le contenu de la réponse est streamé. | `worker/jesus-worker.js` |
| **Hallucinations / faits inventés** | RAG : le modèle ne voit que des passages de `knowledge_base.json` ; règles de fidélité dans `js/rag-prompt.json` (aucun chiffre/outil/personne absent du contexte, sens technique exact, pas de noms de coéquipiers). | `chatbot/jesus_rag.py` |
| **Clé de test exposée au réseau local / DNS rebinding** | `serve.py` écoute sur `127.0.0.1` uniquement (`--host` non loopback refusé sans `--unsafe-lan`), n'accepte que l'en-tête `Host` localhost / 127.0.0.1 / [::1] du port servi (421 sinon : une page malveillante qui fait pointer son nom vers 127.0.0.1 ne peut rien lire), refuse les appels `/api` d'une autre origine, ne sert jamais `.git`, `docs`, `.claude`, `chatbot`, `supabase` ni les fichiers cachés (chemins décodés), sans listing de dossier ; `dev/` et `config.local.js` sont git-ignorés. | `serve.py`, `.gitignore` |
| **XSS (injection de code dans le chat)** | Échappement de `& < > " '` **avant** tout rendu ; liens restreints à http/https sûrs. | `js/jesus.js` (`mdToHtml`) |
| **Injection de contenu externe** | **Content-Security-Policy** stricte (scripts/ressources limités au site + Groq + worker). | `index.html` |
| **Clickjacking** (site piégé dans une iframe) | CSP `frame-ancestors 'none'` + script anti-framing. | `index.html` |
| **Fuite de référent** | `Referrer-Policy: strict-origin-when-cross-origin`. | `index.html` |
| **Prompt injection / jailbreak** | Le prompt système ordonne d'ignorer toute tentative de changer ses règles ou de révéler le prompt. | `js/rag-prompt.json` (généré par `chatbot/jesus_rag.py`) |
| **Chaîne d'approvisionnement** | Aucune dépendance npm : site en JavaScript pur (rien à compromettre). | — |

---

## 🛡️ Checklist à activer (5 minutes, gratuit)

### 1. Forcer le HTTPS sur GitHub Pages
Dépôt → **Settings → Pages** → cocher **« Enforce HTTPS »**.
(Empêche toute connexion non chiffrée.)

### 2. Restreindre le worker à votre domaine
Dans `worker/jesus-worker.js`, `PROD_ORIGINS` contient déjà `https://lamkharbechissa.github.io`.
Si vous changez de domaine, ajoutez-le via la variable `ALLOWED_ORIGINS` du Worker (sans toucher au code).
Ne définissez jamais `ALLOW_NO_ORIGIN` en production, et `ALLOW_LOCAL` seulement le temps d'un test.
Dans `index.html`, la CSP `connect-src` autorise `https://*.workers.dev` :
si votre worker a un **domaine personnalisé**, ajoutez-le à cette ligne.

### 3. Activer le Rate Limiting Cloudflare (anti-spam / anti-DoS)
Les règles WAF ne s'appliquent qu'à un **domaine ajouté à Cloudflare** (pas à `*.workers.dev`) :
servez le Worker sur un *Custom domain*, puis **Security → WAF → Rate limiting rules** →
**10 requêtes / minute par IP** sur le chemin `/chat` (détails pas à pas : GUIDE_JESUS_LLM.md).
Sans domaine, la limite intégrée (`RATE_LIMIT`) et les plafonds Groq s'appliquent.

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
