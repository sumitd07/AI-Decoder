'use strict';
// TypeSafe System One client (Jev). One function, raw fetch, no SDK — same
// shape as llm.js so the repo keeps zero runtime dependencies.
//
// Jev doesn't generate text. It answers typed questions (noul = probability of
// yes, choice, score) about a piece of state. Here it is only ever asked
// judgments; the generator stays in llm.js.
//
// 'mock' is the no-key, no-network path, for --dry-run.

const API_URL = 'https://api.typesafe.ai/v1/systemone';

// Pinned, not -latest: an eval number is only comparable to another run on the
// same model, and the alias moves (jev-latest → 1.13 today, 1.14 is preview).
const DEFAULT_MODEL = 'jev-1.13.0';

function resolveProvider(opts) {
  return (opts && opts.provider) || process.env.JEV_PROVIDER || 'typesafe';
}

function resolveModel(opts) {
  return (opts && opts.model) || process.env.JEV_MODEL || DEFAULT_MODEL;
}

// Same retry policy as llm.js: transient failures only. A lost row would score
// as a gate failure, which reads as a product result rather than a network one.
async function withRetry(fn, attempts = 3) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const msg = String((e && e.message) || e);
      const retriable = /overload|unavailable|rate|timeout|fetch failed|ECONNRESET|503|502|500|429/i.test(msg);
      if (!retriable || i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, i) + Math.random() * 300));
    }
  }
  throw last;
}

async function typesafeOnce({ state, questions, model }) {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) throw new Error('jev provider: TYPESAFE_API_KEY is not set');

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, state, questions }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (body && (body.error && (body.error.message || body.error))) || `HTTP ${res.status}`;
    throw new Error(`jev: ${typeof msg === 'string' ? msg : JSON.stringify(msg)} (HTTP ${res.status})`);
  }
  return { answers: body.answers || {}, model: body.model || model, usage: body.usage || null };
}

// Deterministic fake: a stable pseudo-probability per (state, question) so a
// dry run exercises thresholds and reporting without pretending to be right.
function mockOnce({ state, questions, model }) {
  const answers = {};
  for (const [id, q] of Object.entries(questions)) {
    const s = JSON.stringify(state) + id;
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    if (q.type === 'noul') answers[id] = { type: 'noul', noul: (h % 1000) / 1000 };
  }
  return { answers, model: `mock(${model})`, usage: { input_tokens: 0, output_tokens: 0 } };
}

async function systemOne({ state, questions }, opts = {}) {
  const provider = resolveProvider(opts);
  const model = resolveModel(opts);
  const started = Date.now();
  const out = provider === 'mock'
    ? mockOnce({ state, questions, model })
    : await withRetry(() => typesafeOnce({ state, questions, model }));
  return { ...out, ms: Date.now() - started };
}

module.exports = { systemOne, DEFAULT_MODEL, resolveModel, resolveProvider };
