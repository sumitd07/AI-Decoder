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

// ---- Explain This, surface 1b -------------------------------------------
// The content script cannot call the endpoint itself: a content-script fetch is
// subject to the PAGE's CORS and /api/explain sends no CORS headers. The worker
// has the extension's own origin and the host grant, so the call lives here.
//
// No backend work (D19/D31) — this posts the same body the Decode box posts and
// passes the response back untouched.
const EXPLAIN_URL = "https://aidecoder.app/api/explain";
const EXPLAIN_TIMEOUT = 45000;   // past the worst measured cold start (~20s)

async function explainSentence(sentence) {
  if (typeof sentence !== "string" || !sentence.trim()) return { ok: false, message: "Highlight a sentence first." };
  let granted = false;
  try { granted = await chrome.permissions.contains({ origins: ["https://aidecoder.app/*"] }); } catch (e) {}
  if (!granted) return { ok: false, message: "Turn on “Enable on all sites” from the Decoder toolbar to decode sentences." };

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), EXPLAIN_TIMEOUT);
  try {
    const res = await fetch(EXPLAIN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sentence }),
      signal: ctl.signal
    });
    let body = null;
    try { body = await res.json(); } catch (e) {}
    if (!res.ok) {
      // The endpoint's shape is { error: <machine code>, message?: <human text> }.
      // `error` alone ("method_not_allowed") is not reader-facing copy.
      const msg = body && typeof body.message === "string" ? body.message : "";
      return { ok: false, message: msg || (res.status >= 500 ? "Something went wrong on this end. Try again in a moment." : "Couldn’t decode that one. Try again.") };
    }
    return { ok: true, data: body };
  } catch (e) {
    return { ok: false, message: e && e.name === "AbortError"
      ? "That took too long. Try again — the second one is usually quick."
      : "Couldn’t reach the decoder. Check your connection and try again." };
  } finally { clearTimeout(timer); }
}

// A chip can name any of the ~1010 shelf cards; the extension bundles 95. The
// rest are read by id from the same Supabase the web app reads, with the anon
// key and no session — this is public glossary data, not account data.
const cardCache = new Map();
function rowToCard(r) {
  return {
    id: r.id, term: r.term, aliases: r.aliases || "", said: r.said || "",
    aliasList: r.alias_list || [], status: r.status || "Core",
    oneLiner: r.one_liner || "", analogy: r.analogy || "", example: r.example || "",
    related: r.related || [], deeper: r.deeper || ""
  };
}
async function getCard(id) {
  if (!id || typeof id !== "string") return { ok: false };
  if (cardCache.has(id)) return { ok: true, card: cardCache.get(id) };
  const cfg = self.DECODER_SUPABASE || {};
  if (!cfg.url || !cfg.anonKey) return { ok: false };
  try {
    const res = await fetch(cfg.url + "/rest/v1/rpc/get_concept", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.anonKey, Authorization: "Bearer " + cfg.anonKey },
      body: JSON.stringify({ concept_id: id })
    });
    if (!res.ok) return { ok: false };
    const rows = await res.json();
    if (!rows || !rows[0]) return { ok: false };
    const card = rowToCard(rows[0]);
    cardCache.set(id, card);
    return { ok: true, card };
  } catch (e) { return { ok: false }; }
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
      else if (msg && msg.type === "explain") sendResponse(await explainSentence(msg.sentence));
      else if (msg && msg.type === "getCard") sendResponse(await getCard(msg.id));
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
  js: ["concepts.js", "content.js", "extract.js", "explain.js"],   // content.js first: explain.js reads its bridge
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
