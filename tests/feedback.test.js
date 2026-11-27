'use strict';
// Answer feedback: validation, the /api/feedback handler, and the meta block the
// explain endpoint now returns. Supabase and the pipeline are stubbed; the real
// insert-only RLS is a live check (supabase/answer_feedback.sql).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateFeedback, kindOf, surfaceOf, saveFeedback, countAnswer } = require('../explain/feedback');
const feedbackHandler = require('../web/api/feedback');
const explainHandler = require('../web/api/explain');

const ID = '0b9f7a3e-2c4d-4e5f-8a9b-1c2d3e4f5a6b';
const good = (over = {}) => ({
  answer_id: ID, vote: 'down', reason: 'wrong', comment: ' too vague ', kind: 'answer', surface: 'web',
  sentence: 'We fine-tuned the model with LoRA.',
  answer: { restatement: 'They adjusted the model cheaply.', terms: [{ card_id: 'lora', surface: 'LoRA' }], gaps: ['fine-tuned'] },
  meta: { gate: 'pass', prompt_version: 'v2', shelf_version: 's1' },
  ...over,
});

function fakeRes() {
  const r = { statusCode: 0, headers: {}, body: undefined, ended: false };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.end = (b) => { r.ended = true; r.body = b === undefined ? undefined : JSON.parse(b); };
  return r;
}

test('a full thumbs-down becomes one row', () => {
  const { row, error } = validateFeedback(good());
  assert.equal(error, undefined);
  assert.equal(row.vote, 'down');
  assert.equal(row.reason, 'wrong');
  assert.equal(row.comment, 'too vague');
  assert.equal(row.kind, 'answer');
  assert.deepEqual(row.terms, [{ card_id: 'lora', surface: 'LoRA' }]);
  assert.equal(row.prompt_version, 'v2');
});

test('a bare vote needs no reason or comment', () => {
  const { row } = validateFeedback(good({ vote: 'up', reason: undefined, comment: 'ignored on up' }));
  assert.equal(row.vote, 'up');
  assert.equal(row.reason, null);
  assert.equal(row.comment, null);
});

test('bad input is refused', () => {
  assert.equal(validateFeedback(null).error, 'invalid_body');
  assert.equal(validateFeedback(good({ answer_id: 'nope' })).error, 'invalid_answer_id');
  assert.equal(validateFeedback(good({ vote: 'meh' })).error, 'invalid_vote');
  assert.equal(validateFeedback(good({ kind: 'x' })).error, 'invalid_kind');
  assert.equal(validateFeedback(good({ reason: 'is_ai' })).error, 'invalid_reason');          // declined-only reason on an answer
  assert.equal(validateFeedback(good({ vote: 'up', reason: 'wrong' })).error, 'invalid_reason'); // reasons are for thumbs-down
  assert.equal(validateFeedback(good({ sentence: 'x'.repeat(1001) })).error, 'invalid_sentence');
  assert.equal(validateFeedback(good({ answer: {} })).error, 'invalid_answer');
});

test('declined answers take their own reasons', () => {
  const { row } = validateFeedback(good({ kind: 'declined', reason: 'is_ai', answer: { restatement: 'Nothing to decode here.', terms: [], gaps: [] } }));
  assert.equal(row.reason, 'is_ai');
});

test('unknown surface is recorded as unknown, never trusted', () => {
  assert.equal(validateFeedback(good({ surface: 'evil' })).row.surface, 'unknown');
  assert.equal(surfaceOf('extension'), 'extension');
});

test('kindOf: gate skip or nothing named is a decline', () => {
  assert.equal(kindOf({ gateStatus: 'skip', terms: [], gaps: [] }), 'declined');
  assert.equal(kindOf({ gateStatus: 'pass', terms: [], gaps: [] }), 'declined');
  assert.equal(kindOf({ gateStatus: 'pass', terms: [{}], gaps: [] }), 'answer');
  assert.equal(kindOf({ gateStatus: 'off', terms: [], gaps: ['x'] }), 'answer');
});

test('saveFeedback posts an insert with minimal return', async () => {
  let seen;
  await saveFeedback({ a: 1 }, { fetchImpl: async (url, init) => { seen = { url, init }; return { ok: true }; } });
  assert.match(seen.url, /\/rest\/v1\/answer_feedback$/);
  assert.equal(seen.init.headers.prefer, 'return=minimal');
  assert.deepEqual(JSON.parse(seen.init.body), { a: 1 });
});

test('countAnswer never throws', async () => {
  await countAnswer({ surface: 'web', kind: 'answer', gate: 'pass' }, { fetchImpl: async () => { throw new Error('down'); } });
  await countAnswer({ surface: 'web', kind: 'answer', gate: 'pass' }, { fetchImpl: async () => ({ ok: false, status: 500, text: async () => '' }) });
});

test('POST /api/feedback: 204 on success, 400 on bad body, 502 on storage error', async () => {
  let saved = null;
  let res = fakeRes();
  await feedbackHandler({ method: 'POST', body: good() }, res, { save: async (row) => { saved = row; } });
  assert.equal(res.statusCode, 204);
  assert.equal(saved.answer_id, ID);

  res = fakeRes();
  await feedbackHandler({ method: 'POST', body: JSON.stringify(good({ vote: 'x' })) }, res, { save: async () => {} });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'invalid_vote');

  res = fakeRes();
  await feedbackHandler({ method: 'GET' }, res);
  assert.equal(res.statusCode, 405);

  res = fakeRes();
  const err = console.error; console.error = () => {};
  try { await feedbackHandler({ method: 'POST', body: good() }, res, { save: async () => { throw new Error('boom'); } }); }
  finally { console.error = err; }
  assert.equal(res.statusCode, 502);
  assert.deepEqual(res.body, { error: 'feedback_failed' });
});

test('/api/explain returns a meta block a vote can send back', async () => {
  const res = fakeRes();
  const fake = async () => ({ restatement: 'Plain.', terms: [{ card_id: 'rag', surface: 'RAG' }], gaps: [], gateStatus: 'pass', _debug: { shelf_version: 's9' } });
  await explainHandler({ method: 'POST', body: { sentence: 'We use RAG.', surface: 'web' } }, res, { explain: fake, skipCount: true });
  assert.equal(res.statusCode, 200);
  const m = res.body.meta;
  assert.match(m.answer_id, /^[0-9a-f-]{36}$/);
  assert.equal(m.kind, 'answer');
  assert.equal(m.gate, 'pass');
  assert.equal(m.prompt_version, 'v2');
  assert.equal(m.shelf_version, 's9');
  assert.equal(res.body._debug, undefined);
  // The meta it hands out validates as feedback.
  const v = validateFeedback({ answer_id: m.answer_id, vote: 'up', kind: m.kind, sentence: 'We use RAG.', answer: res.body, meta: m });
  assert.equal(v.error, undefined);
});
