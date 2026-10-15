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
`js/config.js`, déjà réglé sur `issa.pfe@gmail.com`) grâce au service
gratuit **FormSubmit.co**. Aucune clé, aucun compte à créer.

**La toute première fois seulement**, FormSubmit doit vérifier que l'email vous
appartient :

1. Mettez le site en ligne (ou testez-le en local).
2. Depuis la section Contact, **envoyez-vous un premier message test**.
3. Vous recevez un email de **FormSubmit** intitulé « Confirm your email » à
   `issa.pfe@gmail.com` → cliquez sur le **bouton de confirmation**.
4. C'est fait ✅ — **à partir de là, TOUS les messages du formulaire arrivent
   automatiquement dans votre boîte Gmail.**

> Astuce : si vous ne voyez pas l'email de confirmation, regardez dans
> **Spam / Promotions**.

> ⚠️ **Changement d'adresse (octobre 2026)** : l'adresse de contact est
> désormais `issa.pfe@gmail.com` (elle remplace l'ancienne adresse dans
> `js/config.js`). FormSubmit confirme **chaque adresse séparément** : il faut
> donc refaire **une fois** les étapes 2 et 3 ci-dessus pour la nouvelle
> adresse, sinon ni les messages du formulaire ni les notifications de visite
> et de conversation (`js/notify.js`) ne seront délivrés.

---

## 👀 Comment consulter les messages reçus

**Tout simplement dans votre Gmail** (`issa.pfe@gmail.com`) : chaque
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

Le site vous **prévient par email** (dans votre Gmail, même mécanisme FormSubmit),
de façon **consolidée pour ne pas noyer votre boîte** :

- **Un seul email « résumé » par visiteur** (au plus **1 / 24 h**), envoyé quand
  le visiteur **quitte** le site. Il contient : la **durée de visite**, les
  **sections consultées**, la **provenance**, la **langue**, s'il a **discuté
  avec ISSA**, et **toute la conversation** le cas échéant.
  → Le sujet commence par le **verdict humain / robot** (voir ci-dessous), par
  ex. « 🙂 Humain probable — nouvelle visite sur votre portfolio » (suivi de
  « + conversation ISSA » si le visiteur a discuté).
- Si le visiteur **relance une conversation plus tard** (après le résumé du
  jour), cette nouvelle conversation vous est quand même envoyée (jamais de
  doublon).

➡️ **Toutes les conversations s'archivent ainsi dans votre Gmail** : vous les
consultez à tout moment (recherchez « ISSA » dans Gmail), **sans exception**.

**Réglages** (dans [`js/config.js`](js/config.js)) :
```js
notifyOnVisit:     true,   // false pour ne PAS être notifié des visites
notifyOnChat:      true,   // false pour ne PAS recevoir les conversations
notifyBots:        true,   // false = ne pas recevoir les visites de robots
notifyOnLocalhost: false,  // true = envoyer aussi pendant vos tests en local
notifyHosts: ["lamkharbechissa.github.io"], // adresses du site publié
notifyEmail:       "",     // vide = votre contactEmail
```

## 🤖 / 🙂 Humain ou robot ? (verdict dans chaque résumé)

Chaque résumé de visite indique **si le visiteur est probablement un humain ou
un robot**, sans rien bloquer ni rien demander au visiteur (pas de CAPTCHA,
aucun accès restreint). Le sujet commence par le verdict :

