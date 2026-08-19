'use strict';
// Prompt, generation and endpoint tests. No network — the mock LLM provider
// carries every path.

const { test } = require('node:test');
const assert = require('node:assert');

process.env.LLM_PROVIDER = 'mock';
process.env.EMBED_PROVIDER = 'mock';

const { buildPrompt, SYSTEM } = require('../explain/prompt');
const { generate, extractJson } = require('../explain/generate');
const handler = require('../web/api/explain');

const CARDS = [
  { id: 'rag', title: 'RAG', definition: 'Hand the model documents to read before it answers.', examples: ['A support bot quoting your help docs.', 'An open-book exam.'] },
  { id: 'topk', title: 'Top-k', definition: 'How many candidates the retriever hands back.', examples: [] },
];

// --- prompt ----------------------------------------------------------------

test('prompt carries the sentence, every card, and the instruction (D18)', () => {
  const { system, user } = buildPrompt('We tightened the retriever top-k.', CARDS);
  assert.equal(system, SYSTEM);
  assert.ok(user.includes('We tightened the retriever top-k.'));
  for (const c of CARDS) {
    assert.ok(user.includes(c.title), `${c.title} missing`);
    assert.ok(user.includes(c.definition), `${c.id} definition missing`);
    assert.ok(user.includes(`card_id: ${c.id}`), `${c.id} id missing`);
  }
  assert.ok(user.includes('A support bot quoting your help docs.'), 'examples must be carried');
});

test('prompt handles a card with no examples', () => {
  const { user } = buildPrompt('x', [CARDS[1]]);
  assert.ok(user.includes('Top-k'));
  assert.ok(!user.includes('Example:'));
});

test('prompt handles zero cards and says the honest thing (D8)', () => {
  const { user } = buildPrompt('His last five movies were all flops.', []);
  assert.ok(user.includes('Cards: none'));
  assert.ok(/gap/i.test(user));
  assert.ok(user.includes('His last five movies were all flops.'));
});

test('the instruction names the banned constructions and the selectivity rule', () => {
  assert.ok(SYSTEM.includes('rather than'), 'the "rather than" tell must be named');
  assert.ok(/not just/.test(SYSTEM), 'the "X, not just Y" tell must be named');
  assert.ok(/the terms the sentence turns on/i.test(SYSTEM), 'D9 selectivity must be stated');
  assert.ok(/not load-bearing/i.test(SYSTEM), 'D9 must still say to ignore non-load-bearing cards');
  assert.ok(/never the example/i.test(SYSTEM), 'the D18 watch must be guarded');
});

// --- json extraction -------------------------------------------------------

test('extractJson: clean json', () => {
  assert.deepEqual(extractJson('{"restatement":"a"}'), { restatement: 'a' });
});

test('extractJson: fenced json', () => {
  assert.deepEqual(extractJson('```json\n{"restatement":"a"}\n```'), { restatement: 'a' });
});

test('extractJson: prose wrapped around the json', () => {
  assert.deepEqual(extractJson('Sure! {"restatement":"a"} Hope that helps.'), { restatement: 'a' });
});

test('extractJson: total garbage returns null', () => {
  assert.equal(extractJson('no json here at all'), null);
  assert.equal(extractJson(''), null);
});

// --- generate --------------------------------------------------------------

// generate.js destructures complete() at module load, so a patched provider only
// takes effect if generate.js is re-required afterwards. This helper does both and
// always restores, so one test can't leak a stub into the next.
async function withProviderReply(text, fn) {
  const llm = require('../explain/providers/llm');
  const original = llm.complete;
  llm.complete = async () => ({ text, model: 'stub', usage: { input_tokens: 1, output_tokens: 2 } });
  delete require.cache[require.resolve('../explain/generate')];
  try {
    return await fn(require('../explain/generate').generate);
  } finally {
    llm.complete = original;
    delete require.cache[require.resolve('../explain/generate')];
  }
}

test('generate returns the contract from a clean reply', async () => {
  const g = await generate({ system: 's', user: 'u' }, { provider: 'mock' });
  assert.equal(typeof g.output.restatement, 'string');
  assert.ok(Array.isArray(g.output.terms));
  assert.ok(Array.isArray(g.output.gaps));
});

