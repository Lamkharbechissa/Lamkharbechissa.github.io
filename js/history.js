/* ============================================================================
   ISSA — Historique des conversations (2 moteurs : navigateur + Supabase)
   ----------------------------------------------------------------------------
   Objectif : que CHAQUE visiteur puisse revoir et CONTINUER ses conversations.

   • Par DÉFAUT (aucune configuration) : les conversations sont stockées dans le
     navigateur du visiteur (localStorage). Ça marche immédiatement, hors ligne,
     et c'est privé (les données restent sur SON appareil).

   • Si Supabase est configuré (config.js) : on l'utilise à la place, ce qui
     ajoute la synchro multi-appareils et permet à l'admin (Issa) de consulter
     toutes les conversations. Modèle anonyme strict (UUID, aucune donnée perso).

   L'historique est donc TOUJOURS disponible : les boutons 🕑 / ✚ s'affichent
   quoi qu'il arrive.
   ============================================================================ */
window.ISSAHistory = (function () {
  "use strict";
  const CFG = window.JESUS_CONFIG || {};
  const SB_URL = (CFG.supabaseUrl || "").trim();
  const SB_KEY = (CFG.supabaseAnonKey || "").trim();

  const store = {
    enabled: false,       // true dès qu'un moteur est prêt (toujours le cas)
    backend: "local",     // "local" (navigateur) ou "supabase"
    currentId: null,
    _client: null,
    _uid: null,
  };

  /* ============================ MOTEUR LOCAL ============================== */
  const IDX_KEY = "issa_conv_index";
  const CONV_KEY = (id) => "issa_conv_" + id;

  function lsGet(k, fallback) {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; }
    catch (_) { return fallback; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (_) { return false; }
  }
  function uuid() {
    try { return crypto.randomUUID(); }
    catch (_) { return "c" + Date.now() + Math.random().toString(16).slice(2); }
  }

  const local = {
    list() {
      return lsGet(IDX_KEY, []).slice()
        .sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
    },
    messages(id) { return lsGet(CONV_KEY(id), []); },
    newConversation(lang, firstUserText) {
      const id = uuid();
      const title = (firstUserText || (lang === "en" ? "New conversation" : "Nouvelle conversation")).slice(0, 60);
      const idx = lsGet(IDX_KEY, []);
      idx.push({ id, title, lang: lang || "fr", updated_at: new Date().toISOString() });
      lsSet(IDX_KEY, idx);
      lsSet(CONV_KEY(id), []);
      store.currentId = id;
      return id;
    },
    addMessage(role, content, lang) {
      if (!store.currentId) local.newConversation(lang, role === "user" ? content : null);
      const msgs = lsGet(CONV_KEY(store.currentId), []);
      msgs.push({ role, content: String(content).slice(0, 8000), created_at: new Date().toISOString() });
      lsSet(CONV_KEY(store.currentId), msgs);
      const idx = lsGet(IDX_KEY, []);
      const c = idx.find((x) => x.id === store.currentId);
      if (c) {
        c.updated_at = new Date().toISOString();
        /* titre = début du 1er message utilisateur */
        if (role === "user" && (!c.title || c.title === "Nouvelle conversation" || c.title === "New conversation")) {
          c.title = String(content).slice(0, 60);
        }
        lsSet(IDX_KEY, idx);
      }
    },
    remove(id) {
      lsSet(IDX_KEY, lsGet(IDX_KEY, []).filter((x) => x.id !== id));
      try { localStorage.removeItem(CONV_KEY(id)); } catch (_) {}
      if (store.currentId === id) store.currentId = null;
    },
  };

  /* ========================== MOTEUR SUPABASE ============================ */
  const remote = {
    async init() {
      store._client = window.supabase.createClient(SB_URL, SB_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, storageKey: "issa-visitor" },
      });
      let { data: { session } } = await store._client.auth.getSession();
      if (!session) {
        const { data, error } = await store._client.auth.signInAnonymously();
        if (error) throw error;
        session = data.session;
      }
      store._uid = session && session.user ? session.user.id : null;
      return Boolean(store._uid);
    },
    async list() {
      const { data, error } = await store._client.from("conversations")
        .select("id,title,lang,updated_at").order("updated_at", { ascending: false }).limit(50);
      if (error) { console.warn("[ISSAHistory] list:", error.message); return []; }
      return data || [];
    },
    async messages(id) {
      const { data, error } = await store._client.from("messages")
        .select("role,content,created_at").eq("conversation_id", id).order("created_at", { ascending: true });
      if (error) { console.warn("[ISSAHistory] messages:", error.message); return []; }
      return data || [];
    },
    async newConversation(lang, firstUserText) {
      store.currentId = null;
      const title = (firstUserText || (lang === "en" ? "New conversation" : "Nouvelle conversation")).slice(0, 60);
      const { data, error } = await store._client.from("conversations")
        .insert({ user_id: store._uid, title, lang: lang || "fr" }).select("id").single();
      if (error) { console.warn("[ISSAHistory] newConversation:", error.message); return null; }
      store.currentId = data.id;
      return data.id;
    },
    async addMessage(role, content, lang) {
      if (!store.currentId) { await remote.newConversation(lang, role === "user" ? content : null); if (!store.currentId) return; }
      await store._client.from("messages").insert({
        conversation_id: store.currentId, user_id: store._uid, role, content: String(content).slice(0, 8000),
      });
    },
    async remove(id) {
      await store._client.from("conversations").delete().eq("id", id);
      if (store.currentId === id) store.currentId = null;
    },
  };

  /* ===================== API PUBLIQUE (choisit le moteur) ================= */
  store.init = async function () {
    if (SB_URL && SB_KEY && window.supabase && window.supabase.createClient) {
      try {
        if (await remote.init()) { store.backend = "supabase"; store.enabled = true; return true; }
      } catch (e) {
        console.warn("[ISSAHistory] Supabase indisponible, repli local :", e.message || e);
      }
    }
    store.backend = "local";
    store.enabled = true;               // le moteur local est toujours dispo
    return true;
  };

  store.list = async function () {
    return store.backend === "supabase" ? remote.list() : local.list();
  };
  store.messages = async function (id) {
    return store.backend === "supabase" ? remote.messages(id) : local.messages(id);
  };
  store.newConversation = async function (lang, firstUserText) {
    return store.backend === "supabase" ? remote.newConversation(lang, firstUserText) : local.newConversation(lang, firstUserText);
  };
  store.addMessage = async function (role, content, lang) {
    try {
      if (store.backend === "supabase") await remote.addMessage(role, content, lang);
      else local.addMessage(role, content, lang);
    } catch (e) { console.warn("[ISSAHistory] addMessage:", e.message || e); }
  };
  store.open = async function (id) {
    store.currentId = id;
    return store.messages(id);
  };
  store.remove = async function (id) {
    return store.backend === "supabase" ? remote.remove(id) : local.remove(id);
  };

  /* Boîte de réception admin : uniquement avec Supabase (le visiteur écrit,
     seul l'admin lit). En mode local, on renvoie false → le formulaire de
     contact bascule sur l'envoi par email. */
  store.sendInboxMessage = async function (name, email, message) {
    if (store.backend !== "supabase") return { ok: false, reason: "local" };
    try {
      const { error } = await store._client.from("inbox").insert({
        user_id: store._uid,
        name: String(name).slice(0, 120),
        email: String(email || "").slice(0, 200),
        message: String(message).slice(0, 4000),
      });
      return { ok: !error, error: error && error.message };
    } catch (e) { return { ok: false, error: e.message || String(e) }; }
  };

  return store;
})();
