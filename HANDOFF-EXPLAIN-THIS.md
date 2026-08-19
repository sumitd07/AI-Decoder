# Explain This — session handoff (2026-08-19)

Paste this into a new session. It is the short version; the full detail is in
`EXPLAIN-THIS-STATE.md` (status + gotchas) and `Mitsu/Docs/DECISIONS-Explain-This.md`
(D1–D30, every decision and what it traded away).

---

## What exists

Phase 1 (Ground) is built, pushed to `github.com/sumitd07/AI-Decoder` `main`, and has
one scored eval run. 66 tests, no network needed.

| Piece | Where |
|---|---|
| Shelf export — 1010 cards, version `shelf-1010-02e436fd8106` | `shelf/`, rebuild with `scripts/export-shelf.js` |
| Embedding index — 768-dim, 16 MB | `shelf/shelf-index.json`, rebuild with `scripts/build-index.js` |
| Pipeline — retrieve → prompt → generate | `explain/` |
| Endpoint | `web/api/explain.js` |
| Decode page (surface 1a) | `web/index.html`, tab between Lookup and Saved |
| Eval — runner, scorers, judge, report | `eval/` |

Run it:
```bash
set -a && . ./.env && set +a          # GEMINI_API_KEY, gitignored
node scripts/preview-server.js        # http://localhost:8743
node --test                           # 66 tests
node eval/run.js --label=<name>
node eval/score-retrieval.js  eval/out/<version>/<name>/results.json
node eval/score-explanation.js eval/out/<version>/<name>/results.json
node eval/export-csv.js eval/out/<version>/<name>   # one CSV, row by row, for reading
```

## Where it stands

**First scored run** (`v1-flashlite`, Flash-Lite generating, Pro judging, n=39):

| Axis | Score /5 |
|---|---|
| Correct | 4.51 |
| In-voice | 4.54 |
| Useful | 4.51 |
| Grounded | 4.23 |
| **Ungrounded claims** | **10 / 39 rows — ship gate breached** |

Scale: 5 = no fault, 4 = minor, 3 = noticeable, 2 = would mislead, 1 = invented.
There is no external benchmark; the number means something only against the PRD's bar
and the next run.

The gate is the number that matters. The PRD calls one confident invention a
ship-blocker, so grounding is never averaged into a pass. This is the *expected*
Phase 1 result: D17 accepted invention risk at the small-fast tier because the Phase 3
verification gate is the backstop, and that gate is not built. Phase 1 measures
grounding; it does not enforce it.

Retrieval, same run: positives 46% precision / 60% recall at the retrieval layer,
78% / 45% at the **output** layer (what the reader actually sees). Negatives: 0% clean
at retrieval, **82% clean at output**.

## The three findings worth carrying forward

**1. Score the output layer, not just retrieval (D30).** The first run read as total
failure — 0 of 11 negatives returned an empty retrieved set. At the output layer 9 of 11
showed no term chips: the model was already refusing the false friends it was handed.
A floor-tuning exercise was about to trade 8 correct cards and 2 false refusals to move
a number no reader observes. Retrieval is a diagnosis layer; never decide on it alone.

**2. More retrieval did not help (D29).** Raising the top-5 cap to 8 lifted retrieval
recall 60% → 69% and made the product *worse*: output recall 45% → 42%, precision
78% → 75%. The model shows ~2.3 chips per row regardless of how many cards it gets
(2.3 at cap 5, 2.4 at cap 8). Rewording the D9 selectivity rule moved chip count by two
across 28 rows and cost a negative. Both reverted. The bottleneck is the generator's
willingness to use what it is given, not retrieval's reach.

**3. Suspect the harness before the product.** Four judge runs were needed to get a
trustworthy number, and every earlier one was measurement error:
`maxTokens: 500` truncated every reply → 39/39 "ungrounded";
`run.js` never saved card definitions, so the judge graded blindfolded → 30/39;
`llm.js` had no retry, so five rows died on Gemini 503s → 14/39;
fixed → **10/39**. If a judge number looks catastrophic, check the harness first.

## Do this first in the next session

**1. Unblock the deploy.** The code is pushed but the function will fail on Vercel.
Root Directory is `web`; `web/api/explain.js` requires `../../explain/explain.js`,
which loads `../shelf/shelf-index.json` — both outside the root, so neither is in the
build context. Either turn on **Vercel → Settings → General → "Include source files
outside of the Root Directory"**, or move `explain/` and `shelf/` inside `web/` and fix
the requires. Also add `GEMINI_API_KEY` in Vercel: Settings → Environment Variables → Add New, tick
Production, Save, then redeploy (env vars only apply to new deployments). That is the
only variable needed. Verify with:
```bash
curl -X POST https://aidecoder.app/api/explain -H 'content-type: application/json' -d '{"sentence":"We reduced hallucination by tightening top-k."}'
```

**2. Run D13's bake-off.** It has never been run. One env variable
(`LLM_MODEL=gemini-pro-latest`), ~$0.20, 70 seconds. It answers the open question from
D29: is the ~2.3-chip ceiling a Flash-Lite limit or a limit of the task? Everything
downstream — whether to keep the small-fast tier at all — depends on it.

**3. Decide the golden-set drift.** Row 27's gold explanation says the shelf doesn't
cover NLP; an `nlp` card now exists. Either the row expects `[nlp]` or it retires.
Row 16 leaks on `spot` (from "spot architectural risks") matching the `spotinstances`
alias — a real false friend nobody anticipated. Worth adding `human-eval` vs
`humaneval` to the negatives: two different concepts colliding on one string.

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

## Known, deliberately unfixed

- **Row 30** — `consent` and `accountability` chips on a sexual-harassment sentence,
  restated as if it were about an AI system. Diagnosed: the prompt's rule 7 tests
  whether a word is used in a different *sense*, but this row needs a test of whether
  the sentence is about an AI system **at all**. Sumit's call to defer.
- **36 duplicate card pairs** on the shelf (`agi`/`artificialgeneralintelligence`,
  `tokenization`/`tokenizer`, …) — listed in `shelf/README.md`, deferred until the
  cut-off is tuned.
- **4 cards have no `/term/` page** (`a2a`, `agentops`, `agentidentity`,
  `agentpayments`), so chips resolve through the in-app card opener, never a URL (D28).
- **One card id contains a space**: `serversent events`. It will not survive a URL.

## Ways I wasted your time — don't repeat them

- Changed the cap and the prompt in one run, so the result was uninterpretable and a
  third run was needed to isolate the cap. **One variable per run.**
- Paced the index build for the free tier after billing was enabled: 23 seconds of work
  took 11 minutes.
- Ran the eval without embeddings and called it "real scores today". It measured the
  leg that D11 had already ruled insufficient.
- Left a preview-server mock that invented restatements and gap terms, rendering
  identically to real output. Removed — the server now fails with a reason instead.

## Cost

~$1.15 of the Rs 1000 credit this session. Generation $0.025, embeddings $0.010,
judge $1.11 across four runs (three of them wasted on the harness bugs above).
A clean cycle — rebuild index, run 39 rows, judge them — is about $0.28.

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

`C8` is from `EXPLAIN-THIS-SCOPE.md` and means the Phase 3 verification gate — the
step that would *enforce* zero invention rather than just measure it.
