(function () {
  "use strict";
  let DATA = window.DECODER_CONCEPTS || [];
  let STATUS = window.DECODER_STATUS || {};
  const Supa = self.DecoderSupa;
  const byId = id => DATA.find(c => c.id === id);

  // Prefer fresher concepts cached by the background worker (fetched from aidecoder.app).
  // If cache has more terms than the bundled file, swap in and re-render.
  function tryCachedConcepts() {
    try {
      chrome.storage.local.get("decoder.conceptsData", store => {
        if (chrome.runtime.lastError) return;
        const cached = store["decoder.conceptsData"];
        if (!cached || !cached.concepts || cached.concepts.length <= DATA.length) return;
        DATA = cached.concepts;
        if (cached.status) STATUS = cached.status;
        renderAll();
      });
    } catch (e) {}
  }
  const listEl = document.getElementById("list");
  const noticeEl = document.getElementById("notice");
  const enableEl = document.getElementById("enable");
  const featuresEl = document.getElementById("features");
  const accountEl = document.getElementById("account");
  const ALL = { origins: ["<all_urls>"] };

  // Two surfaces, two switches. They are separate because they are separate
  // products to a reader: the highlighter marks up every page it can, the decoder
  // only ever runs when asked and costs a model call each time. Someone who wants
  // one and not the other should not have to give up both.
  const FEATURES_KEY = "decoder.features";
  const FEATURE_DEFAULTS = { highlight: true, decode: true };
  const FEATURE_ROWS = [
    { key: "highlight", name: "Highlight terms", desc: "Underline AI terms on the pages you read." },
    { key: "decode", name: "Decode sentences", desc: "Highlight a sentence to get it in plain English." }
  ];
  let features = Object.assign({}, FEATURE_DEFAULTS);

  const GOOGLE_G = `<svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" style="flex:none"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.24 1.06-3.72 1.06-2.86 0-5.28-1.93-6.15-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.85 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.67-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.05l3.67 2.84C6.72 7.3 9.14 5.38 12 5.38z"/></svg>`;

  let signedIn = false;

  const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  function nudgeFor(c) {
    if (c.status === "Fading") return "This term is fading. Worth recognizing, not worth relying on.";
    if (c.status === "Historical") return "Mostly historical now. Useful to recognize, not in active use.";
    return null;
  }

  // ---- account / sign-in ----
  async function renderAccount() {
    let s = null;
    try { s = Supa ? await Supa.session() : null; } catch (e) { s = null; }
    signedIn = !!s;

    if (signedIn) {
      const email = (s && s.email) || "Signed in";
      const initial = (email[0] || "?").toUpperCase();
      accountEl.className = "acct hairline";
      accountEl.innerHTML = `
        <span class="avatar">${esc(initial)}</span>
        <span class="aemail" title="${esc(email)}">${esc(email)}</span>
        <button class="linkbtn" id="signoutBtn">Sign out</button>`;
      document.getElementById("signoutBtn").addEventListener("click", async () => {
        try { await chrome.runtime.sendMessage({ type: "signout" }); } catch (e) {}
        await renderAll();
      });
    } else {
      accountEl.className = "acct hairline";
      accountEl.innerHTML = `
        <span class="aemail">Sign in to save &amp; sync</span>
        <button class="gbtn" id="signinBtn">${GOOGLE_G}<span>Sign in</span></button>
        <p class="err" id="signinErr" hidden style="flex-basis:100%;margin:6px 0 2px"></p>`;
      document.getElementById("signinBtn").addEventListener("click", async () => {
        const btn = document.getElementById("signinBtn");
        const err = document.getElementById("signinErr");
        err.hidden = true;
        btn.disabled = true; btn.innerHTML = "Opening…";
        try {
          // Auth runs in the background worker (see background.js) so it survives the
          // popup closing. In the common case the OAuth window steals focus, Chrome
          // closes this popup, and this response never arrives — that's expected; the
          // next popup open reads the session background.js saved via Supa.session().
          const res = await chrome.runtime.sendMessage({ type: "signin" });
          if (res && res.ok) { await renderAll(); }
          else if (res && res.error) {
            btn.disabled = false; btn.innerHTML = `${GOOGLE_G}<span>Sign in</span>`;
            err.textContent = /configured/i.test(String(res.error)) ? "Sign-in isn't set up yet — add your Supabase keys to config.js." : "Sign-in didn't complete. Try again.";
            err.hidden = false;
          }
        } catch (e) {
          btn.disabled = false; btn.innerHTML = `${GOOGLE_G}<span>Sign in</span>`;
          err.textContent = /configured/i.test(String(e && e.message)) ? "Sign-in isn't set up yet — add your Supabase keys to config.js." : "Sign-in didn't complete. Try again.";
          err.hidden = false;
        }
      });
    }
  }

  // ---- saved terms (read from the account) ----
  function cardHTML(id) {
    const c = byId(id);
    if (!c) return "";
    const m = STATUS[c.status] || {};
    const n = nudgeFor(c);
    const nudge = n ? `<div class="nudge" style="color:${m.color};background:${m.bg}">${esc(n)}</div>` : "";
    return `
      <div class="card">
        <div class="row">
          <span class="badge" style="color:${m.color};background:${m.bg}"><span>${m.sym}</span><span>${m.label}</span></span>
          <button class="rm" data-remove="${esc(c.id)}" title="Remove">×</button>
        </div>
        <div class="term">${esc(c.term)}</div>
        <div class="one">${esc(c.oneLiner)}</div>
        ${nudge}
      </div>`;
  }

  async function renderList() {
    if (!signedIn) {
      listEl.innerHTML = `<div class="empty"><div class="glyph">🔖</div><p class="t1">Your saved terms are in your account</p><p class="t2">Sign in above to see and sync the terms you save.</p></div>`;
      return;
    }
    listEl.innerHTML = `<div class="loading">Loading your saved terms…</div>`;
    let res;
    try { res = await Supa.list(); } catch (e) { res = null; }
    if (res && res.needAuth) { await renderAccount(); return renderList(); }
    const saved = (res && res.saved) || [];
    if (!saved.length) {
      listEl.innerHTML = `<div class="empty"><div class="glyph">∅</div><p class="t1">Nothing saved yet.</p><p class="t2">On any page, click a highlighted term and save it. It shows up here.</p></div>`;
      return;
    }
    listEl.innerHTML = `<div class="count">${saved.length} saved</div>${saved.map(cardHTML).join("")}`;
  }

  listEl.addEventListener("click", async e => {
    const rm = e.target.closest("[data-remove]");
    if (!rm) return;
    const id = rm.getAttribute("data-remove");
    rm.disabled = true;
    try { await Supa.remove(id); } catch (e) {}
    await renderList();
  });

  // ---- opt-in: highlight on all sites (optional host permission) ----
  function renderEnable(granted) {
    if (granted) {
      enableEl.className = "status hairline";
      enableEl.innerHTML = `
        <span class="live"></span>
        <span class="grow">Decoder is on for every site</span>
        <button class="linkbtn" id="disableBtn">Turn off</button>`;
      document.getElementById("disableBtn").addEventListener("click", () => {
        chrome.permissions.remove(ALL, () => refreshEnable());
      });
    } else {
      enableEl.className = "enable-off";
      enableEl.innerHTML = `
        <p style="margin:0 0 9px;font-size:12px;line-height:1.5;color:#6a6e75">Turn Decoder on to underline AI terms as you read, and to decode any sentence you highlight. Terms are matched on your device; a sentence you choose to decode is sent to aidecoder.app.</p>
        <button class="btn primary" id="enableBtn">Enable on all sites</button>`;
      document.getElementById("enableBtn").addEventListener("click", () => {
        chrome.permissions.request(ALL, granted => {
          if (granted) { highlightActiveTabNow(); refreshEnable(); }
        });
      });
    }
  }

  // Inject into the currently open tab so it lights up without a reload.
  function highlightActiveTabNow() {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const tab = tabs && tabs[0];
      if (!tab || !tab.id) return;
      chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["content.css"] }).catch(() => {});
      chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["concepts.js", "content.js", "extract.js", "explain.js"] }).catch(() => {});
    });
  }

  // ---- feature switches ----
  function renderFeatures(granted) {
    // With no host access nothing runs on a page, so a switch here would be a
    // control over nothing. The opt-in card above is the real one at that point.
    if (!granted) { featuresEl.innerHTML = ""; return; }
    featuresEl.className = "feats hairline";
    featuresEl.innerHTML = FEATURE_ROWS.map(r => `
      <label class="frow${features[r.key] ? " on" : ""}" data-feat="${r.key}">
        <span class="ftext">
          <span class="fname">${esc(r.name)}</span>
          <span class="fdesc">${esc(r.desc)}</span>
        </span>
        <input type="checkbox" ${features[r.key] ? "checked" : ""} aria-label="${esc(r.name)}">
        <span class="sw"></span>
      </label>`).join("");
    featuresEl.querySelectorAll("input").forEach(input => {
      input.addEventListener("change", () => {
        const row = input.closest("[data-feat]");
        const key = row.getAttribute("data-feat");
        features[key] = input.checked;
        row.classList.toggle("on", input.checked);
        // Content scripts listen on storage.onChanged, so every open tab follows
        // this immediately — no reload, no message plumbing.
        try { chrome.storage.local.set({ [FEATURES_KEY]: features }); } catch (e) {}
      });
    });
  }

  function readFeatures(cb) {
    try {
      chrome.storage.local.get(FEATURES_KEY, store => {
        if (!chrome.runtime.lastError) features = Object.assign({}, FEATURE_DEFAULTS, store[FEATURES_KEY] || {});
        cb();
      });
    } catch (e) { cb(); }
  }

  // ---- one-time upgrade notice ----
  // background.js sets this flag only for the update that introduced decoding.
  // Someone who installed 1.1.0 fresh never sees it — they get the opt-in copy,
  // which already says a decoded sentence leaves the device.
  const UPGRADE_KEY = "decoder.upgradeNotice";
  function renderNotice() {
    if (!noticeEl) return;
    try {
      chrome.storage.local.get(UPGRADE_KEY, store => {
        if (chrome.runtime.lastError || !store[UPGRADE_KEY]) return;
        noticeEl.innerHTML = `
          <div class="notice">
            <button class="nclose" id="noticeClose" aria-label="Dismiss">&times;</button>
            <p class="ntitle">New: decode a whole sentence</p>
            <p class="nbody">Highlight any sentence and click Decode to get it in plain English. That sentence is sent to aidecoder.app to be explained — nothing else about the page goes with it. Switch it off below whenever you like.</p>
          </div>`;
        document.getElementById("noticeClose").addEventListener("click", () => {
          noticeEl.innerHTML = "";
          try { chrome.storage.local.remove(UPGRADE_KEY); } catch (e) {}
        });
      });
    } catch (e) {}
  }

  function refreshEnable() {
    chrome.permissions.contains(ALL, granted => {
      renderEnable(!!granted);
      readFeatures(() => renderFeatures(!!granted));
    });
  }
  async function renderAll() { await renderAccount(); await renderList(); }

  // init
  renderNotice();
  refreshEnable();
  renderAll();
  tryCachedConcepts();
})();
