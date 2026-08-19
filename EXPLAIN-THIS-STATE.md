# Explain This — state (read this first)

Phase 1 (Ground) is wired. Nothing has been scored yet.
Last worked: 2026-08-19.

Specs: `Mitsu/Docs/Explain-This-PRD.md` (what/why), `Explain-This-Technical.md` (how),
`DECISIONS-Explain-This.md` (every D-number, including D20–D28 from the build session).
`explain/CONTRACT.md` is the module interface. `explain/README.md` is how to run it.

## Where things stand

| | |
|---|---|
| Shelf export | **DONE** — 1010 cards, `shelf/shelf-export.json`, version `shelf-1010-02e436fd8106` |
| Retrieval, prompt, generation, endpoint | **DONE** — 66 tests, no network |
| Decode box (surface 1a) | **DONE** — above the shelf on the homepage |
| Eval harness | **DONE** — runner, retrieval scorer, judge, report |
| Embedding index | **DONE** — 768-dim, 16 MB, `shelf/shelf-index.json` |
| **First scored run** | **DONE** — `v1-flashlite`, see below |
| Extension highlighter (1b) | not started, gated on 1a's eval (D19) |

## Run it

```bash
cd "Mitsu/AI Dictionary"
set -a && . ./.env && set +a          # GEMINI_API_KEY, gitignored

node scripts/build-index.js           # ~11 min, free tier is 100 embeds/min. Resumable.
node scripts/preview-server.js        # http://localhost:8743 — Decode box on the homepage
node --test                           # 66 tests, no key needed

node eval/run.js --label=real         # 39 golden sentences
node eval/score-retrieval.js  eval/out/<version>/real/results.json
node eval/score-explanation.js eval/out/<version>/real/results.json
node eval/report.js eval/out/<version>/real
```

`?mock=1` on the preview URL renders a fake answer, for judging layout without spending
quota. It is labelled in the server log so it can't be mistaken for a real one.

## First scored run — `v1-flashlite`, 39 rows, 0 errors

Generator `gemini-flash-lite-latest`, judge `gemini-pro-latest`, shelf
`shelf-1010-02e436fd8106`.

**How to read a judge score:** 5 = no fault, 4 = minor fault that would not mislead,
3 = noticeable fault, 2 = would mislead, 1 = wrong or invented. There is no external
benchmark — the number only means something against the PRD's bar and against the
next run. Above 4.5 is where most rows are clean.

| Axis | Score |
|---|---|
| Correct | 4.51 |
| In-voice | 4.54 |
| Useful | 4.51 |
| Grounded | 4.23 |
| **Ungrounded claims** | **10 / 39 rows — ship gate breached** |

The gate is what matters, not the average: the PRD calls one confident invention a
ship-blocker, so grounding is never averaged away into a pass. This is the expected
Phase 1 result — D17 accepted invention risk at the small-fast tier because the
Phase 3 verification gate is the backstop, and that gate is not built.

Retrieval, same run: positives precision 46% / recall 60%; at the OUTPUT layer
(what the reader sees) precision 78% / recall 45%; negatives 82% clean at the output
layer against 0% at the retrieval layer. See D30 for why both layers are scored.

**Four judge reruns were needed to get a trustworthy number, and every earlier one
was measurement error:** `maxTokens: 500` truncated every reply (39/39 "ungrounded");
`run.js` never saved card definitions so the judge graded blindfolded (30/39);
`llm.js` had no retry so five rows died on Gemini 503s (14/39). Final: 10/39. If a
judge number ever looks catastrophic, suspect the harness before the product.

## What else is measured

**The lexical leg alone, over the real shelf** — no embeddings, so these are exact:
40.3% macro recall on the 28 positives, 7 of 28 find nothing, and **8 of 11 negatives leak
a card** (`dropout`, `epoch`, `flops`, `consent`, `dashboards`, `agents`, `nlp`,
`spotinstances`). Both failure modes D11 predicted, now quantified. That is the bar the
semantic leg has to clear and the list the floor has to suppress.

**Generation quality, first real call:** the model spliced card definitions into one
60-word run-on. A prompt fix (D25) produced house voice in one pass. Three sentences
checked by hand, none scored.

## Blockers and open calls

