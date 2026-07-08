(function () {
  "use strict";
  const DATA = window.DECODER_CONCEPTS || [];
  const STATUS = window.DECODER_STATUS || {};
  const byId = id => DATA.find(c => c.id === id);
  const listEl = document.getElementById("list");
  const toggleEl = document.getElementById("toggle");

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

  function paintToggle(on) { toggleEl.classList.toggle("on", on); }
  toggleEl.addEventListener("click", () => {
    chrome.storage.local.get(["decoder.enabled"], r => {
      const next = r["decoder.enabled"] === false; // flip
      chrome.storage.local.set({ "decoder.enabled": next }, () => paintToggle(next));
    });
  });

  // init
  chrome.storage.local.get(["decoder.enabled"], r => paintToggle(r["decoder.enabled"] !== false));
  loadSaved(render);
})();
