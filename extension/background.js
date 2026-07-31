// Registers Decoder's content script on all sites — but ONLY once the user has
// granted the optional "all sites" permission (from the popup). Until then, the
// extension has no host access, so the store shows no broad-permission warning.

importScripts("config.js", "supa.js");

// ---- Remote glossary: fetch concepts.json from the web app and cache in storage ----
const CONCEPTS_URL = "https://aidecoder.app/concepts.json";
const CONCEPTS_KEY = "decoder.conceptsData";

async function refreshConcepts() {
  try {
    const res = await fetch(CONCEPTS_URL, { cache: "no-cache" });
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.concepts && data.concepts.length) {
      await chrome.storage.local.set({ [CONCEPTS_KEY]: data });
      console.log("[decoder] cached", data.v, "terms from web app");
    }
  } catch (e) { console.warn("[decoder] concepts fetch failed (offline?)", e); }
}

// Route cheatsheet reads/writes from the content script and popup through here,
// so account/token handling lives in one place.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg && msg.type === "list") sendResponse(await self.DecoderSupa.list());
      else if (msg && msg.type === "save") sendResponse(await self.DecoderSupa.save(msg.id));
      else if (msg && msg.type === "remove") sendResponse(await self.DecoderSupa.remove(msg.id));
      // Auth runs here, not in the popup — the popup closes when the OAuth window opens,
      // which would kill launchWebAuthFlow before it could save the session.
      else if (msg && msg.type === "signin") { const s = await self.DecoderSupa.signIn(); sendResponse({ ok: true, email: s.email }); }
      else if (msg && msg.type === "signout") { await self.DecoderSupa.signOut(); sendResponse({ ok: true }); }
      else if (msg && msg.type === "getConcepts") {
        const store = await chrome.storage.local.get(CONCEPTS_KEY);
        sendResponse(store[CONCEPTS_KEY] || null);
      }
      else sendResponse({ ok: false });
    } catch (e) { sendResponse({ ok: false, error: String(e) }); }
  })();
  return true; // keep the channel open for the async response
});

const SCRIPT = {
  id: "decoder-highlighter",
  matches: ["<all_urls>"],
  js: ["concepts.js", "content.js"],
  css: ["content.css"],
  runAt: "document_idle"
};

async function hasAllSites() {
  try { return await chrome.permissions.contains({ origins: ["<all_urls>"] }); }
  catch (e) { return false; }
}

async function sync() {
  const granted = await hasAllSites();
  let registered = [];
  try { registered = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT.id] }); }
  catch (e) { registered = []; }
  const isRegistered = registered.length > 0;

  if (granted && !isRegistered) {
    try { await chrome.scripting.registerContentScripts([SCRIPT]); }
    catch (e) { console.warn("[decoder] register failed", e); }
  } else if (!granted && isRegistered) {
    try { await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT.id] }); }
    catch (e) { console.warn("[decoder] unregister failed", e); }
  }
}

chrome.runtime.onInstalled.addListener(() => { sync(); refreshConcepts(); });
chrome.runtime.onStartup.addListener(() => { sync(); refreshConcepts(); });
chrome.permissions.onAdded.addListener(sync);
chrome.permissions.onRemoved.addListener(sync);
