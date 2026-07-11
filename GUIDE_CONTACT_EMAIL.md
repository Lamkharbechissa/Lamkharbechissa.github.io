# ✉️ Formulaire de contact par email (Web3Forms — gratuit, sans serveur)

Le site contient un **formulaire de contact** (section « Contact ») : chaque
visiteur peut vous écrire directement depuis le site, et **le message vous
arrive par email**. Aucun serveur, aucune base à gérer.

- **Sans configuration** : le formulaire fonctionne déjà en mode « repli » — il
  ouvre le logiciel de messagerie du visiteur (mailto:) pré-rempli vers votre
  adresse. Simple, mais dépend du client mail du visiteur.
- **Avec Web3Forms (recommandé)** : le message est envoyé **directement** dans
  votre boîte mail, sans que le visiteur ait à ouvrir quoi que ce soit.

---

## Activer l'envoi direct (2 minutes, 0 €)

1. Allez sur **https://web3forms.com** → entrez votre email
   (`issa.alternance@gmail.com`) → vous recevez une **Access Key** par email.
2. Ouvrez [`js/config.js`](js/config.js) et collez-la :
   ```js
   web3formsKey: "votre-access-key-ici",
   contactEmail: "issa.alternance@gmail.com",
   ```
3. Poussez :
   ```powershell
   cd "C:\Users\hp\Desktop\Develop_website_with_chatbot\website_issa"
   git add -A
   git commit -m "Activation du formulaire de contact email"
   git push
   ```

C'est tout ✅ — chaque message envoyé depuis le site arrive dans votre boîte.

> La clé Web3Forms est **publique par conception** (elle ne fait qu'autoriser
> l'envoi vers VOTRE email) : sans danger dans le code publié. La CSP du site
> autorise déjà `api.web3forms.com`.

---

## Anti-spam (recommandé, gratuit)
Dans le tableau de bord Web3Forms, activez le **reCAPTCHA** ou le champ
**honeypot** pour bloquer les robots spammeurs. Je peux aussi ajouter un
honeypot invisible au formulaire si vous le souhaitez.

## Où ça se trouve dans le code
- Formulaire : section `#contact` de [`index.html`](index.html)
- Logique d'envoi : fonction `setupContactForm()` dans [`js/main.js`](js/main.js)
- Style : `.contact-form` dans [`css/style.css`](css/style.css)
