# Explain This — Phase 1 module contract

Fixed interfaces. Every module below is built against this file; nothing here changes
without the orchestrator changing it. Read `Mitsu/Docs/Explain-This-Technical.md` for
the why — this is only the shape.

Everything is **CommonJS**, Node 18+, **zero runtime dependencies**. The repo has no
`package.json` and no build step; keep it that way.

## Layout

```
explain/
  index.js               loadIndex / buildIndex
  retrieve.js            retrieve()
  prompt.js              buildPrompt()
  generate.js            generate()
  explain.js             explain()  — wraps retrieve → prompt → generate
  providers/embeddings.js
  providers/llm.js
scripts/build-index.js   offline: shelf-export.json → shelf/shelf-index.json
web/api/explain.js       Vercel serverless handler
eval/run.js              golden set → saved outputs
eval/score-retrieval.js  scored by code
eval/score-explanation.js judge
tests/                   node:test, no network
```

## Card

From `shelf/shelf-export.json`, 1010 of them:

```js
{ id, title, aliases: [], definition, examples: [], related: [] }
```

## Output contract (`Explain-This-Technical.md`)

```js
{
  restatement: '',                       // plain-English restatement of the sentence
  terms: [{ card_id: '', surface: '' }], // resolved terms, each linkable to its card
  gaps:  []                              // terms the sentence turns on, not on the shelf
}
```

## `explain/providers/embeddings.js`

```js
// provider: 'gemini' | 'mock'  (default from EMBED_PROVIDER, else 'gemini')
// taskType: 'RETRIEVAL_DOCUMENT' when embedding cards, 'RETRIEVAL_QUERY' for the sentence.
// These are asymmetric; getting them backwards quietly degrades retrieval, so it is
// an explicit argument rather than a default. The index records which was used.
async function embed(texts /* string[] */, opts) -> { vectors: number[][], model: string, dims: number }
function providerInfo(opts) -> { provider, model, dims, configured: boolean }
```

- Key from env only: `GEMINI_API_KEY`. Never hard-code, never read from a file, never log it.
- Default model `gemini-embedding-001`, overridable with `EMBED_MODEL`.
- `'mock'` is deterministic — a seeded hash of the text into a fixed-dim vector, unit-normalised.
  It exists so the pipeline and the tests run with no key and no network. It is not a
  retrieval strategy; anything scoring retrieval must use a real provider.
- Batches requests. Retries a 429/5xx twice with backoff. Throws a clear error if the key is missing.

## `explain/providers/llm.js`

```js
// provider: 'gemini' | 'mock'  (default from LLM_PROVIDER, else 'gemini')
//   Default is the REAL provider. Mock must be opted into — a mock default turns a
//   forgotten env var into a 200 OK full of invented text.
//   'anthropic' and 'openai' exist as unexercised alternatives — see the note below.
async function complete({ system, user, maxTokens, temperature }, opts)
  -> { text: string, model: string, usage: { input_tokens, output_tokens } }
function providerInfo(opts) -> { provider, model, configured: boolean }
```

- Key from env only: `GEMINI_API_KEY`.
- Default model `gemini-flash-lite-latest` — the small-fast tier D17 calls for —
  overridable with `LLM_MODEL`. Use the `-latest` aliases: pinned 2.0/2.5 ids are
  retired or carry zero free-tier quota on this account and fail at runtime.
- `POST https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent`,
  key in the `x-goog-api-key` header — never in the query string, where it lands in logs.
  System prompt goes in `systemInstruction`. Ask for JSON with
  `generationConfig.responseMimeType: "application/json"`.
- `'mock'` returns a fixed, valid output-contract JSON so tests never touch the network.
- **Provider choice (owner, this session): Gemini only.** Anthropic and OpenAI paths are
  kept as thin, unexercised alternatives so D13's bake-off stays possible if a key turns
  up, but no key for them exists and they have never run. Switching stays env-only —
  D13 needs a 2–3 model comparison against the golden set's explanation column before
  the generator is finally chosen, and that comparison has not happened.

