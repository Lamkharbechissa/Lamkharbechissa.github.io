# ✝️ Jesus 2.0 — Activer le mode LLM conversationnel (RAG + Groq, coût zéro)

Jesus fonctionne désormais en **deux modes**, avec bascule automatique :

| Mode | Quand ? | Comportement |
|---|---|---|
| **LLM + RAG** (recommandé) | dès que l'API est configurée | Conversationnel comme ChatGPT, multi-tours, bilingue, réponses naturelles — mais **strictement limité au dossier d'Issa** grâce au RAG |
| **Local** (filet de sécurité) | API non configurée, hors-ligne, quota atteint | Moteur instantané intégré au navigateur (celui de `chatbot/jesus_chatbot.py`) |

Architecture (fichiers déjà écrits et testés) :

```
Visiteur → js/rag.js  (RAG : chunking + BM25 + entités → top-5 passages)
         → prompt ancré (« réponds UNIQUEMENT avec le contexte »)
         → worker/jesus-worker.js  (Cloudflare, gratuit — cache la clé API)
         → API Groq  (Llama 3.3 70B, gratuit, ~300 tokens/seconde)
         → réponse en streaming dans le widget
   (échec ? → repli automatique sur le moteur local js/jesus.js)
```

Le pipeline de référence complet et documenté : `chatbot/jesus_rag.py`
(chunking → BM25 → retrieval hybride avec option embeddings sémantiques →
prompt → génération streaming). Tests : `python chatbot/jesus_rag.py --test-retrieval`
(10/10 réussis).

---

## Étape 1 — Clé API Groq (gratuite, 2 minutes, sans carte bancaire)

1. https://console.groq.com → « Sign up » (compte Google ou email).
2. Menu **API Keys** → **Create API Key** → copiez la clé `gsk_...`.

> Niveau gratuit Groq : largement suffisant pour un portfolio
> (des milliers de requêtes/jour). Llama 3.3 70B y répond plus vite
> que ChatGPT.

### Tester immédiatement en console (avant même le déploiement)

```powershell
cd "C:\Users\hp\Desktop\Develop_website_with_chatbot\website_issa\chatbot"
set GROQ_API_KEY=gsk_votre_cle
python jesus_rag.py
```

### Tester dans le navigateur en local (optionnel)

Dans `js/config.js`, mettez votre clé dans `groqApiKey`, ouvrez le site en
local, discutez avec Jesus… **puis videz le champ avant tout `git push`**
(une clé publiée sur GitHub est visible par tous et sera automatiquement
révoquée par Groq).

---

## Étape 2 — Déployer le proxy Cloudflare Worker (gratuit, 5 minutes)

Le worker garde votre clé **secrète côté serveur** — c'est la seule façon
propre d'avoir un LLM sur un site 100% statique et gratuit.

1. https://dash.cloudflare.com → créez un compte gratuit.
2. **Workers & Pages → Create → Worker** → nommez-le `jesus-llm` → Deploy.
3. Cliquez **Edit code** → supprimez le code d'exemple → collez tout le
   contenu de `worker/jesus-worker.js` → **Deploy**.
4. Revenez au worker → **Settings → Variables and Secrets → Add** :
   - Type : **Secret** · Nom : `GROQ_API_KEY` · Valeur : votre clé `gsk_...`
5. Copiez l'URL du worker, par ex. `https://jesus-llm.issa.workers.dev`.

> Niveau gratuit Cloudflare : 100 000 requêtes/jour. Coût total : 0 €.

---

## Étape 3 — Brancher le site

Dans `js/config.js` :

```js
window.JESUS_CONFIG = {
  apiUrl: "https://jesus-llm.VOTRE-SOUS-DOMAINE.workers.dev",  // ← votre URL
  groqApiKey: "",            // ← toujours vide en production !
  model: "llama-3.3-70b-versatile",
  ...
};
```

Puis :

```powershell
cd "C:\Users\hp\Desktop\Develop_website_with_chatbot\website_issa"
git add -A
git commit -m "Activation du mode LLM de Jesus"
git push
```

C'est tout : Jesus devient conversationnel sur le site publié. 🎉

---

## Sécurité & fidélité — ce qui est déjà en place

- **Clé API jamais exposée** : elle vit uniquement dans le Secret du worker.
- **Anti-abus** : le worker borne la taille des requêtes, impose le modèle et
  la température côté serveur ; vous pouvez restreindre le CORS à votre
  domaine dans `worker/jesus-worker.js` (`Access-Control-Allow-Origin`).
- **Fidélité totale** : le prompt système interdit toute invention et tout
  sujet hors « accomplissements d'Issa » ; le LLM ne voit QUE les passages
  retrouvés dans `knowledge_base.json` (votre dossier).
- **Toujours disponible** : si Groq ou Cloudflare sont injoignables, le
  moteur local répond instantanément à la place — le visiteur n'est jamais
  face à un chat muet.

## Mise à jour du contenu

Éditez `chatbot/knowledge_base.json` → `python chatbot/jesus_chatbot.py --export`
→ `git push`. Le site, le RAG et le moteur local sont synchronisés
automatiquement (source unique de vérité).
