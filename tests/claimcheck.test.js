'use strict';
// Claim check (explain/claimcheck.js): splitting and the threshold policy.
// Jev itself is stubbed; the question wording is judged by eval/claims-jev.js.

const { test } = require('node:test');
const assert = require('node:assert');
const jev = require('../explain/providers/jev');

function load() {
  delete require.cache[require.resolve('../explain/claimcheck')];
  return require('../explain/claimcheck');
}

test('splitClaims cuts a restatement into its sentences', () => {
  const { splitClaims } = load();
  assert.deepStrictEqual(splitClaims('A job post. They build agents! Why? Cost.'), ['A job post.', 'They build agents!', 'Why?', 'Cost.']);
  assert.deepStrictEqual(splitClaims(''), []);
  assert.deepStrictEqual(splitClaims(undefined), []);
});

test('flagged returns claims under the threshold and ignores unknowns', () => {
  const { flagged } = load();
  const checks = [{ i: 0, p: 0.9 }, { i: 1, p: 0.1 }, { i: 2, p: null }];
  assert.deepStrictEqual(flagged(checks, 0.3).map((c) => c.i), [1]);
  assert.deepStrictEqual(flagged(checks, 0.95).map((c) => c.i), [0, 1]);
});

test('checkClaims asks one question per claim with the gaps as uncovered terms', async () => {
  const seen = [];
  const orig = jev.systemOne;
  jev.systemOne = async (req) => { seen.push(req.state); return { answers: { supported: { noul: 0.5 } }, ms: 1, usage: {}, model: 'stub' }; };
  try {
    const { checkClaims } = load();
    const out = await checkClaims('S.', { restatement: 'One. Two.', gaps: ['X'] }, [{ title: 'T', definition: 'D', id: 't' }]);
    assert.strictEqual(out.length, 2);
    assert.deepStrictEqual(seen.map((s) => s.claim), ['One.', 'Two.']);
    assert.deepStrictEqual(seen[0].uncovered_terms, ['X']);
    assert.deepStrictEqual(seen[0].cards, [{ title: 'T', definition: 'D' }]);
  } finally { jev.systemOne = orig; }
});
