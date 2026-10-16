/* ============================================================================
   Configuration du chatbot ISSA (mode IA conversationnelle = relais LLM + RAG)
   ----------------------------------------------------------------------------
   apiUrl : URL du relais = votre Cloudflare Worker (worker/jesus-worker.js),
            SANS « / » final. Voir GUIDE_JESUS_LLM.md (déploiement par copier-coller
            dans le tableau de bord Cloudflare).
            Exemple : "https://jesus-llm.VOTRE-SOUS-DOMAINE.workers.dev"
            Le Worker garde la clé Groq SECRÈTE, fait la recherche (embeddings
            bge-m3 + BM25) et choisit le modèle. Le navigateur n'envoie que
            {question, history, lang} à {apiUrl}/chat.
            → Champ vide : ISSA reste en « mode hors ligne » (moteur à règles
              instantané, aucune dépendance). En cas de panne ou de quota du
              relais, le chat bascule aussi tout seul sur ce moteur.
            → En local : js/config.local.js (git-ignoré) pose apiUrl = "/api",
              servi par « python serve.py » (relais de développement).

   groqApiKey : N'EST PLUS LU PAR LE NAVIGATEUR (l'appel direct à Groq a été
                supprimé). Laisser VIDE ici. La clé de TEST locale se met dans
                js/config.local.js, où seul serve.py (côté machine) la lit.

   Modèles : choisis par le relais, plus par le site (cascade définie dans
   js/rag-prompt.json → generation.models, ex. openai/gpt-oss-120b →
   qwen/qwen3.8-27b → openai/gpt-oss-20b ; variable MODELS du Worker).

   Délais côté navigateur (facultatifs) : firstTokenTimeoutMs (13 000 = échéance du relais 10 s + 3 s) et
   totalTimeoutMs (40 000) ; au-delà, repli sur le moteur hors ligne.
   ============================================================================ */
window.JESUS_CONFIG = {
  apiUrl: "",
  groqApiKey: "",
  firstTokenTimeoutMs: 13000,
  totalTimeoutMs: 40000,

  /* ---- Historique des conversations ----
     Par DÉFAUT, l'historique fonctionne déjà (stocké dans le navigateur du
     visiteur) : chaque visiteur voit et continue ses conversations, sans rien
     configurer. Ces 2 champs Supabase sont OPTIONNELS : les remplir ajoute la
     synchro multi-appareils + la consultation admin (voir GUIDE_HISTORIQUE_ADMIN.md).
     Valeurs PUBLIQUES par conception (sécurité assurée par la Row Level Security). */
  supabaseUrl: "",
  supabaseAnonKey: "",

  /* ---- Formulaire de contact : où arrivent les messages ? ----
     contactEmail : VOTRE email. Les messages du formulaire y arrivent
       AUTOMATIQUEMENT via FormSubmit.co (gratuit, AUCUNE clé requise). La toute
       première fois, vous recevez un email de confirmation à valider une fois ;
       ensuite tous les messages tombent dans cette boîte. Vous les consultez
       simplement dans votre Gmail. (voir GUIDE_CONTACT_EMAIL.md)
     web3formsKey : OPTIONNEL (autre service email). Laissez vide si vous
       utilisez FormSubmit (recommandé). */
  contactEmail: "issa.pfe@gmail.com",
  web3formsKey: "",

  /* ---- Notifications par email (visites + conversations) ----
     Vous êtes prévenu par email (dans votre Gmail, via FormSubmit) :
       • notifyOnVisit : quand quelqu'un VISITE le site (throttlé : 1 email max
         par visiteur toutes les 24 h, pour ne pas noyer votre boîte).
       • notifyOnChat  : quand quelqu'un DISCUTE avec ISSA, la conversation vous
         est envoyée (à la fermeture / au départ / après inactivité).
     Ainsi toutes les conversations s'archivent dans votre Gmail (consultables à
     tout moment). Mettez à false pour désactiver. notifyEmail = destinataire
     (par défaut contactEmail). Nécessite d'avoir confirmé FormSubmit une fois
     (voir GUIDE_CONTACT_EMAIL.md).

     Chaque résumé de visite indique si le visiteur est probablement un HUMAIN
     ou un ROBOT (« 🧪 Verdict : 🙂 Humain probable (indice humain : 87/100) »),
     d'après des signaux anonymes (souris, défilement, marqueurs d'automatisation).
     C'est un indice, pas une preuve ; rien n'est bloqué pour le visiteur.
       • notifyBots : true = vous recevez aussi les visites de robots qui
         EXÉCUTENT JavaScript (rendu Googlebot / bingbot, Lighthouse, navigateurs
         automatisés…) ; false = seules les visites humaines / indéterminées vous
         sont envoyées (les conversations restent toujours envoyées). Les aperçus
         de liens (WhatsApp, LinkedIn, Slack…) et la plupart des robots d'IA / SEO
         ne lisent que le HTML : ils n'apparaissent jamais dans ces emails.
       • notifyOnLocalhost : false (recommandé) = AUCUN email pendant vos tests en
         local (localhost, 127.0.0.1, adresse du réseau local 192.168.x.x /
         10.x.x.x, nom du PC, fichier ouvert directement…) ; true = envoie aussi
         en local (pour tester la réception). En local, tapez dans la console
         ISSAVisit.preview() pour voir l'email qui partirait, sans rien envoyer.
       • notifyHosts : adresses du site PUBLIÉ, toujours autorisées à envoyer
         (ajoutez-y votre nom de domaine si vous en prenez un). */
  notifyOnVisit: true,
  notifyOnChat: true,
  notifyBots: true,
  notifyOnLocalhost: false,
  notifyHosts: ["lamkharbechissa.github.io"],
  notifyEmail: ""
};
