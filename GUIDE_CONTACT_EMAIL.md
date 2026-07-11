# ✉️ Recevoir les messages du site dans votre Gmail (gratuit, sans clé)

La section **Contact** du site propose 3 façons de vous joindre, **toutes
depuis le site** :

1. **Formulaire « Laissez-moi un message »** → le message arrive
   **directement dans votre Gmail** (via FormSubmit.co, gratuit, sans clé).
2. **Bouton 📧 Par email** → ouvre un email pré-rempli vers vous.
3. **Bouton 📱 Par SMS** → ouvre un SMS pré-rempli vers vous (sur mobile).

---

## ✅ Étape UNIQUE à faire : activer FormSubmit (1 minute)

Le formulaire envoie les messages à **votre email** (`contactEmail` dans
`js/config.js`, déjà réglé sur `issa.alternance@gmail.com`) grâce au service
gratuit **FormSubmit.co**. Aucune clé, aucun compte à créer.

**La toute première fois seulement**, FormSubmit doit vérifier que l'email vous
appartient :

1. Mettez le site en ligne (ou testez-le en local).
2. Depuis la section Contact, **envoyez-vous un premier message test**.
3. Vous recevez un email de **FormSubmit** intitulé « Confirm your email » à
   `issa.alternance@gmail.com` → cliquez sur le **bouton de confirmation**.
4. C'est fait ✅ — **à partir de là, TOUS les messages du formulaire arrivent
   automatiquement dans votre boîte Gmail.**

> Astuce : si vous ne voyez pas l'email de confirmation, regardez dans
> **Spam / Promotions**.

---

## 👀 Comment consulter les messages reçus

**Tout simplement dans votre Gmail** (`issa.alternance@gmail.com`) : chaque
message envoyé depuis le site arrive comme un email normal, avec le **nom**,
l'**email** et le **message** du visiteur. Vous répondez directement depuis
Gmail. Rien d'autre à installer.

*(Option avancée : si vous configurez Supabase, vous avez aussi une boîte de
réception intégrée au site via `#boite-issa` — voir GUIDE_HISTORIQUE_ADMIN.md.
Mais pour recevoir les messages, Gmail via FormSubmit suffit largement.)*

---

## 📱 À propos du SMS

Le bouton **« Par SMS »** ouvre l'application SMS du visiteur avec votre numéro
pré-rempli : il vous envoie un vrai SMS depuis son téléphone. C'est la seule
méthode **gratuite** (l'envoi automatique de SMS depuis un site web nécessite
un service payant type Twilio). Pour un contact fiable, le **formulaire →
Gmail** reste le canal principal.

---

## 🔧 Où changer l'adresse / le numéro

- **Email de réception** : `contactEmail` dans [`js/config.js`](js/config.js).
- **Numéro (SMS/téléphone)** : `chatbot/knowledge_base.json` → `profile.contact.phone`,
  puis régénérez avec `python chatbot/jesus_chatbot.py --export`.
- Logique d'envoi : `setupContactForm()` dans [`js/main.js`](js/main.js).
- La CSP autorise déjà `formsubmit.co` et `api.web3forms.com`.

## 🔔 Notifications automatiques (visites + conversations)

Le site vous **prévient par email** (dans votre Gmail, même mécanisme FormSubmit) :

- **À chaque visite** : vous recevez « 🔔 Nouvelle visite sur votre portfolio »
  (date, provenance, langue). **Anti-flood** : au plus **1 email par visiteur
  toutes les 24 h** — sinon un site populaire noierait votre boîte.
- **À chaque conversation avec ISSA** : la **conversation complète** vous est
  envoyée (« 💬 Nouvelle conversation… ») quand le visiteur ferme le chat, quitte
  la page, ou après un moment d'inactivité. Chaque conversation n'est envoyée
  qu'une fois (pas de doublon).

➡️ **Toutes les conversations s'archivent ainsi dans votre Gmail** : vous les
consultez à tout moment (recherchez « conversation ISSA » dans Gmail),
**sans exception**.

**Réglages** (dans [`js/config.js`](js/config.js)) :
```js
notifyOnVisit: true,   // false pour ne PAS être notifié des visites
notifyOnChat:  true,   // false pour ne PAS recevoir les conversations
notifyEmail:   "",     // vide = votre contactEmail
```

> ⚠️ Ces notifications utilisent FormSubmit : elles ne marchent **qu'après** avoir
> confirmé votre email une fois (étape ci-dessus). Volume : si votre site
> devient très visité, désactivez `notifyOnVisit` (gardez `notifyOnChat`) pour ne
> recevoir que les vraies conversations.
> Pour un archivage 100 % fiable et une vue centralisée (indépendante de Gmail),
> activez Supabase : toutes les conversations y sont stockées et consultables via
> `#boite-issa` (voir GUIDE_HISTORIQUE_ADMIN.md).

## 🛡️ Anti-spam
FormSubmit filtre déjà pas mal de spam. Si besoin, je peux ajouter un champ
« honeypot » invisible au formulaire (bloque les robots) — dites-le-moi.
