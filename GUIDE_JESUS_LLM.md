# ISSA — Activer le mode conversationnel (RAG hybride + Groq, coût zéro)

ISSA fonctionne en **deux modes**, avec bascule automatique :

| Mode | Quand ? | Comportement |
|---|---|---|
| **LLM + RAG** | le relais (Worker Cloudflare en ligne, `serve.py` en local) répond | Conversation libre façon entretien d'embauche : ISSA répond **à la première personne au nom d'Issa**, résume ou approfondit, varie ses formulations, adapte la longueur — mais **uniquement avec les faits de `knowledge_base.json`** |
| **Local** (filet de sécurité) | relais absent, quota Groq atteint (HTTP 429), panne (502/503) | Moteur à règles instantané dans le navigateur (`js/jesus.js`) |

## Architecture

```
knowledge_base.json ──python chatbot/jesus_rag.py --export-assets──▶ js/rag-chunks.json  (98 passages + alias)
                                                                      js/rag-prompt.json  (prompt FR/EN, style, réglages)
Visiteur ─▶ site (GitHub Pages) ─POST /chat─▶ Worker Cloudflare
                                               ├─ lit rag-chunks.json / rag-prompt.json sur le site publié
                                               ├─ retrieval HYBRIDE : BM25 + embeddings @cf/baai/bge-m3 (Workers AI)
                                               │   fusion RRF + boost d'entités + indices thématiques, 3 à 6 passages
                                               └─ Groq en cascade : gpt-oss-120b → gpt-oss-20b → qwen3.8-27b
          ◀── flux SSE (meta + texte, jamais le raisonnement) ──┘
          (échec 429/502/503 → moteur local)
```

- **Une seule source de texte** : le prompt et ses règles de style sont dans `js/rag-prompt.json`,
  générés par `chatbot/jesus_rag.py`. Le Worker et le relais local ne contiennent aucun texte de prompt.
- **Mettre à jour le contenu** : éditer `chatbot/knowledge_base.json` →
  `python chatbot/jesus_chatbot.py --export` (régénère `js/kb.js` **et** les deux fichiers RAG) → `git push`.
  Le Worker relit les fichiers publiés toutes les 5 minutes (et recalcule les embeddings si les passages ont changé).
  **Pas besoin de redéployer le Worker** pour un changement de contenu ou de prompt.

---

## Étape 1 — Clé API Groq (gratuite, sans carte bancaire)

1. Ouvrez https://console.groq.com → **Sign up / Log in**.
2. Menu de gauche **API Keys** → **Create API Key** → nom : `issa-worker` → **Submit**.
3. Copiez la clé `gsk_...` (elle n'est affichée qu'une fois). Ne la collez **jamais** dans un fichier du site.

## Étape 2 — Créer le Worker (dashboard Cloudflare, sans Node ni wrangler)

1. Ouvrez https://dash.cloudflare.com → créez un compte gratuit / connectez-vous.
2. Menu de gauche **Compute (Workers) → Workers & Pages** → bouton **Create** (« Créer »).
3. Choisissez **Start with Hello World!** (ou « Create Worker ») → nom : `issa-llm` → **Deploy**.
4. Sur la page de confirmation, cliquez **Edit code** (« Modifier le code »).
5. Dans l'éditeur, sélectionnez tout le code d'exemple (Ctrl+A) et supprimez-le.
6. Ouvrez `worker/jesus-worker.js` sur votre PC (Bloc-notes / VS Code), copiez **tout** (Ctrl+A, Ctrl+C),
   collez-le dans l'éditeur Cloudflare (Ctrl+V).
7. Cliquez **Deploy** (en haut à droite) → confirmez. Notez l'URL affichée, par exemple
   `https://issa-llm.VOTRE-SOUS-DOMAINE.workers.dev`.

## Étape 3 — Binding Workers AI (embeddings obligatoires)

1. Revenez sur la page du Worker (`issa-llm`) → onglet **Settings** (« Paramètres »).
2. Section **Bindings** → **Add** (« Ajouter ») → choisissez **Workers AI**.
3. **Variable name** : `AI` (exactement, en majuscules) → **Deploy** / **Save**.

> Sans ce binding, le Worker fonctionne quand même mais en **BM25 seul** (`"retrieval": "bm25"` dans `/health`
> et dans les réponses). Avec : retrieval hybride (`"hybrid"`).

### Étape 3 bis — Binding KV `EMB` (fortement recommandé, gratuit)

Les vecteurs des passages (~800 Ko) doivent survivre aux redémarrages du Worker : sur `*.workers.dev`,
`caches.default` ne fonctionne pas, et sans KV chaque nouvelle instance recalculerait tous les embeddings.

1. Dashboard Cloudflare → **Storage & Databases → KV → Create** → nom : `issa-emb` → **Add**.
2. Page du Worker → **Settings → Bindings → Add → KV namespace** → **Variable name** : `EMB`,
   **KV namespace** : `issa-emb` → **Deploy**.

