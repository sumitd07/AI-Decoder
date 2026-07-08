(function () {
  "use strict";
  const DATA = window.DECODER_CONCEPTS || [];
  const STATUS = window.DECODER_STATUS || {};
  const ACCENT = "#4f77a6";
  const UI_FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,'Helvetica Neue',Arial,sans-serif";

  // ---- build alias index + matching regexes ----
  const aliasPairs = [];
  DATA.forEach(c => c.aliasList.forEach(a => aliasPairs.push([a, c.id])));
  aliasPairs.sort((a, b) => b[0].length - a[0].length); // longest-first: "context window" before "context"
  const aliasMap = new Map(aliasPairs.map(([a, id]) => [a.toLowerCase(), id]));
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = aliasPairs.map(([a]) => esc(a)).join("|");
  const reFind = new RegExp("(?<![\\w-])(" + pattern + ")(?![\\w-])", "gi");
  const reTest = new RegExp("(?<![\\w-])(" + pattern + ")(?![\\w-])", "i");
  const byId = id => DATA.find(c => c.id === id);

  let enabled = true;
  let scanTimer = null;
  let pending = new Set();
  let observer = null;
  let pop = null;
  let toastEl = null, toastTimer = null;

  // ---- storage helpers ----
  function getSaved(cb) {
    try { chrome.storage.local.get(["decoder.saved"], r => cb(Array.isArray(r["decoder.saved"]) ? r["decoder.saved"] : [])); }
    catch (e) { cb([]); }
  }
  function setSaved(arr) { try { chrome.storage.local.set({ "decoder.saved": arr }); } catch (e) {} }

  // ---- skip logic ----
  const SKIP_TAGS = /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|INPUT|SELECT|OPTION|CODE|PRE|SVG|CANVAS|BUTTON)$/;
  function skip(node) {
    let el = node.parentElement;
    while (el) {
      const tag = el.tagName;
      if (tag && SKIP_TAGS.test(tag)) return true;
      if (el.isContentEditable) return true;
      if (el.classList && (el.classList.contains("dcx-term") || el.classList.contains("dcx-ui"))) return true;
      el = el.parentElement;
    }
    return false;
  }

  // ---- highlight one text node ----
  function highlightNode(node) {
    const text = node.nodeValue;
    reFind.lastIndex = 0;
    let match, last = 0, frag = null;
    while ((match = reFind.exec(text))) {
      const id = aliasMap.get(match[0].toLowerCase());
      if (!id) continue;
      if (!frag) frag = document.createDocumentFragment();
      if (match.index > last) frag.appendChild(document.createTextNode(text.slice(last, match.index)));
      const span = document.createElement("span");
      span.className = "dcx-term";
      span.setAttribute("data-dcx-id", id);
      span.textContent = match[0];
      frag.appendChild(span);
      last = match.index + match[0].length;
    }
    if (frag) {
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      node.parentNode.replaceChild(frag, node);
    }
  }

  function scanRoot(root) {
    if (!root || (root.nodeType === 1 && root.classList && root.classList.contains("dcx-term"))) return;
    const start = root.nodeType === 3 ? (root.parentElement || document.body) : root;
    if (!start) return;
    const walker = document.createTreeWalker(start, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        if (skip(n)) return NodeFilter.FILTER_REJECT;
        return reTest.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) { nodes.push(n); if (nodes.length > 5000) break; }
    nodes.forEach(highlightNode);
  }

  function removeAllHighlights() {
    document.querySelectorAll(".dcx-term").forEach(s => {
      const t = document.createTextNode(s.textContent);
      s.parentNode && s.parentNode.replaceChild(t, s);
    });
    closePopover();
  }

  // ---- popover ----
  function badgeHTML(c) {
    const m = STATUS[c.status] || {};
    return `<span style="display:inline-flex;align-items:center;gap:5px;font-family:${UI_FONT};font-size:9px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:2px 7px;border-radius:20px;color:${m.color};background:${m.bg}"><span>${m.sym}</span><span>${m.label}</span></span>`;
  }
  function saveRowHTML(saved) {
    return saved
      ? `<button data-dcx-remove style="flex:1;background:none;border:none;cursor:pointer;padding:10px;font-size:12.5px;font-weight:600;color:#4a7c59"><span class="dcx-savepop">✓</span> Saved · remove</button>`
      : `<button data-dcx-save style="flex:1;background:none;border:none;cursor:pointer;padding:10px;font-size:12.5px;font-weight:600;color:${ACCENT}">＋ Save to my cheatsheet</button>`;
  }
  function renderPopover(c, saved) {
    const el = document.createElement("div");
    el.id = "dcx-pop";
    el.className = "dcx-ui";
    el.setAttribute("role", "dialog");
    el.style.cssText = "position:fixed;z-index:2147483647;left:-9999px;top:-9999px;transform:translateX(-50%);width:300px;max-width:calc(100vw - 24px);background:#ffffff;color:#0e0f12;border:1px solid rgba(20,24,33,0.12);border-radius:12px;box-shadow:0 12px 36px rgba(20,18,14,0.20);font-family:" + UI_FONT + ";overflow:hidden;animation:dcxrise .16s ease;line-height:normal;text-align:left";
    el.innerHTML = `
      <div style="padding:13px 15px 12px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          ${badgeHTML(c)}
          <span style="font-family:'Newsreader',Georgia,serif;font-weight:600;font-size:16px;line-height:1.1;letter-spacing:-.01em;color:#0e0f12">${c.term}</span>
          <button data-dcx-close aria-label="Close" style="margin-left:auto;background:none;border:none;cursor:pointer;color:#c6c9ce;font-size:15px;line-height:1;padding:2px">×</button>
        </div>
        <p style="margin:0 0 8px;font-size:13.5px;line-height:1.5;color:#22252b">${c.oneLiner}</p>
        <p style="margin:0 0 6px;font-size:12.5px;line-height:1.5;color:#4a4e55;font-style:italic">${c.analogy}</p>
        <p style="margin:0;font-size:12px;line-height:1.5;color:#787c83">${c.example}</p>
      </div>
      <div data-dcx-footer style="border-top:1px solid rgba(20,24,33,0.08);display:flex">${saveRowHTML(saved)}</div>`;
    return el;
  }
  function positionPop(el, rect) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = el.offsetWidth || 300, h = el.offsetHeight || 190;
    let left = rect.left + rect.width / 2;
    left = Math.min(Math.max(left, w / 2 + 8), vw - w / 2 - 8);
    let top = rect.bottom + 8;
    if (top + h > vh - 8 && rect.top - h - 8 > 8) top = rect.top - h - 8;
    el.style.left = left + "px";
    el.style.top = top + "px";
  }
  function closePopover() { if (pop) { pop.remove(); pop = null; } }

  function showPopover(id, anchor) {
    closePopover();
    const c = byId(id);
    if (!c) return;
    getSaved(saved => {
      const isSaved = saved.includes(id);
      pop = renderPopover(c, isSaved);
      document.body.appendChild(pop);
      positionPop(pop, anchor.getBoundingClientRect());
      pop.addEventListener("click", ev => {
        if (ev.target.closest("[data-dcx-close]")) { closePopover(); return; }
        if (ev.target.closest("[data-dcx-save]")) {
          getSaved(cur => {
            if (!cur.includes(id)) setSaved([...cur, id]);
            const footer = pop && pop.querySelector("[data-dcx-footer]");
            if (footer) footer.innerHTML = saveRowHTML(true);
            toast("Saved to my cheatsheet");
          });
          return;
        }
        if (ev.target.closest("[data-dcx-remove]")) {
          getSaved(cur => {
            setSaved(cur.filter(x => x !== id));
            const footer = pop && pop.querySelector("[data-dcx-footer]");
            if (footer) footer.innerHTML = saveRowHTML(false);
            toast("Removed from my cheatsheet");
          });
        }
      });
    });
  }

  // ---- toast ----
  function toast(msg) {
    if (toastEl) toastEl.remove();
    toastEl = document.createElement("div");
    toastEl.className = "dcx-ui";
    toastEl.style.cssText = "position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483647;background:#17181b;color:#fff;font-size:13px;font-weight:500;padding:10px 18px;border-radius:24px;box-shadow:0 8px 28px rgba(20,18,14,0.3);font-family:" + UI_FONT + ";animation:dcxtoast .2s ease";
    toastEl.textContent = msg;
    document.body.appendChild(toastEl);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl && toastEl.remove(); toastEl = null; }, 1900);
  }

  // ---- global interactions ----
  document.addEventListener("click", e => {
    const term = e.target.closest && e.target.closest(".dcx-term");
    if (term) { e.preventDefault(); e.stopPropagation(); showPopover(term.getAttribute("data-dcx-id"), term); return; }
    if (pop && !(e.target.closest && e.target.closest("#dcx-pop"))) closePopover();
  }, true);
  document.addEventListener("keydown", e => { if (e.key === "Escape") closePopover(); });
  window.addEventListener("scroll", () => closePopover(), true);
  window.addEventListener("resize", () => closePopover());

  // ---- dynamic pages ----
  function schedule() { clearTimeout(scanTimer); scanTimer = setTimeout(flush, 350); }
  function flush() {
    const roots = [...pending]; pending.clear();
    roots.forEach(r => { if (r && r.isConnected !== false) scanRoot(r); });
  }
  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(muts => {
      if (!enabled) return;
      for (const m of muts) for (const node of m.addedNodes) {
        if (node.nodeType === 1) {
          if (node.classList && (node.classList.contains("dcx-term") || node.classList.contains("dcx-ui"))) continue;
          pending.add(node);
        } else if (node.nodeType === 3 && node.parentElement) pending.add(node.parentElement);
      }
      if (pending.size) schedule();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
  function stopObserver() { if (observer) { observer.disconnect(); observer = null; } }

  // ---- react to popup toggle ----
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !("decoder.enabled" in changes)) return;
      const on = changes["decoder.enabled"].newValue !== false;
      if (on === enabled) return;
      enabled = on;
      if (enabled) { scanRoot(document.body); startObserver(); }
      else { stopObserver(); removeAllHighlights(); }
    });
  } catch (e) {}

  // ---- init ----
  function init() {
    if (!DATA.length) return;
    getEnabled(on => {
      enabled = on;
      if (!enabled) return;
      scanRoot(document.body);
      startObserver();
    });
  }
  function getEnabled(cb) {
    try { chrome.storage.local.get(["decoder.enabled"], r => cb(r["decoder.enabled"] !== false)); }
    catch (e) { cb(true); }
  }
  init();
})();
