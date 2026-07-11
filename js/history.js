/* ============================================================================
   ISSA — Historique des conversations (Supabase, anonyme strict)
   ----------------------------------------------------------------------------
   Rôle : persister les conversations pour que CHAQUE visiteur retrouve et
   continue les siennes, et que l'admin (Issa) les consulte via le dashboard
   Supabase. Aucune donnée personnelle : chaque visiteur = un utilisateur
   ANONYME Supabase (un simple UUID mémorisé dans son navigateur).

   Conception « fail-safe » : si Supabase n'est pas configuré (champs vides dans
   config.js), ou en cas d'erreur réseau, tout se désactive silencieusement et
   le chat continue de fonctionner normalement (sans historique).
   ============================================================================ */
window.ISSAHistory = (function () {
  "use strict";
  const CFG = window.JESUS_CONFIG || {};
  const url = (CFG.supabaseUrl || "").trim();
  const key = (CFG.supabaseAnonKey || "").trim();

  const store = {
    enabled: false,          // devient true une fois la session anonyme prête
    currentId: null,         // conversation en cours
    _client: null,
    _uid: null,
  };

  /* ---- Initialisation : crée le client + une session anonyme ------------- */
  store.init = async function () {
    if (!url || !key) return false;                       // non configuré
    if (!window.supabase || !window.supabase.createClient) return false;
    try {
      store._client = window.supabase.createClient(url, key, {
        auth: { persistSession: true, autoRefreshToken: true, storageKey: "issa-visitor" },
      });
      /* réutilise la session existante (même navigateur) ou en crée une */
      let { data: { session } } = await store._client.auth.getSession();
      if (!session) {
        const { data, error } = await store._client.auth.signInAnonymously();
        if (error) throw error;
        session = data.session;
      }
      store._uid = session && session.user ? session.user.id : null;
      store.enabled = Boolean(store._uid);
      return store.enabled;
    } catch (e) {
      console.warn("[ISSAHistory] désactivé :", e.message || e);
      store.enabled = false;
      return false;
    }
  };

  /* ---- Liste des conversations du visiteur (plus récentes d'abord) ------- */
  store.list = async function () {
    if (!store.enabled) return [];
    const { data, error } = await store._client
      .from("conversations")
      .select("id,title,lang,updated_at")
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) { console.warn("[ISSAHistory] list:", error.message); return []; }
    return data || [];
  };

  /* ---- Messages d'une conversation (chronologique) ---------------------- */
  store.messages = async function (conversationId) {
    if (!store.enabled) return [];
    const { data, error } = await store._client
      .from("messages")
      .select("role,content,created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    if (error) { console.warn("[ISSAHistory] messages:", error.message); return []; }
    return data || [];
  };

  /* ---- Crée une nouvelle conversation et la rend « courante » ------------ */
  store.newConversation = async function (lang, firstUserText) {
    store.currentId = null;
    if (!store.enabled) return null;
    const title = (firstUserText || (lang === "en" ? "New conversation" : "Nouvelle conversation"))
      .slice(0, 60);
    const { data, error } = await store._client
      .from("conversations")
      .insert({ user_id: store._uid, title, lang: lang || "fr" })
      .select("id")
      .single();
    if (error) { console.warn("[ISSAHistory] newConversation:", error.message); return null; }
    store.currentId = data.id;
    return data.id;
  };

  /* ---- Ajoute un message ; crée la conversation au 1er message ----------- */
  store.addMessage = async function (role, content, lang) {
    if (!store.enabled) return;
    try {
      if (!store.currentId) {
        await store.newConversation(lang, role === "user" ? content : null);
        if (!store.currentId) return;
      }
      await store._client.from("messages").insert({
        conversation_id: store.currentId,
        user_id: store._uid,
        role,
        content: String(content).slice(0, 8000),
      });
    } catch (e) {
      console.warn("[ISSAHistory] addMessage:", e.message || e);
    }
  };

  /* ---- Ouvre une conversation existante (pour la continuer) ------------- */
  store.open = async function (conversationId) {
    if (!store.enabled) return [];
    store.currentId = conversationId;
    return store.messages(conversationId);
  };

  /* ---- Supprime une conversation --------------------------------------- */
  store.remove = async function (conversationId) {
    if (!store.enabled) return;
    await store._client.from("conversations").delete().eq("id", conversationId);
    if (store.currentId === conversationId) store.currentId = null;
  };

  /* ---- Dépose un message dans la boîte de réception de l'admin ----------
     Utilise la session anonyme du visiteur : il peut écrire, jamais lire. */
  store.sendInboxMessage = async function (name, email, message) {
    if (!store.enabled) return { ok: false, reason: "disabled" };
    try {
      const { error } = await store._client.from("inbox").insert({
        user_id: store._uid,
        name: String(name).slice(0, 120),
        email: String(email || "").slice(0, 200),
        message: String(message).slice(0, 4000),
      });
      return { ok: !error, error: error && error.message };
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
    }
  };

  return store;
})();