## `explain/index.js`

```js
function buildIndex(cards, { vectors }) -> index        // vectors[i] aligns with cards[i]
function loadIndex(path?) -> index                      // default shelf/shelf-index.json
index = { version_id, embed_model, embed_task_type, dims, cards: [...], vectors: [[...]], alias_map: {...} }
```

`alias_map` maps a normalised surface form → card ids, built from title + aliases.
Normalisation: lowercase, strip punctuation, collapse whitespace. One surface can map
to several cards — the shelf has ~36 such pairs, see `shelf/README.md`.

## `explain/retrieve.js`

```js
async function retrieve(sentence, {
  index,
  k = 5,              // D16 cap
  floor = 0.0,        // similarity floor; below it a card is not returned
  weights = { semantic: 1.0, lexical: 0.5 },
  legs = 'both',      // 'both' | 'semantic' | 'lexical'  — attribution, D15
  embedOpts = {}
}) -> {
  cards: [{ ...card, score, legs: { semantic?: number, lexical?: number } }],  // ≤ k, may be []
  legOutput: { semantic: [{id, score}], lexical: [{id, score}] },              // pre-fusion, for attribution
  meta: { embed_model, dims, floor, weights }
}
```

- **Semantic leg (primary, D11/D14):** embed the sentence, cosine against card vectors
  (built from `title + "\n" + definition` — nothing else).
- **Lexical leg:** exact match of card titles and aliases against the sentence, on the
  normalised form, at word boundaries. A one- or two-character surface never matches.
  Longer surfaces outrank shorter ones when they overlap.
- **Fusion:** normalise each leg's scores to 0–1, combine by `weights`, sort, cut at `k`,
  drop anything under `floor`.
- **Empty is a correct answer** (D8). The 11 negative golden rows must be able to return `[]`.
- `legs` runs one leg alone so D15's three-number attribution is possible.
- Deterministic: same sentence + same index + same weights → same result.

## `explain/prompt.js`

```js
function buildPrompt(sentence, cards) -> { system, user }
```

Carries the sentence, the **full** card (title + definition + examples) for every
retrieved card, and the instruction (D18). Instruction covers, plainly — objective
(restate what the sentence claims, jargon resolved inline), constraint (only the cards
and the sentence; a term the sentence turns on that isn't in the cards is named as a
gap, never defined), selectivity (only the terms the sentence turns on, not every card
supplied — D9), voice (simple, direct, one idea at a time; not assistant-voice, not
bullets), and the exact JSON output shape. Handles the empty-card case.

## `explain/generate.js`

```js
async function generate({ system, user }, opts) -> { output, raw, model, usage }
```

Calls the LLM provider, parses JSON out of the reply (tolerating a code fence),
validates the output contract, coerces missing fields to their empty value, and drops
`terms[]` entries whose `card_id` wasn't in the retrieved set. Never throws on a
malformed reply — returns a valid contract object and records the problem in `raw`.

## `explain/explain.js`

```js
async function explain(sentence, opts = {}) -> {
  restatement, terms, gaps,
  _debug: { retrieved: [{id, title, score}], legOutput, model, embed_model, usage, ms }
}
```

Steps 2–4 wrapped, surface-agnostic. It does not know where the sentence came from.
Empty retrieval still calls generation — the model's job is then to name the gaps.

## `web/api/explain.js`

Vercel serverless. `POST { sentence }` → the output contract. 400 on a missing or
over-long sentence (cap 1000 chars), 405 on non-POST. `_debug` only when
`EXPLAIN_DEBUG=1`. No auth (D5); the spend ceiling and rate limit are Phase 3 —
leave a marked seam, don't build them.

## Verification bar

- `node --check` on every file.
- `node --test tests/` green, with **no network** — mock providers only.
- Anything that needs a real key is written, wired, and left unrun. Say so; never claim
  a scored eval that didn't run.