| Sujet | Signification |
|---|---|
| « 🙂 Humain probable — nouvelle visite… » | vraie activité : souris avec trajectoire naturelle (pas en ligne droite à vitesse constante), toucher d'écran, défilement à la molette, frappe au clavier ou utilisation du chat |
| « 🤖 Robot identifié (Googlebot) — visite… » | robot qui se nomme ET exécute JavaScript : rendu Googlebot / bingbot, Google-InspectionTool… Les aperçus de liens (WhatsApp, LinkedIn, Slack, Discord, Telegram, Facebook, X) et la plupart des robots d'IA / SEO (GPTBot, ClaudeBot, AhrefsBot…) ne lisent que le HTML : le script ne s'exécute pas chez eux, ils n'apparaissent **jamais** dans ces emails (seuls des journaux serveur, ex. Cloudflare, les montrent). Les visites Googlebot sont signalées au mieux, sans garantie. |
| « 🤖 Robot probable — nouvelle visite… » | navigateur automatisé (webdriver, HeadlessChrome, Puppeteer, Playwright, Selenium, ChromeDriver, Lighthouse), événements surtout simulés, ou aucune interaction en moins de 8 s **sur ordinateur** (sur mobile / tablette, une visite éclair sans toucher l'écran donne « Indéterminé », sauf autre indice suspect). Une fenêtre de taille nulle n'est qu'un indice faible : certaines applis (LinkedIn, Instagram…) et vues intégrées la rapportent pour de vrais visiteurs |
| « ❓ Visiteur indéterminé — nouvelle visite… » | pas assez d'indices, par ex. quelqu'un qui lit sans toucher la souris ni l'écran, un coup d'œil éclair sur mobile, ou un lecteur d'écran |

Dans le corps de l'email, juste sous la première ligne :
```
🧪 Verdict : 🙂 Humain probable (indice humain : 87/100)
🔎 Indices : a bougé la souris · a fait défiler la page · a utilisé le clavier (4 touches) · a cliqué · première interaction après 2 s
🖥️ Navigateur : Chrome 129 sur Windows
📱 Appareil : ordinateur
```
L'**indice humain** va de 0 (robot certain) à 100 (humain très probable).
Les emails de conversation envoyés plus tard dans la journée portent aussi la
ligne « 🧪 Verdict ».

**Limites à connaître :**
- C'est un **indice, pas une preuve** : un robot déterminé peut imiter des
  mouvements de souris, et un humain très rapide (ouvert puis fermé en quelques
  secondes sans rien toucher) peut être classé « robot probable ».
- Un onglet ouvert **en arrière-plan** n'est pas jugé tant qu'il n'a pas été
  affiché : les 30 s d'inactivité ne comptent qu'à partir du moment où la page
  est à l'écran (l'absence d'interaction n'y est pas une preuve de robot).
- Les robots certains (identifiés ou automatisés : webdriver, navigateur sans
  interface…) sont signalés **dès le chargement**, car ils ferment souvent la
  page sans prévenir. Les humains reçoivent leur résumé à leur départ ou après
  **30 s sans aucune activité** (page affichée).
- Un simple changement d'onglet ou d'appli après quelques secondes sans geste
  n'est pas jugé « robot » tout de suite : le résumé attend le retour du
  visiteur, son départ ou 30 s d'inactivité.
- Un robot **discret** (sans marqueur d'automatisation) qui ferme le navigateur
  en quelques secondes sans événement de départ **n'est pas signalé**. Seuls
  les robots qui exécutent JavaScript peuvent apparaître (voir tableau).
- **Volume** : 1 résumé par visiteur et par 24 h (même navigateur). Un robot
  certain qui revient avec le même profil (moniteur, tests automatiques) est
  limité à 1 email / 6 h ; mais un robot qui repart d'un profil neuf à chaque
  visite ne peut pas être limité sans serveur (ex. Cloudflare Worker) : s'ils
  encombrent votre boîte, mettez `notifyBots: false`.
- Les signaux sont **anonymes** : mouvements, défilement, nombre de frappes
  (jamais les touches tapées), type de navigateur. Une courte mention de
  confidentialité figure en bas du site (FR/EN).

**`notifyBots: false`** : les visites jugées « robot » ne vous sont plus
envoyées (utile si Googlebot & co. encombrent votre boîte). Les conversations
avec ISSA restent toujours envoyées.

**`notifyOnLocalhost: false`** (par défaut) : quand vous testez le site sur
votre machine (`localhost`, `127.0.0.1`, `*.local`, fichier ouvert
directement…) **ou depuis votre téléphone sur le réseau local**
(`http://192.168.x.x:8765`, `10.x.x.x`, nom du PC sans point…), **aucun email
n'est envoyé** (ni à vous, ni à FormSubmit). `notifyHosts` liste les adresses
du site publié, toujours autorisées (ajoutez-y votre domaine si vous en prenez
un).
Pour voir l'email qui partirait, ouvrez la console du navigateur (F12) et
tapez `ISSAVisit.preview()` (ou `ISSAVisit.verdict()` pour le verdict seul) —
aucun envoi réseau. Mettez `true` uniquement pour tester la réception réelle.

> ⚠️ Ces notifications utilisent FormSubmit : elles ne marchent **qu'après** avoir
> confirmé votre email une fois (étape ci-dessus). Volume : si votre site
> devient très visité, désactivez `notifyOnVisit` (gardez `notifyOnChat`) pour ne
> recevoir que les vraies conversations.
> Pour un archivage 100 % fiable et une vue centralisée (indépendante de Gmail),
> activez Supabase : toutes les conversations y sont stockées et consultables via
> `#boite-issa` (voir GUIDE_HISTORIQUE_ADMIN.md).

## 🛡️ Anti-spam
Le formulaire contient un **champ honeypot invisible** (`#cf-honey`) : les vrais
visiteurs ne le voient pas, mais les robots spammeurs le remplissent
automatiquement → leur message est **silencieusement ignoré** (aucun email
envoyé). FormSubmit filtre en plus une partie du spam de son côté.
