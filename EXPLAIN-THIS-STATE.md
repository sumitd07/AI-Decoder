# Explain This — state (read this first)

Phase 1 (Ground) is wired and BOTH surfaces are built. 1a is live; 1b is written and
verified against the real endpoint, but every `chrome.*` path is unverified until
someone loads the extension unpacked.
Last worked: 2026-08-21.

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
| **Extension highlighter (1b)** | **BUILT** — v1.1.0, gate crossed on Sumit's explicit call (D31). Needs a real-Chrome pass |

## Surface 1b — what was built

Highlight a sentence on any page → a "Decode" pill appears at the end of the selection →
click it → the explanation renders in place, chips and gaps included. No backend change:
it posts the same `{ sentence }` to the same `/api/explain` that 1a posts to.

| File | What it is |
|---|---|
| `extension/extract.js` | Selection → one clean sentence. Pure, DOM-free, 25 tests (D33) |
| `extension/explain.js` | The trigger pill, the answer panel, chip resolution (D32, D35, D37) |
| `extension/content.js` | Unchanged highlighter + a narrow `window.__decoderCard` bridge 1b borrows |
| `extension/content.css` | 1b's styles; the whole file now shares 1a's motion language (D38) |
| `extension/background.js` | `explain` and `getCard` message handlers (the fetch must live here — D34) |
| `extension/popup.{html,js}` | Two switches: Highlight terms, Decode sentences (D36) |
| `preview/1b.html` | DEV harness — real endpoint, real Supabase, `chrome.*` shimmed. Never shipped |
| `web/index.html` | "How it works" tab — the same surface, live and public (D39) |
| `web/extract.js` | Copy of `extension/extract.js`; Vercel's root is `web/`. A test fails if they drift |
| `tests/extract.test.js` | The extraction test set (66 → 91 tests total) |