1. **DEPLOY BLOCKER — the function's dependencies sit outside the Vercel root.**
   Root Directory is `web` (confirmed by Sumit). The function is `web/api/explain.js`
   and it requires `../../explain/explain.js`, which loads `../shelf/shelf-index.json`.
   Both `explain/` and `shelf/` are at the repo root, i.e. *outside* `web/`, so they
   are not in the build context and the function will fail at runtime even though it
   works locally.
   Two fixes, pick one:
   - **Vercel Settings → General → "Include source files outside of the Root
     Directory in the Build Step"** — turn it on. No code change.
   - Move `explain/` and `shelf/` inside `web/` and update the requires plus the
     paths in `scripts/`. More work, no Vercel setting needed.
   Verify after deploying: `curl -X POST https://aidecoder.app/api/explain -H 'content-type: application/json' -d '{"sentence":"We reduced hallucination by tightening top-k."}'`
2. **Golden-set row 27 has drifted.** Its gold explanation says the shelf doesn't cover
   NLP; an `nlp` card now exists. Either the row expects `[nlp]` or it retires. Until then
   its leak is miscounted.
3. **Sumit is building a golden test scorer separately** — `eval/score-*.js` here may be
   redundant. Still unresolved.
4. **`GEMINI_API_KEY` must be added in Vercel**, and it is the ONLY variable needed:
   vercel.com → the AI-Decoder project → **Settings → Environment Variables → Add New**.
   Key `GEMINI_API_KEY`, Value = the key from local `.env`, tick **Production**
   (and Preview if you use preview deploys), Save. Then **redeploy** — environment
   variables only apply to deployments created after they are added: Deployments tab →
   the latest one → the ⋯ menu → Redeploy.
   Why it is needed: the code reads `process.env.GEMINI_API_KEY`. Locally that comes
   from `.env`, which is gitignored and never uploaded, so on Vercel the variable
   simply does not exist until it is added there.
4. **D13's model bake-off never happened.** One model, no comparison (D26).
5. **Phase 2 moves vectors to Supabase pgvector** (D20). The 768-dim index is an interim
   size fix, not the answer.

## Open: the ~20s cold start (unresolved)

Warm production requests are **~1.3s**, measured three times consecutively. The first
request after an idle period is **~20s**. Cold starts are per *container*, not per user
or session — they happen after a deploy, after Vercel scales to zero on idle, and on
each additional container under concurrent load. On a low-traffic site that means most
first-visitors-after-a-quiet-period pay it.

**The cause is NOT the 16MB index parse.** That was the initial hypothesis and it is
wrong: reading and parsing `shelf-index.json` measures **82ms** locally (44ms read,
38ms `JSON.parse` of 775k floats). Do not re-litigate that without new evidence.

**The cause is still unidentified.** The measurement that settles it: set
`EXPLAIN_DEBUG=1` in Vercel's environment variables, wait for the function to go cold,
then curl once. The response carries `_debug.ms` — time spent *inside* the handler.
- `_debug.ms` ≈ 1.3s → the 20s is container boot/module load, outside our code.
- `_debug.ms` ≈ 20s → it is inside the pipeline and traceable from there.

Mitigated in the UI only (`a5d3f34`): the loading label changes at 4s and 12s, and the
request aborts at 45s with a message rather than spinning forever. That is cosmetic —
the latency is unchanged.

## Things that will bite you

- The free tier is **100 embed requests a minute**. The index build paces itself and
  resumes from `shelf/shelf-index.json.partial.json`; don't "fix" the waits out.
- Pinned Gemini `2.0`/`2.5` model ids are retired or have zero free-tier quota. Use the
  `-latest` aliases. Don't replace them with pins.
- `node --test tests/` fails on Node 24. Use bare `node --test`.
- One card id contains a space: `serversent events`. It will not survive a URL.
- 4 cards have no `/term/` page, so chips must use the in-app opener, not a link (D28).
- Retrieval must be able to return **nothing**. That's D8, not a bug.
- `eval/run.js` and `eval/score-explanation.js` run rows concurrently
  (`EVAL_CONCURRENCY`, default 6). They were sequential and a judge pass took ten
  minutes; it now takes forty seconds. Lower the pool on a free-tier key.
- The judge needs `maxTokens` in the thousands: Gemini Pro spends output budget on
  reasoning before it emits text, and a low ceiling returns truncated JSON that
  scores worst-case and looks exactly like a failed ship gate.
- Row 30 (`consent` / `accountability` on a sexual-harassment sentence) is a known,
  unfixed false-friend miss. Diagnosed: the prompt's rule 7 tests whether a word is
  used in a different *sense*, but this row needs a test of whether the sentence is
  about an AI system at all. Proposed wording is in the session log; deliberately not
  applied, at Sumit's call.