test('generate never throws on garbage — it degrades and records why', async () => {
  await withProviderReply('¯\\_(ツ)_/¯ no json here', async (gen) => {
    const g = await gen({ system: 's', user: 'u' }, {});
    assert.deepEqual(g.output, { restatement: '', terms: [], gaps: [] });
    assert.ok(g.notes.includes('unparseable_json'));
    assert.equal(g.raw, '¯\\_(ツ)_/¯ no json here');
  });
});

test('generate coerces missing and wrong-typed fields', async () => {
  await withProviderReply(JSON.stringify({ terms: 'not an array', gaps: null }), async (gen) => {
    const g = await gen({ system: 's', user: 'u' }, {});
    assert.equal(g.output.restatement, '');
    assert.deepEqual(g.output.terms, []);
    assert.deepEqual(g.output.gaps, []);
    assert.ok(g.notes.includes('missing_restatement'));
    assert.ok(g.notes.includes('terms_not_array'));
  });
});

test('generate surfaces a provider failure instead of throwing', async () => {
  const llm = require('../explain/providers/llm');
  const original = llm.complete;
  llm.complete = async () => { throw new Error('gemini: quota exhausted'); };
  delete require.cache[require.resolve('../explain/generate')];
  try {
    const { generate: gen } = require('../explain/generate');
    const g = await gen({ system: 's', user: 'u' }, {});
    assert.deepEqual(g.output, { restatement: '', terms: [], gaps: [] });
    assert.ok(g.notes.includes('provider_error'));
    assert.match(g.error, /quota exhausted/);
  } finally {
    llm.complete = original;
    delete require.cache[require.resolve('../explain/generate')];
  }
});

test('generate drops a terms[] entry whose card_id was not retrieved', async () => {
  const reply = JSON.stringify({
    restatement: 'ok',
    terms: [{ card_id: 'rag', surface: 'RAG' }, { card_id: 'invented', surface: 'nope' }],
    gaps: ['reranking'],
  });
  await withProviderReply(reply, async (gen) => {
    const g = await gen({ system: 's', user: 'u' }, { allowedCardIds: ['rag'] });
    assert.deepEqual(g.output.terms, [{ card_id: 'rag', surface: 'RAG' }]);
    assert.deepEqual(g.output.gaps, ['reranking']);
    assert.ok(g.notes.some((n) => n.startsWith('dropped_unretrieved_card')));
  });
});

// --- endpoint --------------------------------------------------------------

function fakeRes() {
  return {
    statusCode: 0, headers: {}, body: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(b) { this.body = b ? JSON.parse(b) : null; },
  };
}

test('endpoint: 405 on GET', async () => {
  const res = fakeRes();
  await handler({ method: 'GET' }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, 'POST');
});

test('endpoint: 400 on a missing sentence', async () => {
  const res = fakeRes();
  await handler({ method: 'POST', body: {} }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'missing_sentence');
});

test('endpoint: 400 on an over-long sentence', async () => {
  const res = fakeRes();
  await handler({ method: 'POST', body: { sentence: 'x'.repeat(1001) } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'sentence_too_long');
  assert.equal(res.body.max, 1000);
});

test('endpoint: 400 on an unparseable body', async () => {
  const res = fakeRes();
  await handler({ method: 'POST', body: '{not json' }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'invalid_json');
});

test('endpoint: a backend failure returns a clean 5xx without leaking internals', async () => {
  const explainMod = require('../explain/explain');
  const original = explainMod.explain;
  explainMod.explain = async () => { throw new Error('GEMINI_API_KEY=AQ.secret leaked in an error'); };
  try {
    delete require.cache[require.resolve('../web/api/explain')];
    const h = require('../web/api/explain');
    const res = fakeRes();
    await h({ method: 'POST', body: { sentence: 'a real sentence' } }, res);
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.error, 'explain_failed');
    assert.ok(!JSON.stringify(res.body).includes('AQ.secret'), 'must not leak the provider error');
  } finally {
    explainMod.explain = original;
    delete require.cache[require.resolve('../web/api/explain')];
  }
});
