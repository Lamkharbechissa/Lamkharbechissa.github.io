/* ============================================================================
   Configuration du chatbot Jesus (mode LLM + RAG)
   ----------------------------------------------------------------------------
   apiUrl : URL de votre proxy Cloudflare Worker (voir GUIDE_JESUS_LLM.md).
            Le worker garde votre clé API Groq SECRÈTE et gratuite.
            Exemple : "https://jesus-llm.VOTRE-SOUS-DOMAINE.workers.dev"
            → Tant que ce champ est vide, Jesus utilise automatiquement son
              moteur local instantané (aucune dépendance, déjà fonctionnel).

   groqApiKey : UNIQUEMENT pour tester en local sur votre machine.
                ⚠️ NE JAMAIS remplir ce champ sur le site publié : une clé dans
                le code du site est visible par tout le monde. En production,
                utilisez apiUrl (le worker) et laissez groqApiKey vide.

   model : modèle Groq (gratuit, ultra-rapide).
   ============================================================================ */
window.JESUS_CONFIG = {
  apiUrl: "",
  groqApiKey: "",
  model: "llama-3.3-70b-versatile",
  temperature: 0.75,    /* 0 = toujours pareil, 1 = très varié. 0.75 = vivant + fidèle */
  maxHistory: 10,       /* nombre de messages de conversation conservés (mémoire) */
  topK: 6,              /* nombre de passages RAG injectés dans le prompt */
  timeoutMs: 15000,     /* au-delà : repli automatique sur le moteur local */

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
  contactEmail: "issa.alternance@gmail.com",
  web3formsKey: ""
};
