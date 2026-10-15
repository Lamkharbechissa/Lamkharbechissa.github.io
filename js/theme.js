/* ============================================================================
   THÈME CLAIR / SOMBRE — chargé de façon synchrone dans <head> (avant le CSS
   rendu) pour appliquer le choix mémorisé AVANT le premier affichage : aucun
   flash. Sans choix mémorisé, aucun attribut n'est posé et le CSS suit la
   préférence du système (prefers-color-scheme) en direct.
   Clé localStorage : "issa-theme" ("light" | "dark").
   ============================================================================ */
(function () {
  "use strict";
  var KEY = "issa-theme", root = document.documentElement;
  root.classList.add("js"); /* active l'état masqué des .reveal (le contenu reste visible sans JS) */

  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) { /* stockage bloqué */ }
  if (saved === "light" || saved === "dark") root.setAttribute("data-theme", saved);

  var mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function current() {
    var a = root.getAttribute("data-theme");
    if (a === "dark" || a === "light") return a;
    return mq && mq.matches ? "dark" : "light";
  }
  function emit(mode) {
    var ev;
    try { ev = new CustomEvent("issa:theme", { detail: mode }); }
    catch (e) { ev = document.createEvent("CustomEvent"); ev.initCustomEvent("issa:theme", false, false, mode); }
    document.dispatchEvent(ev);
  }
  function set(mode) {
    if (mode !== "dark" && mode !== "light") return;
    root.classList.add("theming");
    root.setAttribute("data-theme", mode);
    try { localStorage.setItem(KEY, mode); } catch (e) { /* stockage bloqué */ }
    setTimeout(function () { root.classList.remove("theming"); }, 320);
    emit(mode);
  }
  function toggle() { set(current() === "dark" ? "light" : "dark"); }

  if (mq) {
    var onChange = function () { emit(current()); };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  window.ISSATheme = { current: current, set: set, toggle: toggle };
})();
