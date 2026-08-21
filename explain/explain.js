'use strict';
// The pipeline (CONTRACT.md ## explain/explain.js): sentence in, output contract
// out. Deterministic, no agent loop, no retries (D1) — an agent's varying path
// would destroy attribution, and you cannot measure a retrieval change if the
// trajectory differs per run.
//
// Surface-agnostic on purpose. It does not know whether the sentence came from
// the Decode box or, later, from a highlight on someone's page (D19).

const { loadIndex } = require('./index');
const { retrieve } = require('./retrieve');
const { buildPrompt } = require('./prompt');
const { generate } = require('./generate');

let cachedIndex = null;

// Serverless keeps a warm process between requests, so loading a 1010-card index
// once instead of per-request is most of the latency budget.
function getIndex(opts) {
  if (opts && opts.index) return opts.index;
  if (!cachedIndex) cachedIndex = loadIndex(opts && opts.indexPath);
  return cachedIndex;
}

async function explain(sentence, opts = {}) {
  const started = Date.now();
  const index = getIndex(opts);

  const r = await retrieve(sentence, {
    index,
    k: opts.k ?? 5,
    floor: opts.floor ?? 0,
    semanticFloor: opts.semanticFloor ?? 0,
    weights: opts.weights || { semantic: 1.0, lexical: 0.5 },
    legs: opts.legs || 'both',
    embedOpts: opts.embedOpts || {},
  });

  const prompt = buildPrompt(sentence, r.cards);

  // Empty retrieval still generates. With no cards the model's job is to name
  // what isn't covered (D8) — that is the answer, not a reason to skip the call.
  const g = await generate(prompt, {
    ...opts.llmOpts,
    allowedCardIds: r.cards.map((c) => c.id),
  });

  return {
    restatement: g.output.restatement,
    terms: g.output.terms,
    gaps: g.output.gaps,
    _debug: {
      retrieved: r.cards.map((c) => ({ id: c.id, title: c.title, score: c.score, legs: c.legs })),
      legOutput: r.legOutput,
      retrieval: r.meta,
      model: g.model,
      embed_model: r.meta.embed_model,
      usage: g.usage,
      notes: g.notes || [],
      // The model's reply verbatim. Kept because a parse failure is undiagnosable
      // without it: the eval showed 32 empty rows and nothing to explain why.
      raw: g.raw || null,
      error: g.error || null,
      shelf_version: index.version_id || null,
      ms: Date.now() - started,
    },
  };
}

module.exports = { explain, _resetIndexCache: () => { cachedIndex = null; } };