Le Worker y range aussi les « pauses » des modèles Groq après un 429 (quota atteint), partagées entre instances.
Usage : une écriture par version des passages, très en dessous des limites gratuites de KV.

### Étape 3 ter — Binding Rate Limiting `RL` (optionnel)

Si votre compte propose **Settings → Bindings → Add → Rate limiting**, créez-en un nommé `RL`
(par exemple 4 requêtes par 60 s). Le Worker l'utilise en priorité pour limiter `/chat` par IP ;
sans lui, il applique ses limites en mémoire (étape 5).

## Étape 4 — Secret GROQ_API_KEY

1. Toujours dans **Settings** → section **Variables and Secrets** → **Add**.
2. **Type** : `Secret` · **Variable name** : `GROQ_API_KEY` · **Value** : la clé `gsk_...` de l'étape 1.
3. **Deploy** / **Save**. (Un secret n'est plus jamais lisible, même par vous : c'est voulu.)

## Étape 5 — Variables optionnelles (même section, Type « Text »)

| Nom | Valeur par défaut | Rôle |
|---|---|---|
| `MODELS` | `openai/gpt-oss-120b,openai/gpt-oss-20b,qwen/qwen3.8-27b` | cascade de modèles Groq (ordre d'essai) |
| `RATE_LIMIT` | `4` | requêtes par minute et par IP sur `/chat` (mémoire du Worker, best effort) |
| `DAILY_LIMIT` | `40` | requêtes par jour et par IP sur `/chat` |
| `GLOBAL_RPM` | `6` | requêtes par minute pour toute l'instance (au-delà : 429 immédiat, le site répond en local au lieu d'épuiser les quotas Groq) |
| `ALLOW_LOCAL` | *(vide)* | `1` = autorise aussi `http://localhost:8791` (tester le Worker depuis le site local) |
| `ALLOWED_ORIGINS` | *(vide)* | domaines supplémentaires séparés par des virgules (ex. un futur nom de domaine) |
| `CHUNKS_URL` / `PROMPT_URL` | fichiers de `https://lamkharbechissa.github.io/js/` | autre emplacement des données RAG |

Ne créez **pas** `ALLOW_NO_ORIGIN` en production (réservé au banc d'essai local).

> Pourquoi ces limites basses ? Une question coûte ~2 500 à 3 500 tokens (prompt ~600, passages ≤ ~1 100
> estimés, historique ≤ 1 600 caractères, réponse 450 ou 600 tokens + raisonnement) ; or l'offre gratuite de Groq
> donne, **par modèle**, 8 000 tokens/minute et environ 200 000 tokens/jour (la vraie limite journalière de
> gpt-oss-120b, bien avant les 1 000 requêtes/jour). Un seul visiteur trop rapide pourrait sinon faire basculer
> tout le monde en mode hors ligne.

## Étape 6 — Tester le Worker

1. Dans le navigateur, ouvrez `https://issa-llm.VOTRE-SOUS-DOMAINE.workers.dev/health`.
2. Réponse attendue (la 1re fois `"embedded"` peut être `false` ; rechargez après ~10 s) :
   ```json
   {"ok":true,"chunks":98,"embedded":true,"embedModel":"@cf/baai/bge-m3",
    "models":["openai/gpt-oss-120b","openai/gpt-oss-20b","qwen/qwen3.8-27b"],"version":"…","groqKey":true}
   ```
   - `groqKey:false` → le secret de l'étape 4 manque ou est mal nommé.
   - `embedModel:null` → le binding `AI` de l'étape 3 manque.
   - `ok:false` / 503 → le site n'est pas encore publié avec `js/rag-chunks.json` et `js/rag-prompt.json`
     (faites d'abord l'étape 7, `git push`).
3. Un `POST /chat` envoyé depuis une autre origine (ou sans `Origin`) doit répondre **403** : c'est normal.
   (Ce contrôle d'`Origin` empêche un autre site d'utiliser votre quota depuis le navigateur de ses visiteurs,
   mais un script peut forger cet en-tête : ce n'est pas une authentification — d'où les limites de l'étape 5.)

## Étape 7 — Brancher le site

1. Dans `js/config.js`, mettez l'URL du Worker (sans `/` final) dans `apiUrl` ; `groqApiKey` reste **vide** :
   ```js
   apiUrl: "https://issa-llm.VOTRE-SOUS-DOMAINE.workers.dev",
   groqApiKey: "",
   ```
2. Publiez :
   ```powershell
   cd "C:\Users\hp\Desktop\My_Projects\website_issa"
   git status          # js/config.local.js et dev/ ne doivent PAS apparaître
   git add -A
   git commit -m "ISSA : relais LLM + RAG hybride"
   git push
   ```
3. Après 1 à 2 minutes, ouvrez le site, posez une question à ISSA : la réponse arrive en streaming.
4. **Resserrez la CSP** : dans `index.html` (balise `Content-Security-Policy`) **et** dans `_headers`,
   remplacez `https://*.workers.dev` dans `connect-src` par l'origine exacte du Worker, par exemple
   `https://issa-llm.VOTRE-SOUS-DOMAINE.workers.dev` (ou votre domaine personnalisé), puis republiez.
   Le navigateur n'appelle plus jamais `api.groq.com` (déjà retiré de la CSP).

---

## Tester en local (avant de publier)

`run.bat` (double-clic) : régénère `kb.js` + les fichiers RAG, puis lance `serve.py`, qui sert le site **et**
un relais identique au Worker sur `http://localhost:8791/api` (port suivant si occupé).

- Clé de test : variable d'environnement `GROQ_API_KEY`, sinon `js/config.local.js` (git-ignoré) :
  `groqApiKey` = votre clé et `apiUrl: "/api"`. La clé n'est lue **que par serve.py** : le navigateur reçoit
  à la place une version générée de `config.local.js` qui ne contient que `apiUrl = "/api"`.
- serve.py n'écoute que sur 127.0.0.1, refuse un en-tête `Host` autre que localhost / 127.0.0.1 (anti DNS
  rebinding) et ne sert jamais `.git`, `docs`, `.claude`, `chatbot`, `supabase` ni les fichiers cachés.
- Embeddings locaux : Ollama + `nomic-embed-text` (`ollama pull nomic-embed-text`). Vecteurs des passages
  mis en cache dans `dev/.emb_cache.json` (1er calcul ~3 min sur ce PC, ensuite instantané). Sans Ollama → BM25 seul.
  Pour tester avec le **modèle de production** : `ollama pull bge-m3`, puis lancez serve.py avec la variable
  `OLLAMA_EMBED_MODEL=bge-m3` (pas de préfixes nomic pour ce modèle). Les scores obtenus avec nomic
  (anglocentré, poids dense réduit pour le français) ne prédisent pas ceux de la production.
- Santé du relais : `http://localhost:8791/api/health`.
- Banc d'essai du Worker (le vrai `worker/jesus-worker.js`, exécuté dans le navigateur avec de vrais
  embeddings ; ses appels Groq passent par `POST /api/groq`, où serve.py ajoute la clé côté serveur) :
  `http://localhost:8791/dev/worker_harness.html` → **Tout lancer** (tests unitaires, parité Python/Worker,
  6 conversations).
