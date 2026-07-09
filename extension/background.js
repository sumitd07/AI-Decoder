// Registers Decoder's content script on all sites — but ONLY once the user has
// granted the optional "all sites" permission (from the popup). Until then, the
// extension has no host access, so the store shows no broad-permission warning.

importScripts("config.js", "supa.js");

// Route cheatsheet reads/writes from the content script and popup through here,
// so account/token handling lives in one place.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg && msg.type === "list") sendResponse(await self.DecoderSupa.list());
      else if (msg && msg.type === "save") sendResponse(await self.DecoderSupa.save(msg.id));
      else if (msg && msg.type === "remove") sendResponse(await self.DecoderSupa.remove(msg.id));
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

chrome.runtime.onInstalled.addListener(sync);
chrome.runtime.onStartup.addListener(sync);
chrome.permissions.onAdded.addListener(sync);
chrome.permissions.onRemoved.addListener(sync);
