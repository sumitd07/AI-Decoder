'use strict';
// Sentence extraction for surface 1b (extension/extract.js). Pure, no DOM, no
// network. The handover asked for "a small extraction test set of real messy
// selections, scored separately" — this is it: every case below is a shape a
// reader's highlight actually takes on a real page.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const E = require('../extension/extract.js');

// ---------------------------------------------------------------------------
// The web copy
// ---------------------------------------------------------------------------
// Vercel's root is web/, so the "How it works" page cannot reach
// extension/extract.js and needs a copy. Two copies drift; this fails when they
// do. Fix by re-copying, never by editing web/extract.js:
//   cp extension/extract.js web/extract.js
test('web/extract.js is a copy of the extension source, not a fork', () => {
  const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
  const copy = read('web', 'extract.js');
  assert.match(copy, /^\/\/ COPY — DO NOT EDIT HERE\./m, 'web/extract.js lost its "copy, do not edit" header');
  // Compare the code, not the header comments — the headers differ on purpose.
  const body = t => t.slice(t.indexOf('(function (root, factory)'));
  assert.equal(body(copy), body(read('extension', 'extract.js')),
    'web/extract.js has drifted from extension/extract.js — re-copy it: cp extension/extract.js web/extract.js');
});

// ---------------------------------------------------------------------------
// normalize
// ---------------------------------------------------------------------------

test('normalize: collapses the newlines a two-column layout leaves behind', () => {
  assert.equal(E.normalize('the retriever\n   returns\ttop-k'), 'the retriever returns top-k');
});

test('normalize: rejoins a word split by a hyphen at a line break', () => {
  assert.equal(E.normalize('retrie-\nval augmented'), 'retrieval augmented');
});

test('normalize: drops soft hyphens and zero-width characters', () => {
  assert.equal(E.normalize('aug­mented​ gener‍ation'), 'augmented generation');
});

test('normalize: drops footnote markers, bracketed and superscript', () => {
  assert.equal(E.normalize('grounded in retrieval[12] and reranking¹'), 'grounded in retrieval and reranking');
});

test('normalize: leaves a clean sentence alone', () => {
  const s = 'We reduced hallucination by tightening top-k.';
  assert.equal(E.normalize(s), s);
});

// ---------------------------------------------------------------------------
// splitSentences
// ---------------------------------------------------------------------------

test('splitSentences: one sentence stays one', () => {
  assert.deepEqual(E.splitSentences('We tightened top-k.'), ['We tightened top-k.']);
});

test('splitSentences: splits on a real boundary', () => {
  assert.deepEqual(
    E.splitSentences('We tightened top-k. Then we reranked.'),
    ['We tightened top-k.', 'Then we reranked.']
  );
});

test('splitSentences: does not split on e.g. / i.e. / etc.', () => {
  assert.deepEqual(
    E.splitSentences('Use a small model, e.g. Flash-Lite, for the first pass.'),
    ['Use a small model, e.g. Flash-Lite, for the first pass.']
  );
});

test('splitSentences: does not split on an initial', () => {
  assert.deepEqual(E.splitSentences('Written by J. Doe last year.'), ['Written by J. Doe last year.']);
});

test('splitSentences: does not split before a lowercase word', () => {
  assert.deepEqual(E.splitSentences('The model is v1.5 and it works.'), ['The model is v1.5 and it works.']);
});

test('splitSentences: keeps the closing quote with its sentence', () => {
  assert.deepEqual(
    E.splitSentences('He called it "grounding." Nobody agreed.'),
    ['He called it "grounding."', 'Nobody agreed.']
  );
});

test('splitSentences: a fragment with no terminator is still a sentence', () => {
  assert.deepEqual(E.splitSentences('tightening the retriever'), ['tightening the retriever']);
});

// ---------------------------------------------------------------------------
// prepare — refusals
// ---------------------------------------------------------------------------

test('prepare: an empty selection is refused', () => {
  assert.deepEqual(E.prepare({ selected: '   ' }), { ok: false, reason: 'empty' });
});

test('prepare: a selection with too few letters is refused, not sent', () => {
  assert.equal(E.prepare({ selected: 'top-k' }).reason, 'too_short');
  assert.equal(E.prepare({ selected: '42 %' }).reason, 'too_short');
});

