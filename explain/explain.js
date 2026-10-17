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

// Experimental sense gate (explain/gate.js), off unless opts.gate === 'jev' or
// EXPLAIN_GATE=jev. Loaded lazily so the default path never touches it.
const NOTHING_TO_DECODE = "Nothing to decode here. The sentence doesn't use any glossary term in its AI sense.";

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

  // Sense gate: refusal as its own layer, ahead of generation. Fails open — a
  // gate error means today's behaviour, never a blank answer.
  let cards = r.cards;
  let gate = null;
  const gateMode = opts.gate || process.env.EXPLAIN_GATE || null;
  if (gateMode === 'jev') {
    try {
      const { applyGate } = require('./gate');
      gate = await applyGate(sentence, cards, { threshold: opts.gateThreshold, ...(opts.gateOpts || {}) });
      if (gate.skip) {
        return {
          restatement: NOTHING_TO_DECODE,
          terms: [],
          gaps: [],
          gateStatus: 'skip',
          _debug: debugFor({ r, index, started, gate, g: { model: null, usage: null, notes: ['gate_skip'] } }),
        };
      }
      cards = cards.filter((c) => gate.keep.includes(c.id));
    } catch (e) {
      gate = { error: e.message };
      // Fails open, but never silently: this line is the only trace in the
      // function logs that the gate was meant to run and didn't.
      console.error('explain: gate failed open: ' + e.message);
    }
  }

  const prompt = buildPrompt(sentence, cards);

  // Empty retrieval still generates. With no cards the model's job is to name
  // what isn't covered (D8) — that is the answer, not a reason to skip the call.
  const g = await generate(prompt, {
    ...opts.llmOpts,
    allowedCardIds: cards.map((c) => c.id),
  });

  return {
    restatement: g.output.restatement,
    terms: g.output.terms,
    gaps: g.output.gaps,
    gateStatus: gateStatusFor(gateMode, gate),
    _debug: debugFor({ r, index, started, gate, g }),
  };
}

// A coarse, secret-free label for whether the gate ran on this request, so a
// deploy can be checked from a curl: off | pass | skip | error:<cause>.
function gateStatusFor(gateMode, gate) {
  if (gateMode !== 'jev') return 'off';
  if (!gate) return 'error:other';
  if (!gate.error) return gate.skip ? 'skip' : 'pass';
  const msg = String(gate.error);
  if (/TYPESAFE_API_KEY is not set/i.test(msg)) return 'error:missing_key';
  if (/HTTP 40[13]/.test(msg)) return 'error:auth';
  if (/Cannot find module/i.test(msg)) return 'error:missing_module';
  if (/timeout|abort/i.test(msg)) return 'error:timeout';
  return 'error:other';
}

function debugFor({ r, index, started, gate, g }) {
  return {
    retrieved: r.cards.map((c) => ({ id: c.id, title: c.title, score: c.score, legs: c.legs })),
    legOutput: r.legOutput,
    retrieval: r.meta,
    gate,
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
  };
}

module.exports = { explain, gateStatusFor, _resetIndexCache: () => { cachedIndex = null; } };
