'use strict';
// Embedding provider wrapper (CONTRACT.md ## explain/providers/embeddings.js).
// Same shape as llm.js: which model embeds is an env change, never a code change.
//
// THIS BUILD: Gemini is the working provider (owner decision — no other key
// exists here). 'mock' is the no-key, no-network path every test runs against.

const DEFAULT_MODELS = { gemini: 'gemini-embedding-001', mock: 'mock' };
const MOCK_DIMS = 256;

// gemini-embedding-001 returns 3072 dims by default, which is ~40MB of JSON for a
// 1010-card shelf — too heavy to load inside a serverless function on every cold
// start (D20). 768 is the model's documented smaller output size and cuts the
// index to ~10MB. Overridable with EMBED_DIMS; must match between the index build
// and query time, which explain/index.js records and retrieve.js checks.
const DEFAULT_DIMS = 768;

// Gemini embeddings are asymmetric: a card is a document, the sentence is a
// query, and the model is trained to place them differently. Getting these
// backwards degrades retrieval quietly, so it is an explicit argument with no
// safe default — the index records which one built it (see explain/index.js).
const TASK_DOCUMENT = 'RETRIEVAL_DOCUMENT';
const TASK_QUERY = 'RETRIEVAL_QUERY';

function resolveProvider(opts) {
  return (opts && opts.provider) || process.env.EMBED_PROVIDER || 'gemini';
}

function resolveModel(provider, opts) {
  return (opts && opts.model) || process.env.EMBED_MODEL || DEFAULT_MODELS[provider] || DEFAULT_MODELS.gemini;
}

function resolveDims(opts) {
  return Number((opts && opts.dims) || process.env.EMBED_DIMS || DEFAULT_DIMS);
}

function providerInfo(opts = {}) {
  const provider = resolveProvider(opts);
  const model = resolveModel(provider, opts);
  const configured = provider === 'mock' ? true : Boolean(process.env.GEMINI_API_KEY);
  return { provider, model, dims: provider === 'mock' ? MOCK_DIMS : resolveDims(opts), configured };
}

async function embed(texts, opts = {}) {
  if (!Array.isArray(texts)) throw new TypeError('embed: texts must be an array');
  const provider = resolveProvider(opts);
  const model = resolveModel(provider, opts);
  const taskType = opts.taskType || TASK_DOCUMENT;
  if (!texts.length) return { vectors: [], model, dims: 0, taskType };

  if (provider === 'mock') return mockEmbed(texts, model, taskType);
  if (provider === 'gemini') return geminiEmbed(texts, { model, taskType, dims: resolveDims(opts), batchSize: opts.batchSize || 100 });
  throw new Error(`embed: unknown provider "${provider}"`);
}

// --- mock ------------------------------------------------------------------
// Deterministic: a seeded hash of the text spread over MOCK_DIMS, unit-normalised.
// It exists so the pipeline, the tests and --dry-run all run with no key. It is
// NOT a retrieval strategy — similar meanings do not land near each other. Any
// number that claims to describe retrieval quality must come from a real provider.
function mockEmbed(texts, model, taskType) {
  const vectors = texts.map((t) => {
    const v = new Array(MOCK_DIMS).fill(0);
    const s = String(t || '');
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
      v[h % MOCK_DIMS] += 1;
    }
    const norm = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1;
    return v.map((x) => x / norm);
  });
  return Promise.resolve({ vectors, model, dims: MOCK_DIMS, taskType, mock: true });
}

// --- gemini ----------------------------------------------------------------

async function geminiEmbed(texts, { model, taskType, dims, batchSize }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('embed: GEMINI_API_KEY is not set');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:batchEmbedContents`;
  const vectors = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const chunk = texts.slice(i, i + batchSize);
    const body = {
      requests: chunk.map((text) => ({
        model: `models/${model}`,
        content: { parts: [{ text: String(text || '') }] },
        taskType,
        outputDimensionality: dims,
      })),
    };
    const json = await postWithRetry(url, key, body);
    // Only the full 3072-dim output comes back unit-normalised. A truncated
    // vector does not, and cosine against un-normalised vectors is not cosine —
    // so normalise here rather than leaving it to whoever computes similarity.
    const got = (json.embeddings || []).map((e) => normaliseVector(e.values || []));
    if (got.length !== chunk.length) {
      throw new Error(`embed: gemini returned ${got.length} vectors for ${chunk.length} inputs`);
    }
    vectors.push(...got);
  }

  const got = vectors.length ? vectors[0].length : 0;
  // A ragged batch means one input silently embedded at a different size, which
  // makes every cosine against it meaningless. Fail here, not at query time.
  if (vectors.some((v) => v.length !== got)) throw new Error('embed: gemini returned mixed dimensions');
  if (got && dims && got !== dims) throw new Error(`embed: asked for ${dims} dims, got ${got}`);
  return { vectors, model, dims: got, taskType };
}

function normaliseVector(v) {
  const mag = Math.sqrt(v.reduce((a, x) => a + x * x, 0));
  return mag ? v.map((x) => x / mag) : v;
}

async function postWithRetry(url, key, body, attempt = 0) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
  });
  if (res.ok) return res.json();

  const retriable = res.status === 429 || res.status >= 500;
  if (retriable && attempt < 2) {
    await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
    return postWithRetry(url, key, body, attempt + 1);
  }
  const json = await res.json().catch(() => null);
  const msg = (json && json.error && json.error.message) || `HTTP ${res.status}`;
  throw new Error(`embed: gemini: ${msg}`);
}

module.exports = { embed, providerInfo, TASK_DOCUMENT, TASK_QUERY, DEFAULT_DIMS };
