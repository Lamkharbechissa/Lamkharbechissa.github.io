# 💾 Historique des conversations + console admin (Supabase — gratuit)

ISSA peut **mémoriser les conversations** : chaque visiteur retrouve et
**continue** ses échanges, et **vous (admin)** consultez toutes les
conversations. Modèle **anonyme strict** : aucun email ni donnée personnelle —
chaque visiteur est juste un identifiant anonyme (UUID) mémorisé sur son
navigateur.

> Tant que ce n'est pas configuré, le chat fonctionne normalement (sans
> historique) : les boutons d'historique restent simplement masqués.

---

## Activation en 3 étapes (~10 minutes, 0 €)

### Étape 1 — Créer un projet Supabase (gratuit)
1. https://supabase.com → **Start your project** → connexion (GitHub ou email).
2. **New project** : donnez un nom (ex. `issa-portfolio`), un mot de passe de
   base (gardez-le), une région proche (ex. *West EU*). Attendez ~2 min.

### Étape 2 — Créer les tables (copier-coller)
1. Dans Supabase : menu **SQL Editor** → **New query**.
2. Ouvrez le fichier [`supabase/schema.sql`](supabase/schema.sql) de ce projet,
   copiez **tout** son contenu, collez-le, puis **Run**.
   ➜ Crée les tables `conversations` et `messages` avec la sécurité (RLS).
3. Activez la connexion anonyme : menu **Authentication → Providers → Anonymous**
   → **Enable** (bascule sur ON) → Save.

### Étape 3 — Brancher le site
1. Dans Supabase : **Project Settings → API**. Copiez :
   - **Project URL** (ex. `https://abcdefgh.supabase.co`)
   - la clé **anon public** (une longue chaîne).
2. Ouvrez [`js/config.js`](js/config.js) et remplissez :
   ```js
   supabaseUrl: "https://abcdefgh.supabase.co",
   supabaseAnonKey: "eyJhbGciOi...votre_cle_anon_public...",
   ```
   > Ces deux valeurs sont **publiques par conception** : sans danger dans le
   > code publié. La sécurité vient de la *Row Level Security* (un visiteur ne
   > peut lire QUE ses propres conversations).
3. Poussez :
   ```powershell
   cd "C:\Users\hp\Desktop\Develop_website_with_chatbot\website_issa"
   git add -A
   git commit -m "Activation de l'historique des conversations"
   git push
   ```

C'est fait ✅ — les boutons **🕑 Historique** et **✚ Nouvelle conversation**
apparaissent dans le chat. Chaque visiteur retrouve ses conversations sur son
navigateur et peut les reprendre là où il les avait laissées.

---

## 👑 Console admin : consulter les conversations

Votre tableau de bord Supabase **EST** la console admin (rien à coder) :

- **Table Editor → `conversations`** : toutes les conversations, avec le
  `user_id` (identifiant anonyme du visiteur), le titre et la date.
- **Table Editor → `messages`** : le contenu complet, message par message.
- **SQL Editor** pour des vues synthétiques, par exemple :
  ```sql
  select c.user_id, c.title, c.updated_at, count(m.*) as nb_messages
  from conversations c
  left join messages m on m.conversation_id = c.id
  group by c.id
  order by c.updated_at desc;
  ```

> « Savoir qui » : en mode anonyme strict, vous identifiez chaque visiteur par
> son **UUID anonyme** et voyez tout le contenu de ses échanges — mais pas son
> nom/email (aucune donnée personnelle n'est collectée, conforme RGPD par
> défaut). Si un jour vous voulez capturer un prénom/email, dites-le-moi : on
> ajoute un petit champ optionnel « Laissez vos coordonnées ».

---

## 🔒 Sécurité & vie privée

- **Row Level Security activée** : un visiteur ne peut jamais lire les
  conversations d'un autre (la clé `anon public` ne donne accès qu'aux données
  du visiteur connecté).
- **Aucune donnée personnelle** stockée (anonyme strict) → conforme RGPD par
  conception. Pensez tout de même à ajouter une courte mention « Vos échanges
  avec l'assistant sont enregistrés de façon anonyme pour améliorer le service »
  si vous le souhaitez (je peux l'ajouter).
- La `connect-src` de la CSP autorise déjà `*.supabase.co` (voir `index.html`).
- **Purge** : pour tout effacer, `Table Editor` → sélectionner → supprimer, ou
  en SQL `delete from conversations;` (les messages sont supprimés en cascade).

---

## 🧩 Comment ça marche (résumé technique — pour votre CV)

```
Visiteur ──(auth anonyme)──► Supabase Auth  →  UUID anonyme (localStorage)
   │
   ├─ chaque message (user + ISSA) ─► table `messages` (RLS: user_id = auth.uid())
   ├─ conversations listées ─────────► table `conversations`
   └─ réouverture ───────────────────► recharge les messages + restaure la
                                        mémoire du LLM (continuité du dialogue)
Admin (Issa) ─► Dashboard Supabase (service role) ─► voit TOUTES les conversations
```

Fichiers : `js/history.js` (client + logique), `js/vendor/supabase.min.js`
(client officiel vendorisé pour respecter la CSP), `supabase/schema.sql`
(tables + RLS), intégration UI dans `js/jesus.js`.
