// Explain This, surface 1b — sentence extraction.
//
// The pipeline expects ONE clean sentence, <= 1000 chars (explain/CONTRACT.md).
// A reader highlighting on a real page does not produce that: they grab half a
// sentence, or a sentence and a half, or drag across a two-column line break and
// pick up a footnote marker and a soft hyphen on the way.
//
// This file is the whole of that repair, kept pure and DOM-free so it can be
// tested in Node (tests/extract.test.js) — 1b's riskiest logic is the one part
// of it that never needs a browser to check.
//
// SOURCE OF TRUTH. The "How it works" page on aidecoder.app runs the same
// extraction, and Vercel's root is web/, so a copy has to live there:
//   cp extension/extract.js web/extract.js
// tests/extract.test.js fails if the two drift apart.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;   // node:test
  if (root) root.DecoderExtract = api;                                       // content script
})(typeof self !== 'undefined' ? self : null, function () {
  'use strict';

  const MAX = 1000;          // web/api/explain.js MAX_SENTENCE
  const MAX_SENTENCES = 3;   // D33 — past this we are summarising, which is out of scope
  const MIN_LETTERS = 8;     // a stray word or a number is not a sentence
  const CONTEXT = 400;       // chars of block text read either side for expansion
  const MAX_EXPAND = 300;    // never drag in more than this from one side

  // Words that end in a full stop without ending a sentence.
  const ABBR = new Set([
    'e.g', 'i.e', 'etc', 'vs', 'fig', 'al', 'cf', 'approx', 'dr', 'mr', 'mrs',
    'ms', 'prof', 'inc', 'ltd', 'no', 'eq', 'ref', 'vol', 'st', 'ca', 'viz',
    'jr', 'sr', 'ie', 'eg'
  ]);

  const OPENERS = '[A-Z0-9"\'“‘(\\[]';
  const CLOSERS = '["\'”’)\\]]';

  // ---- normalise -----------------------------------------------------------
  // Everything here is a repair for a way the *page* mangles text, never a
  // rewrite of what the author wrote. Nothing removes a word.
  function normalize(text) {
    if (!text) return '';
    return String(text)
      .replace(/­/g, '')                                  // soft hyphens (PDF-ish layouts)
      .replace(/[​-‍﻿]/g, '')                   // zero-width joiners
      .replace(/(\w)[-‐‑]\s*\n\s*(\w)/g, '$1$2')     // word split across a line break
      .replace(/\[\d{1,3}\]/g, '')                             // [12] footnote markers
      .replace(/[¹²³⁰-⁹]+/g, '')      // superscript footnote markers
      .replace(/\s+/g, ' ')                                    // newlines, tabs, column gutters
      .trim();
  }

  // ---- sentence splitting --------------------------------------------------
  function splitSentences(text) {
    const out = [];
    const re = new RegExp('([.!?]+)(' + CLOSERS + '*)(\\s+|$)', 'g');
    let start = 0, m;
    while ((m = re.exec(text))) {
      const end = m.index + m[1].length + m[2].length;
      const head = text.slice(start, end);
      if (!m[3]) break;                                         // terminator is the end of the string
      const next = text[re.lastIndex];
      if (m[1] === '.') {
        // "3. 5" never happens, but "Fig. 4" and "e.g. this" do.
        // Case matters: "J." is an initial, "top-k." is the end of a sentence.
        const word = (head.match(/([A-Za-z.]+)\.$/) || [null, ''])[1].replace(/\.$/, '');
        if (ABBR.has(word.toLowerCase())) continue;
        if (/^[A-Z]$/.test(word)) continue;                     // a single initial: "J. Doe"
        if (/^([A-Za-z]\.)+[A-Za-z]$/.test(word)) continue;     // "U.S.A"
      }
      if (next && !new RegExp('^' + OPENERS).test(next)) continue;  // lowercase after: not a boundary
      const t = head.trim();
      if (t) out.push(t);
      start = re.lastIndex;
    }
    const rest = text.slice(start).trim();
    if (rest) out.push(rest);
    return out;
  }

  // ---- boundary expansion --------------------------------------------------
  // A partial selection is completed from the surrounding block, never beyond it.
  // If no boundary is within MAX_EXPAND we decline to expand rather than drag in
  // a paragraph — a slightly clipped sentence beats a wrong one.
  function leftFill(before) {
    if (!before) return '';
    const m = before.match(new RegExp('[.!?]' + CLOSERS + '*\\s+([^.!?]*)$'));
    const fill = m ? m[1] : before;
    return fill.length > MAX_EXPAND ? '' : fill;
  }
  function rightFill(after) {
    if (!after) return '';
    const m = after.match(new RegExp('^[^.!?]*[.!?]+' + CLOSERS + '*'));
    const fill = m ? m[0] : '';
    return fill.length > MAX_EXPAND ? '' : fill;
  }

  function startsClean(sel, before) {
    if (!before.trim()) return true;
    if (new RegExp('[.!?]' + CLOSERS + '*$').test(before.trim())) return true;
    return false;
  }
  function endsClean(sel) {
    return new RegExp('[.!?]' + CLOSERS + '*$').test(sel);
  }

  // ---- the one entry point -------------------------------------------------
  // { selected, before, after } are raw page text; before/after are the block
  // text either side of the selection. Returns what to POST, or why not to.
  function prepare(input) {
    const raw = (input && input.selected) || '';
    const sel = normalize(raw);
    if (!sel) return { ok: false, reason: 'empty' };
    if ((sel.match(/[A-Za-z]/g) || []).length < MIN_LETTERS) return { ok: false, reason: 'too_short' };

    const rawBefore = ((input && input.before) || '').slice(-CONTEXT);
    const rawAfter = ((input && input.after) || '').slice(0, CONTEXT);
    const before = normalize(rawBefore);
    const after = normalize(rawAfter);

    // Whether the selection began mid-word decides whether the join takes a
    // space. Read it off the RAW text — normalise() has already collapsed it.
    const joinL = /\s$/.test(rawBefore) || /^\s/.test(raw);
    const joinR = /\s$/.test(raw) || /^\s/.test(rawAfter);

    let left = '', right = '';
    if (!startsClean(sel, before)) left = leftFill(before);
    if (!endsClean(sel)) right = rightFill(after);

    let text = sel;
    if (left) text = left + (joinL || /\s$/.test(left) ? ' ' : '') + text;
    if (right) text = text + (joinR || /^\s/.test(right) ? ' ' : '') + right;
    text = normalize(text);

    const expanded = Boolean(left || right);
    let sentences = splitSentences(text);
    if (!sentences.length) sentences = [text];
    const found = sentences.length;
    let trimmed = false;

    // D33: keep whole sentences, up to three, up to the character cap. Cutting
    // to the FIRST sentence would routinely drop the one the reader was stuck on.
    if (found > MAX_SENTENCES) { sentences = sentences.slice(0, MAX_SENTENCES); trimmed = true; }
    let out = sentences.join(' ');
    while (out.length > MAX && sentences.length > 1) {
      sentences.pop(); trimmed = true;
      out = sentences.join(' ');
    }
    if (out.length > MAX) {                                    // one sentence, still too long
      out = out.slice(0, MAX + 1).replace(/\s+\S*$/, '').slice(0, MAX);
      trimmed = true;
    }
    out = out.trim();
    if (!out) return { ok: false, reason: 'empty' };

    return { ok: true, text: out, sentences: Math.min(found, MAX_SENTENCES), found, trimmed, expanded };
  }

  return { prepare, normalize, splitSentences, MAX, MAX_SENTENCES, MIN_LETTERS, CONTEXT };
});
