'use strict';
// Retrieval tests. No network: the mock embedding provider carries every path.
// Mock vectors are noise by design, so nothing here asserts semantic QUALITY —
// only that the plumbing, the cut-offs and the lexical leg behave.

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

process.env.EMBED_PROVIDER = 'mock';

const { buildIndex, normalise, embedText, buildAliasMap } = require('../explain/index');
const { retrieve, lexicalLeg } = require('../explain/retrieve');
const { embed } = require('../explain/providers/embeddings');

const CARDS = [
  { id: 'rag', title: 'RAG', aliases: ['retrieval augmented generation'], definition: 'Hand the model documents to read before it answers.', examples: ['A support bot quoting your help docs.'], related: ['embeddings'] },
  { id: 'embeddings', title: 'Embeddings', aliases: ['embedding'], definition: 'Turning words into coordinates so closeness can be measured.', examples: [], related: [] },
  { id: 'vectordatabase', title: 'Vector database', aliases: ['vector db', 'vector store'], definition: 'A store built to find the nearest vectors fast.', examples: [], related: [] },
  { id: 'database', title: 'Database', aliases: [], definition: 'A store of records.', examples: [], related: [] },
  { id: 'agi', title: 'AGI', aliases: ['artificial general intelligence'], definition: 'A model as broadly capable as a person.', examples: [], related: [] },
  { id: 'artificialgeneralintelligence', title: 'Artificial general intelligence', aliases: ['agi'], definition: 'The same idea, filed twice on the shelf.', examples: [], related: [] },
  { id: 'ai', title: 'AI', aliases: [], definition: 'Two letters, deliberately too short to match on.', examples: [], related: [] },
];

async function makeIndex(cards = CARDS) {
  const { vectors, model } = await embed(cards.map(embedText), { provider: 'mock' });
  return buildIndex(cards, { vectors, version_id: 'test-1', embed_model: model, embed_task_type: 'RETRIEVAL_DOCUMENT' });
}

test('normalise strips punctuation and collapses whitespace', () => {
  assert.equal(normalise('  Multi-Agent   Systems! '), 'multi agent systems');
  assert.equal(normalise('Top-p / Top-k'), 'top p top k');
});

test('embedText is title + definition only (D14)', () => {
  const t = embedText(CARDS[0]);
  assert.ok(t.includes('RAG') && t.includes('Hand the model'));
  assert.ok(!t.includes('support bot'), 'examples must not be embedded');
});

test('alias_map maps one surface to several cards', () => {
  const map = buildAliasMap(CARDS);
  assert.deepEqual(map['agi'].sort(), ['agi', 'artificialgeneralintelligence']);
});

test('lexical: exact title hit', async () => {
  const idx = await makeIndex();
  const hits = lexicalLeg('We added RAG to the bot.', idx);
  assert.ok(hits.some((h) => h.id === 'rag'));
});

test('lexical: alias hit', async () => {
  const idx = await makeIndex();
  const hits = lexicalLeg('They used retrieval augmented generation.', idx);
  assert.ok(hits.some((h) => h.id === 'rag'));
});

test('lexical: word boundaries — a term inside a longer word does not match', async () => {
  const idx = await makeIndex();
  assert.equal(lexicalLeg('The ragged edge of the ragtime era.', idx).length, 0);
  assert.equal(lexicalLeg('Databases plural should not hit the singular card.', idx).filter((h) => h.id === 'database').length, 0);
});

test('lexical: 1-2 character surfaces never match', async () => {
  const idx = await makeIndex();
  const hits = lexicalLeg('AI is everywhere in AI writing about AI.', idx);
  assert.equal(hits.filter((h) => h.id === 'ai').length, 0);
});

test('lexical: longer surface beats a shorter overlapping one', async () => {
  const idx = await makeIndex();
  const hits = lexicalLeg('We put it in a vector database.', idx);
  const ids = hits.map((h) => h.id);
  assert.ok(ids.includes('vectordatabase'));
  assert.ok(!ids.includes('database'), 'the shorter overlapping surface must be suppressed');
});

test('lexical: a surface mapping to two cards returns both', async () => {
  const idx = await makeIndex();
  const ids = lexicalLeg('Talk of AGI is everywhere.', idx).map((h) => h.id).sort();
  assert.deepEqual(ids, ['agi', 'artificialgeneralintelligence']);
});

test('k caps the returned set', async () => {
  const idx = await makeIndex();
  const r = await retrieve('anything at all', { index: idx, k: 2 });
  assert.equal(r.cards.length, 2);
});

test('floor can empty the result — the negatives need this (D8)', async () => {
  const idx = await makeIndex();
  const r = await retrieve('a sentence with no glossary terms', { index: idx, floor: 99 });
  assert.deepEqual(r.cards, []);
});

test('weights change the order', async () => {
  const idx = await makeIndex();
  const lexHeavy = await retrieve('We put it in a vector database.', { index: idx, weights: { semantic: 0, lexical: 1 } });
  assert.equal(lexHeavy.cards[0].id, 'vectordatabase');
});

test('legs: semantic alone returns no lexical scores', async () => {
  const idx = await makeIndex();
  const r = await retrieve('We put it in a vector database.', { index: idx, legs: 'semantic' });
  assert.equal(r.legOutput.lexical.length, 0);
  assert.ok(r.cards.every((c) => c.legs.lexical === undefined));
});

test('legs: lexical alone returns no semantic scores', async () => {
  const idx = await makeIndex();
  const r = await retrieve('We put it in a vector database.', { index: idx, legs: 'lexical' });
  assert.equal(r.legOutput.semantic.length, 0);
  assert.ok(r.cards.every((c) => c.legs.semantic === undefined));
  assert.ok(r.cards.some((c) => c.id === 'vectordatabase'));
});

test('deterministic: same input twice is deep-equal', async () => {
  const idx = await makeIndex();
  const a = await retrieve('We put embeddings in a vector database.', { index: idx });
  const b = await retrieve('We put embeddings in a vector database.', { index: idx });
  assert.deepEqual(a.cards, b.cards);
});

test('buildIndex refuses vectors that do not align with cards', () => {
  assert.throws(() => buildIndex(CARDS, { vectors: [[1, 2]] }), /must align/);
});

test('a query embedded at the wrong width fails loudly', async () => {
  const idx = await makeIndex();
  idx.dims = 999;
  await assert.rejects(() => retrieve('anything', { index: idx }), /rebuild the index/);
});

test('the real 1010-card shelf export holds its invariants', () => {
  const cards = require(path.join(__dirname, '..', 'shelf', 'shelf-export.json'));
  assert.equal(cards.length, 1010);
  const ids = new Set(cards.map((c) => c.id));
  assert.equal(ids.size, cards.length, 'ids must be unique');
  assert.ok(cards.every((c) => c.title && c.definition), 'every card needs a title and a definition');
  for (const c of cards) for (const r of c.related) assert.ok(ids.has(r), `dangling related: ${c.id} -> ${r}`);
});