// ---------------------------------------------------------------------------
// prepare — expansion
// ---------------------------------------------------------------------------

test('prepare: a mid-sentence selection is completed from both sides', () => {
  const r = E.prepare({
    selected: 'reduced hallucination by tightening the retriever',
    before: 'Last quarter we ',
    after: "'s top-k. Then we shipped it."
  });
  assert.equal(r.ok, true);
  assert.equal(r.expanded, true);
  assert.equal(r.text, "Last quarter we reduced hallucination by tightening the retriever's top-k.");
});

test('prepare: a selection starting mid-word joins without inserting a space', () => {
  const r = E.prepare({
    selected: 'ranking the candidates before assembly happens here',
    before: 'We tried re',
    after: '.'
  });
  assert.equal(r.text, 'We tried reranking the candidates before assembly happens here.');
});

test('prepare: a clean sentence is not expanded', () => {
  const r = E.prepare({
    selected: 'We reduced hallucination by tightening top-k.',
    before: 'Some earlier sentence ended here. ',
    after: ' And another one followed.'
  });
  assert.equal(r.expanded, false);
  assert.equal(r.text, 'We reduced hallucination by tightening top-k.');
});

test('prepare: expansion declines rather than dragging in a whole paragraph', () => {
  const r = E.prepare({
    selected: 'tightening the retriever and reranking the results',
    before: 'x'.repeat(350),   // no boundary anywhere near
    after: 'y'.repeat(350)
  });
  assert.equal(r.expanded, false);
  assert.equal(r.text, 'tightening the retriever and reranking the results');
});

test('prepare: no surrounding context at all still returns the selection', () => {
  const r = E.prepare({ selected: 'tightening the retriever top-k' });
  assert.equal(r.ok, true);
  assert.equal(r.expanded, false);
});

// ---------------------------------------------------------------------------
// prepare — multi-sentence and the cap
// ---------------------------------------------------------------------------

test('prepare: two sentences are both kept (D33)', () => {
  const r = E.prepare({ selected: 'We tightened top-k. Then we reranked the results.' });
  assert.equal(r.sentences, 2);
  assert.equal(r.trimmed, false);
  assert.equal(r.text, 'We tightened top-k. Then we reranked the results.');
});

test('prepare: a four-sentence drag is cut to the first three and says so', () => {
  const r = E.prepare({
    selected: 'One thing happened here. Two things happened here. Three things happened here. Four things happened here.'
  });
  assert.equal(r.found, 4);
  assert.equal(r.sentences, 3);
  assert.equal(r.trimmed, true);
  assert.equal(r.text.includes('Four things'), false);
});

test('prepare: never returns more than the endpoint accepts', () => {
  const long = ('the retriever reranks every candidate before assembly '.repeat(40)) + '.';
  const r = E.prepare({ selected: long });
  assert.equal(r.ok, true);
  assert.ok(r.text.length <= E.MAX, `expected <= ${E.MAX}, got ${r.text.length}`);
  assert.equal(r.trimmed, true);
});

test('prepare: over-long output is cut at a word boundary, not mid-word', () => {
  const long = 'grounding '.repeat(200);
  const r = E.prepare({ selected: long });
  assert.ok(r.text.length <= E.MAX);
  assert.doesNotMatch(r.text, /\s$/);
  assert.match(r.text, /grounding$/);
});

// ---------------------------------------------------------------------------
// prepare — the messy-page set
// ---------------------------------------------------------------------------

test('prepare: a two-column PDF drag with a footnote and a soft hyphen', () => {
  const r = E.prepare({
    selected: 'retrie-\nval aug­mented gener­ation[3]\n   grounds the answer',
    before: 'In practice ',
    after: ' in the source documents.'
  });
  assert.equal(r.text, 'In practice retrieval augmented generation grounds the answer in the source documents.');
});

test('prepare: a selection that overshoots into the next sentence keeps both', () => {
  const r = E.prepare({
    selected: 'tightening top-k reduced hallucination. Rerank',
    before: 'We found that ',
    after: 'ing came later.'
  });
  assert.equal(r.sentences, 2);
  assert.equal(r.text, 'We found that tightening top-k reduced hallucination. Reranking came later.');
});