**Verified in the browser, against the live pipeline:** partial mid-word selection expands
to the full sentence before it is sent; the answer renders with chips and a gaps line;
a chip outside the 95-card bundle fetches its card and opens it; a bare shelf term opens
its card with **zero** model calls (the PRD's restraint criterion); a 4-sentence drag is
cut to 3 and says so; code blocks and short selections offer no pill; both switches take
effect immediately in an open tab; 500 and dropped-connection both render their message;
375px and desktop; no console errors.

**The public demo** (`aidecoder.app/#how-it-works`) runs the same extraction and the same
endpoint on a sample article, scoped to `#demoDoc` so the site's own copy is inert. Chips
are `data-openrow` buttons, so the app's existing card opener handles them. Verified:
partial selection expands before sending, panel stays inside the article card, chips open
real cards, dark theme, 375px, no page overflow, the 8-per-visit cap fires with no request.
It also fixed a pre-existing header overflow: the nav ran 54px past a 375px viewport with
three tabs, and a fourth would have made it 101px. The tab strip now shrinks and scrolls.

**Not verified, and cannot be here:** everything touching `chrome.*` for real —
`permissions.contains`, the registered content script, `storage.onChanged` across tabs,
the popup in its actual popup window. Load it unpacked and check by hand.

## Run it

```bash
cd "Mitsu/AI Dictionary"
set -a && . ./.env && set +a          # GEMINI_API_KEY, gitignored

node scripts/build-index.js           # ~11 min, free tier is 100 embeds/min. Resumable.
node scripts/preview-server.js        # http://localhost:8743 — Decode box on the homepage
node --test                           # 92 tests, no key needed
node scripts/preview-server.js && open http://localhost:8743/preview/1b.html   # 1b harness

node eval/run.js --label=real         # 39 golden sentences
node eval/score-retrieval.js  eval/out/<version>/real/results.json
node eval/score-explanation.js eval/out/<version>/real/results.json
node eval/report.js eval/out/<version>/real
```

`?mock=1` on the preview URL renders a fake answer, for judging layout without spending
quota. It is labelled in the server log so it can't be mistaken for a real one.

## Scored runs — always read the judge column

**A score is only comparable to another score judged by the same model (D40).**
The same 39 outputs judged by `gemini-pro-latest` gave 10/39 ungrounded; judged by
`gemini-3.5-flash` they gave 4/39. Nothing about the product changed.

| Run | Generator | Judge | Correct | Grounded | In-voice | Useful | Ungrounded |
|---|---|---|---|---|---|---|---|
| v1-flashlite | flash-lite | pro-latest | 4.51 | 4.23 | 4.54 | 4.51 | 10/39 |
| v1-flashlite | flash-lite | **3.5-flash** | 4.77 | 4.74 | 4.82 | 4.74 | **4/39** |
| v5-gaprule | flash-lite | 3.5-flash | 4.67 | 4.56 | 4.56 | 4.64 | 5/39 |
| **v8-pro** | **pro-latest** | 3.5-flash | **4.90** | **4.85** | **4.87** | **4.92** | **2/39** |

Negatives, output layer (what a reader would see):

| Run | True gaps clean | False friends clean | All negatives |
|---|---|---|---|
| v1-flashlite | 100% | 75% | **82%** |
| v8-pro | 100% | 38% | 55% |

**Read: Pro grounds better and refuses worse.** It halves ungrounded claims and wins
every axis, but explains sentences it should decline. See D41.

**How to read a judge score:** 5 = no fault, 4 = minor fault that would not mislead,
3 = noticeable fault, 2 = would mislead, 1 = wrong or invented. There is no external
benchmark — a number means something only against the PRD's bar and the next run.

**The ungrounded count is the gate, never the average.** The PRD calls one confident
invention a ship-blocker, so it is reported separately and never averaged away.

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

0. **1b needs a real-Chrome pass before it can ship.** Load `extension/` unpacked, click
   "Enable on all sites", then: underline a term, highlight a sentence and decode it,
   click a chip, flip each switch, and confirm the panel behaves on a long article. The
   store submission also needs re-shooting screenshots (STORE-LISTING.md §1) and the
   privacy disclosure has changed — `web/privacy.html` now discloses the decode call and
   must be redeployed **before** the new version is submitted.
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
   **UPDATE 2026-08-21: this appears resolved.** The live endpoint answers a real
   request in ~3s (`curl -X POST https://aidecoder.app/api/explain -H 'content-type: application/json' -d '{"sentence":"We reduced hallucination by tightening the retriever'"'"'s top-k."}'`
   returned a correct restatement with `hallucination`, `retrieval` and `topk` chips).
   Someone made one of the two fixes; which one is not recorded. 1b depends on it.
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

- **`gemini-pro-latest` is capped at 250 requests per day** and resolves to
  `gemini-3.1-pro`. A 39-row run plus retries eats a fifth of it. Keep the judge on a
  non-pro model or the budget goes to grading instead of generating.
- **Never `git stash` mid-experiment.** An uncommitted token-ceiling fix was stashed
  along with an unrelated prompt change, and two Pro runs generated at the old ceiling
  before anyone noticed. Commit a fix before running anything against it.

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

## What the D-numbers mean

`D<n>` refers to an entry in `Mitsu/Docs/DECISIONS-Explain-This.md`. **D1–D19 predate
this build**; **D20–D30 were appended during it.** Full reasoning, alternatives, and
revisit triggers live in that file — this is just a lookup so the notes above read
without it.

| # | In plain English |
|---|---|
| D1 | Fixed pipeline, no agent loop — results stay comparable between runs |
| D4 | Build the web version before the extension |
| D5 | No login. Spend ceiling and rate limit deferred to Phase 3 |
| D8 | If nothing matches the shelf, say so — never guess |
| D9 | Explain only the terms the sentence hinges on, not every card found |
| D11 | Retrieval is meaning-matching first, exact word-matching second |
| D13 | Compare 2–3 models on the golden set and pick one. **Never run** |
| D14 | Embed each card's title + definition, nothing else |
| D16 | Rank the matches, keep the top 5 |
| D17 | Use a small fast model; accept invention risk because Phase 3 is the backstop |
| D18 | Send the full card — title, definition, examples — into the prompt |
| D19 | Decode page first, extension second |
| D20 | 768-dim embeddings, not 3072 — the bigger index was 40MB |
| D21 | The index is built once offline, never per request |
| D22 | The index build checkpoints and resumes after a rate-limit stall |
| D23 | 27 duplicate cards collapsed in the export; 36 more reported, not merged |
| D24 | Keep the card's `deeper` text out of the embedded text — it hurts precision |
| D25 | Prompt rewrite that stopped the model pasting card definitions verbatim |
| D26 | Gemini for embeddings, generation and judging |
| D27 | The judge must be a different model from the generator |
| D28 | Chips open cards in-app, never via a `/term/` URL |
| D29 | Raising the retrieval cap to 8 was tested and reverted — it made things worse |
| D30 | Score what the reader sees, not just what retrieval found |
| D40 | The judge model moves the score more than the product does — always name the judge |
| D41 | Bake-off run: Pro grounds better (2/39 vs 4/39), refuses worse (55% vs 82%) |
| D42 | Reasoning models need a high token ceiling; the eval now saves the raw reply |
| D43 | The gap rule was tried and rejected — it cut gap-naming almost in half |

`C8` is from `EXPLAIN-THIS-SCOPE.md` and means the Phase 3 verification gate — the
step that would *enforce* zero invention rather than just measure it.
