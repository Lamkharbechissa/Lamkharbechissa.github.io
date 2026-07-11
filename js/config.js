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

  /* ---- Historique des conversations (Supabase, voir GUIDE_HISTORIQUE_ADMIN.md) ----
     Remplissez ces 2 champs avec l'URL et la clé « anon public » de votre projet
     Supabase pour activer l'historique (chaque visiteur retrouve/continue ses
     conversations, vous les consultez côté admin). Ces valeurs sont PUBLIQUES
     par conception (la sécurité vient de la Row Level Security côté base) : elles
     peuvent rester dans ce fichier publié sans danger.
     → Tant qu'ils sont vides, le chat fonctionne normalement, sans historique. */
  supabaseUrl: "",
  supabaseAnonKey: ""
};
