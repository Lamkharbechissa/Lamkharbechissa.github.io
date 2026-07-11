/* ============================================================================
   ISSA — Boîte de réception ADMIN intégrée au site (innovation)
   ----------------------------------------------------------------------------
   Comment vous (Issa) lisez les messages laissés par les visiteurs, DEPUIS le
   site lui-même : ajoutez « #boite-issa » à la fin de l'URL de votre site
   (ex. https://lamkharbechissa.github.io/#boite-issa). Un panneau discret
   s'ouvre : connectez-vous avec votre email + mot de passe admin (Supabase),
   et vous voyez tous les messages, avec « marquer lu » et « supprimer ».

   Sécurité : un client Supabase SÉPARÉ (storageKey dédié) pour ne pas toucher
   la session anonyme des visiteurs. La lecture de la boîte est protégée par la
   Row Level Security (policy « admin_select_inbox » : réservée à votre email).
   Les visiteurs, eux, ne peuvent QUE déposer un message (jamais lire).
   ============================================================================ */
(function () {
  "use strict";
  const CFG = window.JESUS_CONFIG || {};
  const url = (CFG.supabaseUrl || "").trim();
  const key = (CFG.supabaseAnonKey || "").trim();
  const SECRET_HASH = "#boite-issa";

  let client = null, overlay = null, listEl = null, loginEl = null;

  function ensureClient() {
    if (client) return client;
    if (!url || !key || !window.supabase) return null;
    client = window.supabase.createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: "issa-admin" },
    });
    return client;
  }

  function build() {
    overlay = document.createElement("div");
    overlay.id = "admin-overlay";
    overlay.className = "admin-hidden";
    overlay.innerHTML = `
      <div class="admin-panel">
        <div class="admin-head">
          <div class="admin-title">📬 Boîte de réception <span class="admin-badge" id="admin-count"></span></div>
          <div class="admin-actions">
            <button class="admin-refresh" id="admin-refresh" title="Rafraîchir" hidden>↻</button>
            <button class="admin-logout" id="admin-logout" title="Se déconnecter" hidden>Déconnexion</button>
            <button class="admin-x" id="admin-close" aria-label="Fermer">×</button>
          </div>
        </div>
        <form class="admin-login" id="admin-login">
          <p class="admin-hint">Espace réservé à Issa. Connectez-vous pour lire les messages.</p>
          <input type="email" id="admin-email" placeholder="Email admin" autocomplete="username" required>
          <input type="password" id="admin-pass" placeholder="Mot de passe" autocomplete="current-password" required>
          <button type="submit" class="btn btn-primary" id="admin-signin">Se connecter</button>
          <div class="admin-status" id="admin-status"></div>
        </form>
        <div class="admin-list" id="admin-list" hidden></div>
      </div>`;
    document.body.appendChild(overlay);

    listEl = overlay.querySelector("#admin-list");
    loginEl = overlay.querySelector("#admin-login");

    overlay.querySelector("#admin-close").addEventListener("click", close);
    overlay.addEventListener("click", e => { if (e.target === overlay) close(); });
    overlay.querySelector("#admin-refresh").addEventListener("click", loadMessages);
    overlay.querySelector("#admin-logout").addEventListener("click", logout);
    loginEl.addEventListener("submit", signIn);
  }

  function open() {
    if (!overlay) build();
    overlay.classList.remove("admin-hidden");
    if (!ensureClient()) {
      /* non configuré : message inline non-bloquant */
      loginEl.hidden = true; listEl.hidden = false;
      overlay.querySelector("#admin-refresh").hidden = true;
      overlay.querySelector("#admin-logout").hidden = true;
      listEl.innerHTML = `<div class="admin-empty">Boîte non configurée.<br><small>Renseignez Supabase dans <b>js/config.js</b> (voir GUIDE_HISTORIQUE_ADMIN.md).</small></div>`;
      return;
    }
    // déjà connecté ? on affiche directement la liste
    client.auth.getSession().then(({ data: { session } }) => {
      if (session && session.user && session.user.email) showList(); else showLogin();
    });
  }
  function close() {
    if (overlay) overlay.classList.add("admin-hidden");
    if (location.hash === SECRET_HASH) history.replaceState(null, "", location.pathname + location.search);
  }

  function showLogin() {
    loginEl.hidden = false; listEl.hidden = true;
    overlay.querySelector("#admin-refresh").hidden = true;
    overlay.querySelector("#admin-logout").hidden = true;
  }
  function showList() {
    loginEl.hidden = true; listEl.hidden = false;
    overlay.querySelector("#admin-refresh").hidden = false;
    overlay.querySelector("#admin-logout").hidden = false;
    loadMessages();
  }

  async function signIn(e) {
    e.preventDefault();
    const status = overlay.querySelector("#admin-status");
    const email = overlay.querySelector("#admin-email").value.trim();
    const pass = overlay.querySelector("#admin-pass").value;
    status.textContent = "Connexion…"; status.className = "admin-status";
    const { error } = await client.auth.signInWithPassword({ email, password: pass });
    if (error) { status.textContent = "Échec : " + error.message; status.className = "admin-status err"; return; }
    status.textContent = ""; showList();
  }
  async function logout() { await client.auth.signOut(); showLogin(); }

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function fmt(iso) { try { return new Date(iso).toLocaleString("fr-FR"); } catch (_) { return ""; } }

  async function loadMessages() {
    listEl.innerHTML = `<div class="admin-empty">Chargement…</div>`;
    const { data, error } = await client
      .from("inbox").select("id,name,email,message,is_read,created_at")
      .order("created_at", { ascending: false }).limit(200);
    if (error) {
      listEl.innerHTML = `<div class="admin-empty">Erreur : ${esc(error.message)}<br><small>Vérifiez que votre email est bien celui de la policy admin (schema.sql).</small></div>`;
      overlay.querySelector("#admin-count").textContent = "";
      return;
    }
    const unread = (data || []).filter(m => !m.is_read).length;
    overlay.querySelector("#admin-count").textContent = data && data.length
      ? `${data.length} message(s)${unread ? " · " + unread + " non lu(s)" : ""}` : "";
    if (!data || !data.length) { listEl.innerHTML = `<div class="admin-empty">Aucun message pour l'instant.</div>`; return; }

    listEl.innerHTML = "";
    for (const m of data) {
      const card = document.createElement("div");
      card.className = "admin-msg" + (m.is_read ? "" : " unread");
      card.innerHTML = `
        <div class="admin-msg-top">
          <div><strong>${esc(m.name)}</strong> ${m.email ? `<a href="mailto:${esc(m.email)}">${esc(m.email)}</a>` : ""}</div>
          <div class="admin-msg-date">${fmt(m.created_at)}</div>
        </div>
        <div class="admin-msg-body">${esc(m.message)}</div>
        <div class="admin-msg-actions">
          ${m.is_read ? "" : `<button class="admin-read" data-id="${m.id}">✓ Marquer lu</button>`}
          ${m.email ? `<a class="admin-reply" href="mailto:${esc(m.email)}?subject=${encodeURIComponent("Re: votre message")}">↩ Répondre</a>` : ""}
          <button class="admin-del" data-id="${m.id}">🗑 Supprimer</button>
        </div>`;
      card.querySelectorAll(".admin-read").forEach(b => b.addEventListener("click", async () => {
        await client.from("inbox").update({ is_read: true }).eq("id", b.dataset.id); loadMessages();
      }));
      card.querySelectorAll(".admin-del").forEach(b => b.addEventListener("click", async () => {
        if (!confirm("Supprimer ce message ?")) return;
        await client.from("inbox").delete().eq("id", b.dataset.id); loadMessages();
      }));
      listEl.appendChild(card);
    }
  }

  function maybeOpen() { if (location.hash === SECRET_HASH) open(); }
  window.addEventListener("hashchange", maybeOpen);
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", maybeOpen);
  else maybeOpen();

  window.ISSAAdmin = { open };
})();
