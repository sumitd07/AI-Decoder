'use strict';
// LLM provider wrapper (CONTRACT.md ## explain/providers/llm.js). One function
// per provider, all behind the same complete()/providerInfo() shape, so which
// model answers is an env change (LLM_PROVIDER, LLM_MODEL) — never a code
// change. D13 needs a 2-3 model bake-off against the golden set before a model
// is chosen; this file is what makes that possible.
//
// THIS BUILD: Gemini is the working provider — no Anthropic or OpenAI key is
// available in this environment (owner decision, superseding the original
// Anthropic-default brief). Anthropic and OpenAI are kept here as thin,
// unpolished alternatives so the bake-off stays possible the moment a key
// shows up; they are written to the same shape as Gemini but have not been
// exercised against a live API. 'mock' is the no-key, no-network path and is
// what every test in this repo runs against.

const DEFAULT_MODELS = {
  anthropic: 'claude-haiku-4-5-20251001',
  gemini: 'gemini-flash-lite-latest', // NOTE: keep the -latest alias. Pinned 2.0/2.5
                                       // ids are either retired or carry zero free-tier
                                       // quota on this account — a hard-pinned id fails
                                       // at runtime. Do not "fix" this back to a pin.
  openai: 'gpt-4o-mini',
  mock: 'mock',
};

function resolveProvider(opts) {
  // Default to the real provider, NOT mock. Defaulting to mock means a deploy that
  // forgets one env var serves `{"restatement":"mock restatement"}` with a 200 and
  // nobody notices — the same fake-answer hazard the preview server's canned
  // response had. Missing config should fail loudly instead: with no key, gemini
  // throws and the endpoint returns a clean 5xx.
  // Tests and --dry-run opt into mock explicitly, via LLM_PROVIDER=mock or opts.
  return (opts && opts.provider) || process.env.LLM_PROVIDER || 'gemini';
}

function resolveModel(provider, opts) {
  return (
    (opts && opts.model) ||
    process.env.LLM_MODEL ||
    DEFAULT_MODELS[provider] ||
    DEFAULT_MODELS.gemini
  );
}

function keyFor(provider) {
  if (provider === 'anthropic') return process.env.ANTHROPIC_API_KEY;
  if (provider === 'gemini') return process.env.GEMINI_API_KEY;
  if (provider === 'openai') return process.env.OPENAI_API_KEY;
  return null;
}

function providerInfo(opts = {}) {
  const provider = resolveProvider(opts);
  const model = resolveModel(provider, opts);
  const configured = provider === 'mock' ? true : Boolean(keyFor(provider));
  return { provider, model, configured };
}

async function complete({ system, user, maxTokens = 1024, temperature = 0 } = {}, opts = {}) {
  const provider = resolveProvider(opts);
  const model = resolveModel(provider, opts);

  if (provider === 'mock') return mockComplete({ model });
  if (provider === 'gemini') return geminiComplete({ system, user, maxTokens, temperature, model });
  if (provider === 'anthropic') return anthropicComplete({ system, user, maxTokens, temperature, model });
  if (provider === 'openai') return openaiComplete({ system, user, maxTokens, temperature, model });
  throw new Error(`llm provider: unknown provider "${provider}"`);
}

// mock — deterministic, no network, so tests never touch a key. Returns a
// fixed, valid output-contract JSON string so the mock path exercises the same
// downstream parse code a real provider's reply goes through.
function mockComplete({ model }) {
  const text = JSON.stringify({ restatement: 'mock restatement', terms: [], gaps: [] });
  return Promise.resolve({
    text,
    model: model || 'mock',
    usage: { input_tokens: 0, output_tokens: 0 },
  });
}

// --- gemini — the working provider in this build -----------------------

// Retry transient failures. Without this an eval run silently loses rows to
// "high demand" 503s and dropped sockets, and those rows score worst-case — which
// reads as a product failure rather than a network one. Only retries what is
// genuinely retriable; a 400 or a bad key fails immediately.
async function withRetry(fn, attempts = 3) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const msg = String((e && e.message) || e);
      const retriable = /high demand|overload|unavailable|rate|quota|timeout|fetch failed|ECONNRESET|503|502|500|429/i.test(msg);
      if (!retriable || i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, 1200 * Math.pow(2, i) + Math.random() * 400));
    }
  }
  throw last;
}

async function geminiComplete(args) {
  return withRetry(() => geminiCompleteOnce(args));
}

async function geminiCompleteOnce({ system, user, maxTokens, temperature, model }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('llm provider: GEMINI_API_KEY is not set');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': key, // never in the query string — that ends up in logs
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature,
        responseMimeType: 'application/json', // asked for properly; generate.js's
                                                // fence-tolerant parser is still the
                                                // backstop for when this is ignored
      },
    }),
  });

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (body && body.error && body.error.message) || `HTTP ${res.status}`;
    throw new Error(`gemini: ${msg}`);
  }

  const candidate = (body.candidates && body.candidates[0]) || {};
  const parts = (candidate.content && candidate.content.parts) || [];
  const text = parts.map((p) => p.text || '').join('');
  const usage = body.usageMetadata || {};

  return {
    text,
    model,
    usage: {
      input_tokens: usage.promptTokenCount || 0,
      output_tokens: usage.candidatesTokenCount || 0,
    },
  };
}

// --- anthropic — kept to the same shape, unpolished, unrun in this build ---
// Wired per the original brief (POST /v1/messages, x-api-key + anthropic-version
// headers, system as a top-level field) so it's ready the moment a key exists,
// but it has never been exercised against the live API in this environment.

async function anthropicComplete({ system, user, maxTokens, temperature, model }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('llm provider: ANTHROPIC_API_KEY is not set');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      system,
      max_tokens: maxTokens,
      temperature,
      messages: [{ role: 'user', content: user }],
    }),
  });

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (body && body.error && body.error.message) || `HTTP ${res.status}`;
    throw new Error(`anthropic: ${msg}`);
  }

  const text = ((body && body.content) || []).map((b) => b.text || '').join('');
  return {
    text,
    model: (body && body.model) || model,
    usage: {
      input_tokens: (body && body.usage && body.usage.input_tokens) || 0,
      output_tokens: (body && body.usage && body.usage.output_tokens) || 0,
    },
  };
}

// --- openai — kept to the same shape, unpolished, unrun in this build ---

async function openaiComplete({ system, user, maxTokens, temperature, model }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('llm provider: OPENAI_API_KEY is not set');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (body && body.error && body.error.message) || `HTTP ${res.status}`;
    throw new Error(`openai: ${msg}`);
  }

  const text = (body && body.choices && body.choices[0] && body.choices[0].message && body.choices[0].message.content) || '';
  const usage = (body && body.usage) || {};
  return {
    text,
    model: (body && body.model) || model,
    usage: {
      input_tokens: usage.prompt_tokens || 0,
      output_tokens: usage.completion_tokens || 0,
    },
  };
}

module.exports = { complete, providerInfo };
