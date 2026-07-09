(function () {
  "use strict";
  const DATA = window.DECODER_CONCEPTS || [];
  const STATUS = window.DECODER_STATUS || {};
  const byId = id => DATA.find(c => c.id === id);
  const listEl = document.getElementById("list");
  const enableEl = document.getElementById("enable");
  const ALL = { origins: ["<all_urls>"] };

  function nudgeFor(c) {
    if (c.status === "Fading") return ["This term is fading. Worth recognizing, not worth relying on.", c];
    if (c.status === "Historical") return ["Mostly historical now. Useful to recognize, not in active use.", c];
    return null;
  }

  function render(saved) {
    if (!saved.length) {
      listEl.innerHTML = `
        <div class="empty">
          <div class="glyph">∅</div>
          <p class="t1">Nothing saved yet.</p>
          <p class="t2">Click a highlighted AI term on any page and save it. It shows up here.</p>
        </div>`;
      return;
    }
    const cards = saved.map(id => {
      const c = byId(id);
      if (!c) return "";
      const m = STATUS[c.status] || {};
      const n = nudgeFor(c);
      const nudge = n ? `<div class="nudge" style="color:${m.color};background:${m.bg}">${n[0]}</div>` : "";
      return `
        <div class="card">
          <div class="row">
            <span class="badge" style="color:${m.color};background:${m.bg}"><span>${m.sym}</span><span>${m.label}</span></span>
            <button class="rm" data-remove="${c.id}" title="Remove">×</button>
          </div>
          <div class="term">${c.term}</div>
          <div class="one">${c.oneLiner}</div>
          ${nudge}
        </div>`;
    }).join("");
    listEl.innerHTML = `<div class="count">${saved.length} saved</div>${cards}`;
  }

  function loadSaved(cb) {
    chrome.storage.local.get(["decoder.saved"], r => cb(Array.isArray(r["decoder.saved"]) ? r["decoder.saved"] : []));
  }

  listEl.addEventListener("click", e => {
    const rm = e.target.closest("[data-remove]");
    if (!rm) return;
    const id = rm.getAttribute("data-remove");
    loadSaved(saved => {
      const next = saved.filter(x => x !== id);
      chrome.storage.local.set({ "decoder.saved": next }, () => render(next));
    });
  });

  // ---- opt-in: highlight on all sites (optional host permission) ----
  function renderEnable(granted) {
    if (granted) {
      enableEl.className = "enable on";
      enableEl.innerHTML = `
        <p class="etitle"><span class="ok">✓</span> Highlighting is on for every site</p>
        <p class="edesc">AI terms are underlined automatically as you read. Click one for a plain-language explanation.</p>
        <button class="btn ghost" id="disableBtn">Turn off</button>`;
      document.getElementById("disableBtn").addEventListener("click", () => {
        chrome.permissions.remove(ALL, () => refresh());
      });
    } else {
      enableEl.className = "enable";
      enableEl.innerHTML = `
        <p class="etitle">Turn on highlighting</p>
        <p class="edesc">Decoder needs your OK to read pages so it can underline AI terms as you browse. It runs on your device only — nothing is sent anywhere.</p>
        <button class="btn primary" id="enableBtn">Enable on all sites</button>`;
      document.getElementById("enableBtn").addEventListener("click", () => {
        // must be called directly from the click (user gesture)
        chrome.permissions.request(ALL, granted => {
          if (granted) { highlightActiveTabNow(); refresh(); }
        });
      });
    }
  }

  // Inject into the tab that's open right now, so it lights up without a reload.
  function highlightActiveTabNow() {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const tab = tabs && tabs[0];
      if (!tab || !tab.id) return;
      chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["content.css"] }).catch(() => {});
      chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["concepts.js", "content.js"] }).catch(() => {});
    });
  }

  function refresh() {
    chrome.permissions.contains(ALL, granted => renderEnable(!!granted));
    loadSaved(render);
  }

  // init
  refresh();
})();
