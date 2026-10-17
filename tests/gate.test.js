'use strict';
// Sense gate tests (explain/gate.js, D45). No network: Jev answers come from a
// stubbed provider so each routing case is pinned exactly.

const { test } = require('node:test');
const assert = require('node:assert');

const jev = require('../explain/providers/jev');
const { decide } = require('../explain/gate');

const CARDS = [
  { id: 'dropout', title: 'Dropout', aliases: [], definition: 'Randomly switching off neurons in training.' },
  { id: 'epoch', title: 'Epoch', aliases: [], definition: 'One full pass over the training data.' },
];

// Replace systemOne with canned probabilities: sense answers by card title,
// and one answer for the whole-sentence question.
function stubJev({ sense = {}, ai = 0.9, fail = false } = {}) {
  const original = jev.systemOne;
  jev.systemOne = async ({ state, questions }) => {
    if (fail) throw new Error('jev: HTTP 503');
    if (questions.sense) return { answers: { sense: { type: 'noul', noul: sense[state.term.title] ?? 0 } }, ms: 1, usage: null, model: 'stub' };
    return { answers: { ai: { type: 'noul', noul: ai } }, ms: 1, usage: null, model: 'stub' };
  };
  // gate.js destructured systemOne at load, so reload it against the stub.
  delete require.cache[require.resolve('../explain/gate')];
  const gate = require('../explain/gate');
  return { gate, restore: () => { jev.systemOne = original; delete require.cache[require.resolve('../explain/gate')]; } };
}

test('decide keeps only cards at or above the threshold', () => {
  const r = decide([{ id: 'a', p: 0.31 }, { id: 'b', p: 0.29 }, { id: 'c', p: null }], 0.3);
  assert.deepEqual(r.keep, ['a']);
  assert.equal(r.skip, false);
  assert.equal(decide([{ id: 'a', p: 0.1 }], 0.3).skip, true);
});

test('skips when no card is used in its glossary sense (a college dropout)', async () => {
  const { gate, restore } = stubJev({ sense: { Dropout: 0.01, Epoch: 0.02 }, ai: 0.9 });
  try {
    const r = await gate.applyGate('As a college dropout, he struggled.', CARDS);
    assert.equal(r.skip, true);
    assert.deepEqual(r.keep, []);
  } finally { restore(); }
});

test('skips when the sentence is not about AI, even if a card passes', async () => {
  const { gate, restore } = stubJev({ sense: { Dropout: 0.85 }, ai: 0.02 });
  try {
    assert.equal((await gate.applyGate('The weather dashboard was harrowing.', CARDS)).skip, true);
  } finally { restore(); }
});

test('passes through only the cards that matched', async () => {
  const { gate, restore } = stubJev({ sense: { Dropout: 0.95, Epoch: 0.1 }, ai: 0.97 });
  try {
    const r = await gate.applyGate('Dropout cut overfitting.', CARDS);
    assert.equal(r.skip, false);
    assert.deepEqual(r.keep, ['dropout']);
  } finally { restore(); }
});

test('a Jev failure surfaces as an error for explain.js to fail open on', async () => {
  const { gate, restore } = stubJev({ fail: true });
  try {
    await assert.rejects(() => gate.applyGate('Anything.', CARDS), /503/);
  } finally { restore(); }
});

test('gateStatusFor labels each outcome without leaking detail', () => {
  const { gateStatusFor } = require('../explain/explain');
  assert.strictEqual(gateStatusFor(null, null), 'off');
  assert.strictEqual(gateStatusFor('jev', { skip: true }), 'skip');
  assert.strictEqual(gateStatusFor('jev', { skip: false }), 'pass');
  assert.strictEqual(gateStatusFor('jev', { error: 'jev provider: TYPESAFE_API_KEY is not set' }), 'error:missing_key');
  assert.strictEqual(gateStatusFor('jev', { error: 'jev: Unauthorized (HTTP 401)' }), 'error:auth');
  assert.strictEqual(gateStatusFor('jev', { error: "Cannot find module './gate'" }), 'error:missing_module');
  assert.strictEqual(gateStatusFor('jev', { error: 'something odd' }), 'error:other');
});