- Outils : `python chatbot/jesus_rag.py --test-retrieval` (tests hors ligne),
  `--eval-retrieval` (BM25 vs hybride : jeu de réglage de 62 questions + jeu tenu à l'écart de 50 questions
  + 10 changements de sujet), `--retrieval "question"`, et sans option : chat console.

---

## Limites de l'offre gratuite (et ce qui se passe quand on les atteint)

| Service | Limite gratuite | Conséquence pour ISSA |
|---|---|---|
| **Groq** (par modèle) | ~8 000 tokens/minute, ~200 000 tokens/jour, ~1 000 requêtes/jour | une réponse coûte ~2 500 à 3 500 tokens → ~2 réponses/minute et ~60 à 80 réponses/jour **par modèle** ; au 1er 429 le relais met ce modèle en pause (durée `Retry-After` de Groq, mémorisée) et passe au suivant ; si les 3 sont saturés → 429 → le site répond avec le moteur local |
| **Cloudflare Workers** | 100 000 requêtes/jour, 10 ms de CPU par requête | largement suffisant (le streaming n'use pas de CPU ; vecteurs en cache binaire) |
| **Workers AI** | 10 000 « neurons »/jour | embeddings bge-m3 : ~65 neurons pour tous les passages (1 fois par version), quasi rien par question |

Le prompt + contexte restent compacts (≈ 600 tokens de règles, ≤ ~1 100 tokens estimés de passages,
historique borné à 8 messages et 1 600 caractères, réponse 450 tokens — 600 pour « approfondis / résume »)
pour tenir dans ces limites. Délais : une seule échéance de 10 s pour le premier mot (retrieval + cascade,
6 s au plus par modèle) ; le navigateur attend 13 s avant de répondre en mode local.

## Règle WAF de limitation de débit (recommandée)

La limite par IP intégrée au Worker est « best effort » (chaque instance a sa propre mémoire). Pour une vraie
limite, il faut que le Worker soit servi sur **un domaine ajouté à Cloudflare** (route ou *Custom domain* ;
les règles WAF ne s'appliquent pas à `*.workers.dev`) :

1. Worker → **Settings → Domains & Routes → Add → Custom domain** (ex. `issa-api.votre-domaine.fr`).
2. Dashboard du domaine → **Security → WAF → Rate limiting rules → Create rule**.
3. *If incoming requests match* : `URI Path` `equals` `/chat` ; *With the same characteristics* : `IP` ;
   *When rate exceeds* : `10` requêtes par `1 minute` ; *Then* : `Block` pendant `1 minute` → **Deploy**.
4. Mettez la nouvelle URL dans `apiUrl` et ajoutez le domaine à `connect-src` (CSP).

Sans domaine, gardez `RATE_LIMIT` bas (4 par défaut) : les plafonds Groq font de toute façon office de garde-fou de coût
(le service est gratuit : un abus ne peut pas vous facturer, il ne peut que faire basculer ISSA en mode local).
