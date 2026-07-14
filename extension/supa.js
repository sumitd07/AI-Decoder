// Supabase auth + REST for the extension, using plain fetch (no bundled library,
// MV3-friendly). Works in both the service worker (via importScripts) and the
// popup (via <script>). Exposes self.DecoderSupa.
(function () {
  "use strict";
  const KEY = "decoder.session";
  const cfg = () => self.DECODER_SUPABASE || {};

  function decode(jwt) {
    try { return JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); }
    catch (e) { return {}; }
  }
  const get = k => new Promise(r => chrome.storage.local.get([k], o => r(o[k])));
  const set = o => new Promise(r => chrome.storage.local.set(o, r));
  const del = k => new Promise(r => chrome.storage.local.remove([k], r));

  async function saveSession(access_token, refresh_token, expires_in) {
    const c = decode(access_token);
    const s = { access_token, refresh_token, expires_at: Date.now() + (expires_in || 3600) * 1000, user_id: c.sub, email: c.email || "" };
    await set({ [KEY]: s });
    return s;
  }

  // Must run in the background service worker, not the popup — the popup is
  // destroyed when the auth window steals focus, killing the pending flow.
  async function signIn() {
    const { url } = cfg();
    if (!url) throw new Error("Supabase isn’t configured (see config.js)");
    const redirect = chrome.identity.getRedirectURL(); // https://<ext-id>.chromiumapp.org/
    const authUrl = `${url}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirect)}`;
    const finalUrl = await chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true });
    const frag = new URL(finalUrl).hash.slice(1);
    const p = new URLSearchParams(frag);
    const at = p.get("access_token");
    if (!at) throw new Error(p.get("error_description") || "Sign-in was cancelled");
    return saveSession(at, p.get("refresh_token"), parseInt(p.get("expires_in") || "3600", 10));
  }

  async function signOut() { await del(KEY); }

  async function refresh(s) {
    const { url, anonKey } = cfg();
    const res = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: s.refresh_token })
    });
    if (!res.ok) throw new Error("refresh failed");
    const j = await res.json();
    return saveSession(j.access_token, j.refresh_token, j.expires_in);
  }

  async function session() {
    let s = await get(KEY);
    if (!s) return null;
    if (Date.now() > s.expires_at - 60000) {
      try { s = await refresh(s); } catch (e) { await del(KEY); return null; }
    }
    return s;
  }

  async function rest(path, opts) {
    const { url, anonKey } = cfg();
    const s = await session();
    if (!s) return { needAuth: true };
    const res = await fetch(`${url}/rest/v1/${path}`, Object.assign({}, opts, {
      headers: Object.assign(
        { apikey: anonKey, Authorization: `Bearer ${s.access_token}`, "Content-Type": "application/json" },
        (opts && opts.headers) || {}
      )
    }));
    return res;
  }

  async function list() {
    const r = await rest("cheatsheet_items?select=concept_id");
    if (r.needAuth) return { needAuth: true };
    if (!r.ok) return { saved: [] };
    const j = await r.json();
    return { saved: j.map(x => x.concept_id) };
  }
  async function save(id) {
    const s = await session();
    if (!s) return { needAuth: true };
    const r = await rest("cheatsheet_items", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ user_id: s.user_id, concept_id: id })
    });
    return { ok: !!(r && r.ok) };
  }
  async function remove(id) {
    const r = await rest(`cheatsheet_items?concept_id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
    if (r.needAuth) return { needAuth: true };
    return { ok: !!(r && r.ok) };
  }

  self.DecoderSupa = { signIn, signOut, session, list, save, remove };
})();
