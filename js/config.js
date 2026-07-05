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
  maxHistory: 8,        /* nombre de messages de conversation conservés */
  topK: 5,              /* nombre de passages RAG injectés dans le prompt */
  timeoutMs: 12000      /* au-delà : repli automatique sur le moteur local */
};
