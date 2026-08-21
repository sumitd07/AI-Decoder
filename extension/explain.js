// Explain This, surface 1b — highlight a sentence on any page, get it explained
// in place.
//
// NO BACKEND WORK (D19/D31). This file posts to the same endpoint the Decode box
// on aidecoder.app already uses, unchanged: POST { sentence } ->
// { restatement, terms:[{card_id,surface}], gaps:[] }. Everything 1b adds is
// surface: getting a clean sentence out of a messy page (extract.js) and putting
// the answer where the reader is (here). That split is the point — a failure in
// this file is known to be the surface, not the pipeline.
//
// The request itself goes through the service worker. A content-script fetch is
// subject to the PAGE's CORS, and /api/explain sends no CORS headers, so a direct
// call from here would be blocked on every site.
(function () {
  "use strict";
  if (window.__decoderExplainLoaded) return;
  window.__decoderExplainLoaded = true;

  const card = window.__decoderCard;             // bridge from content.js
  const EX = window.DecoderExtract;
  if (!card || !EX) return;                      // load order broken; stay silent rather than half-work

  const RESTRAINT_MAX = 48;                      // a selection this short may just be a term

  // 1b's own switch (popup.js writes it). Read independently of the highlighter's
  // so a failure here stays a 1b failure. Default on; only an explicit false is off.
  const FEATURES_KEY = "decoder.features";
  let decodeOn = true;
  try {
    chrome.storage.local.get(FEATURES_KEY, store => {
      if (chrome.runtime.lastError) return;
      const f = store[FEATURES_KEY] || {};
      decodeOn = f.decode !== false;
      if (!decodeOn) { hidePill(); closePanel(); }
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes[FEATURES_KEY]) return;
      decodeOn = (changes[FEATURES_KEY].newValue || {}).decode !== false;
      if (!decodeOn) { hidePill(); closePanel(); }
    });
  } catch (e) {}

  let pill = null, panel = null, pending = null, seq = 0;
  let waitTimer1 = null, waitTimer2 = null;
  // The panel belongs to a sentence, not to a pixel. Keeping the live Range means
  // the anchor is recomputed after a reflow — a mobile URL bar collapsing fires
  // resize, and a stale rect would strand the answer somewhere off the sentence.
  let anchorRange = null, anchorRect = null;
  function rectNow() {
    if (anchorRange) {
      try {
        const rects = anchorRange.getClientRects();
        if (rects && rects.length) return rects[rects.length - 1];
      } catch (e) { /* range detached by a page rewrite */ }
    }
    return anchorRect;
  }

  const esc = s => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  // ---- where the reader is -------------------------------------------------
  // Prefer the tightest text block. A whole <article> would hand extract.js
  // thousands of characters of context and let a bad expansion run for miles.
  const TEXT_BLOCK = "p,li,td,th,dd,dt,blockquote,figcaption,h1,h2,h3,h4,h5,h6,pre,section,article,div";
  function blockOf(node) {
    let el = node && node.nodeType === 3 ? node.parentElement : node;
    if (!el || !el.closest) return document.body;
    return el.closest(TEXT_BLOCK) || document.body;
  }

  function inNoGoZone(node) {
    let el = node && node.nodeType === 3 ? node.parentElement : node;
    while (el && el !== document.documentElement) {
      const tag = el.tagName;
      if (tag === "PRE" || tag === "CODE" || tag === "TEXTAREA" || tag === "INPUT") return true;
      if (el.isContentEditable) return true;
      if (el.classList && el.classList.contains("dcx-ui")) return true;
      el = el.parentElement;
    }
    return false;
  }

  // Read the block text either side of the selection. Ranges, not string search:
  // the same sentence can appear twice in a block and indexOf would find the wrong one.
  function contextFor(range) {
    const block = blockOf(range.commonAncestorContainer);
    let before = "", after = "";
    try {
      const pre = document.createRange();
      pre.selectNodeContents(block);
      pre.setEnd(range.startContainer, range.startOffset);
      before = pre.toString();
      const post = document.createRange();
      post.selectNodeContents(block);
      post.setStart(range.endContainer, range.endOffset);
      after = post.toString();
    } catch (e) { /* selection spans blocks — no context, selection stands alone */ }
    return { before, after };
  }

  // The rect the reader's eye is on: the END of the selection, where the cursor is.
  function endRect(range) {
    const rects = range.getClientRects();
    if (rects && rects.length) return rects[rects.length - 1];
    return range.getBoundingClientRect();
  }

  function currentSelection() {
    if (!decodeOn) return null;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    const text = sel.toString();
    if (!text || !text.trim()) return null;
    if (inNoGoZone(range.commonAncestorContainer)) return null;
    const ctx = contextFor(range);
    const prepared = EX.prepare({ selected: text, before: ctx.before, after: ctx.after });
    if (!prepared.ok) return null;
    return { prepared, range: range.cloneRange(), rect: endRect(range), raw: text };
  }

  // ---- placement -----------------------------------------------------------
  // Document coordinates, not fixed: the answer belongs to the sentence, so it
  // scrolls with it instead of following the viewport.
  function place(el, rect, gap) {
    const w = el.offsetWidth || 320, h = el.offsetHeight || 120;
    const docW = document.documentElement.clientWidth || window.innerWidth || w + 16;
    let left = rect.left + rect.width / 2 + window.scrollX;
    // On a viewport narrower than the element the two clamp bounds cross over and
    // naive clamping shoves it off the left edge. Centre it instead.
    const lo = w / 2 + 8, hi = docW - w / 2 - 8;
    left = hi < lo ? docW / 2 : Math.min(Math.max(left, lo), hi);
    const below = rect.bottom + gap;
    const above = rect.top - h - gap;
    const useAbove = below + h > window.innerHeight - 8 && above > 8;
    el.style.left = left + "px";
    el.style.top = (useAbove ? rect.top - h - gap : rect.bottom + gap) + window.scrollY + "px";
    el.setAttribute("data-dcx-side", useAbove ? "above" : "below");  // transform-origin follows the anchor
  }

  // ---- the trigger ---------------------------------------------------------
  // A button, never selectionchange (D32). Every call costs money and there is
  // no rate limit yet; a highlight is far too easy a gesture to fire on.
  function hidePill() { if (pill) { pill.remove(); pill = null; } }

  function showPill(found, focus) {
    hidePill();
    pill = document.createElement("button");
    pill.type = "button";
    pill.className = "dcx-ui dcx-pill";
    pill.setAttribute("aria-label", "Decode this sentence");
    pill.textContent = "Decode";
    document.body.appendChild(pill);
    place(pill, found.rect, 8);
    pill.addEventListener("mousedown", e => e.preventDefault());   // keep the selection alive
    pill.addEventListener("click", e => {
      e.preventDefault(); e.stopPropagation();
      run(found);
    });
    // The pill is appended to <body>, so a keyboard user would have to tab the
    // whole page to reach it. Hand them focus — but only when the selection was
    // made with the keyboard, so a mouse drag never has focus yanked from it.
    if (focus) pill.focus({ preventScroll: true });
  }

  // ---- the panel -----------------------------------------------------------
  function closePanel() {
    clearTimeout(waitTimer1); clearTimeout(waitTimer2);
    if (panel) { panel.remove(); panel = null; }
    pending = null;
    anchorRange = null; anchorRect = null;
  }

  function ensurePanel(rect) {
    if (panel) return panel;
    panel = document.createElement("div");
    panel.id = "dcx-explain";
    panel.className = "dcx-ui dcx-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Decoded sentence");
    panel.setAttribute("aria-live", "polite");
    document.body.appendChild(panel);
    panel.addEventListener("click", onPanelClick);
    return panel;
  }

  function header() {
    return `<div class="dcx-panel-head">
      <span class="dcx-eyebrow">Decode</span>
      <button data-dcx-x class="dcx-x" aria-label="Close">×</button>
    </div>`;
  }

  function paint(html, rect) {
    const el = ensurePanel(rect);
    el.innerHTML = header() + html;
    place(el, rectNow() || rect, 10);
  }

  function paintLoading(rect) {
    paint(`<div class="dcx-row"><span class="dcx-spin" aria-hidden="true"></span><span data-dcx-wait>Decoding…</span></div>`, rect);
    // A silent spinner past a few seconds reads as hung, and a cold start on the
    // function is genuinely ~20s. Same copy as the Decode box on the web app.
    clearTimeout(waitTimer1); clearTimeout(waitTimer2);
    waitTimer1 = setTimeout(() => setWait("Decoding… first one after a while takes longer"), 4000);
    waitTimer2 = setTimeout(() => setWait("Still going — waking the decoder up"), 12000);
  }
  function setWait(msg) {
    const w = panel && panel.querySelector("[data-dcx-wait]");
    if (w) w.textContent = msg;
  }

  function paintError(msg, rect) {
    clearTimeout(waitTimer1); clearTimeout(waitTimer2);
    paint(`<p class="dcx-err" role="alert">${esc(msg)}</p>`, rect);
  }

  function paintAnswer(data, note, rect) {
    clearTimeout(waitTimer1); clearTimeout(waitTimer2);
    const chips = data.terms.length
      ? `<div class="dcx-chips">${data.terms.map(t =>
          `<button class="dcx-chip" data-dcx-chip="${esc(t.card_id)}">${esc(t.surface)}<span class="dcx-arrow" aria-hidden="true">→</span></button>`
        ).join("")}</div>`
      : "";
    const gaps = data.gaps.length
      ? `<p class="dcx-gaps">Not on the shelf yet: ${data.gaps.map(esc).join(", ")}.</p>`
      : "";
    const noteLine = note ? `<p class="dcx-note">${esc(note)}</p>` : "";
    paint(`<div class="dcx-answer"><p class="dcx-restate">${esc(data.restatement)}</p>${chips}${gaps}${noteLine}</div>`, rect);
  }

  // ---- chips ---------------------------------------------------------------
  // D28: never a /term/ URL. Four cards have no term page and one id contains a
  // space. The card opens in place, through content.js's own renderer.
  //
  // The endpoint answers from the full 1010-card shelf; the extension bundles 95.
  // So most chips are NOT local — they are fetched by id from the same Supabase
  // the web app reads, and a chip that still cannot be resolved says so instead
  // of opening an empty card.
  // The card opens BELOW the panel, not off the chip. A chip lives inside the
  // panel, so a chip-anchored popover lands on top of the restatement the reader
  // just read — two identical white cards, one covering the other. Stacked, it
  // reads as a drill-down.
  function cardAnchor(fallback) {
    return panel ? anchorProxy(panel.getBoundingClientRect()) : fallback;
  }

  function openChip(id, anchor) {
    if (card.has(id)) { card.show(id, cardAnchor(anchor)); return; }
    anchor.setAttribute("data-dcx-busy", "1");
    let done = false;
    const give = () => { if (!done) { done = true; anchor.removeAttribute("data-dcx-busy"); } };
    try {
      chrome.runtime.sendMessage({ type: "getCard", id }, resp => {
        give();
        if (chrome.runtime.lastError || !resp || !resp.ok || !resp.card) { card.toast("Couldn’t find that term."); return; }
        card.add(resp.card);
        card.show(resp.card.id, cardAnchor(anchor));
      });
    } catch (e) { give(); card.toast("Couldn’t find that term."); }
  }

  function onPanelClick(ev) {
    if (ev.target.closest("[data-dcx-x]")) { closePanel(); return; }
    const chip = ev.target.closest("[data-dcx-chip]");
    if (chip) { ev.preventDefault(); ev.stopPropagation(); openChip(chip.getAttribute("data-dcx-chip"), chip); }
  }

  // ---- the request ---------------------------------------------------------
  function noteFor(p) {
    if (!p.trimmed) return "";
    return p.found > EX.MAX_SENTENCES
      ? `Decoded the first ${EX.MAX_SENTENCES} sentences of that selection.`
      : "Decoded the first part of that selection.";
  }

  function run(found) {
    hidePill();
    const rect = found.rect;
    const sentence = found.prepared.text;

    // Restraint (PRD success criteria): a highlight that is just a shelf term is
    // answered from the bundled cards. No model call, no cost, and it is the
    // same card the underline would have opened.
    if (found.raw.trim().length <= RESTRAINT_MAX) {
      const id = card.aliasId(EX.normalize(found.raw));
      if (id && card.has(id)) { closePanel(); card.show(id, anchorProxy(rect)); return; }
    }

    const my = ++seq;
    pending = my;
    anchorRange = found.range || null;
    anchorRect = rect;
    paintLoading(rect);
    let answered = false;
    try {
      chrome.runtime.sendMessage({ type: "explain", sentence }, resp => {
        if (my !== seq) return;
        answered = true;
        if (chrome.runtime.lastError) { paintError("Couldn’t reach the decoder. Check your connection and try again.", rect); return; }
        if (!resp || !resp.ok) { paintError((resp && resp.message) || "Couldn’t decode that one. Try again in a moment.", rect); return; }
        const d = resp.data || {};
        const valid = typeof d.restatement === "string" && Array.isArray(d.terms) && Array.isArray(d.gaps);
        if (!valid) { paintError("Got a response that didn’t make sense. Try again.", rect); return; }
        paintAnswer({
          restatement: d.restatement,
          terms: d.terms.filter(t => t && typeof t.card_id === "string" && t.card_id && typeof t.surface === "string" && t.surface),
          gaps: d.gaps.filter(g => typeof g === "string" && g)
        }, noteFor(found.prepared), rect);
      });
    } catch (e) {
      paintError("Couldn’t reach the decoder. Reload the page and try again.", rect);
      return;
    }
    // The worker can be torn down mid-flight, and a dead callback leaves a
    // spinner that never resolves — indistinguishable from a broken page.
    setTimeout(() => { if (!answered && my === seq && panel) paintError("That took too long. Try again — the second one is usually quick.", rect); }, 47000);
  }

  // showPopover() positions against an element's rect. A selection has no
  // element, so stand one in at the same place.
  function anchorProxy(rect) {
    return { getBoundingClientRect: () => rect };
  }

  // ---- wiring --------------------------------------------------------------
  let settle = null;
  function evaluate(focus) {
    const found = currentSelection();
    if (!found) { hidePill(); return; }
    showPill(found, focus);
  }
  function schedule(focus) { clearTimeout(settle); settle = setTimeout(() => evaluate(focus), 10); }

  document.addEventListener("mouseup", e => {
    if (e.target.closest && e.target.closest(".dcx-ui")) return;
    schedule();
  });
  document.addEventListener("keyup", e => {
    if (e.shiftKey || e.key === "Shift" || /^(Arrow|Home|End|Page)/.test(e.key)) schedule(true);
  });
  document.addEventListener("selectionchange", () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) hidePill();
  });
  document.addEventListener("mousedown", e => {
    if (e.target.closest && e.target.closest(".dcx-ui")) return;
    hidePill();
    if (panel) closePanel();
  }, true);
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    if (panel) closePanel(); else hidePill();
  });
  window.addEventListener("resize", () => {
    hidePill();
    const r = rectNow();
    if (panel && r) place(panel, r, 10); else if (panel) closePanel();
  });
})();
