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
| Embedding index | rebuilding at 768 dims (D20) |
| **A scored eval run** | **NOT DONE — no real numbers exist yet** |
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

## What's measured so far

**The lexical leg alone, over the real shelf** — no embeddings, so these are exact:
40.3% macro recall on the 28 positives, 7 of 28 find nothing, and **8 of 11 negatives leak
a card** (`dropout`, `epoch`, `flops`, `consent`, `dashboards`, `agents`, `nlp`,
`spotinstances`). Both failure modes D11 predicted, now quantified. That is the bar the
semantic leg has to clear and the list the floor has to suppress.

**Generation quality, first real call:** the model spliced card definitions into one
60-word run-on. A prompt fix (D25) produced house voice in one pass. Three sentences
checked by hand, none scored.

## Blockers and open calls

1. ~~Vercel Root Directory~~ — **CONFIRMED `web` by Sumit, 2026-08-19.** Was: `/api/explain` 404s if it is not. Not
   checkable from the repo.
2. **Golden-set row 27 has drifted.** Its gold explanation says the shelf doesn't cover
   NLP; an `nlp` card now exists. Either the row expects `[nlp]` or it retires. Until then
   its leak is miscounted.
3. **Sumit is building a golden test scorer separately** — `eval/score-*.js` here may be
   redundant. Unresolved as of this session.
4. **D13's model bake-off never happened.** One model, no comparison (D26).
5. **Phase 2 moves vectors to Supabase pgvector** (D20). The 768-dim index is an interim
   size fix, not the answer.

## Things that will bite you

- The free tier is **100 embed requests a minute**. The index build paces itself and
  resumes from `shelf/shelf-index.json.partial.json`; don't "fix" the waits out.
- Pinned Gemini `2.0`/`2.5` model ids are retired or have zero free-tier quota. Use the
  `-latest` aliases. Don't replace them with pins.
- `node --test tests/` fails on Node 24. Use bare `node --test`.
- One card id contains a space: `serversent events`. It will not survive a URL.
- 4 cards have no `/term/` page, so chips must use the in-app opener, not a link (D28).
- Retrieval must be able to return **nothing**. That's D8, not a bug.
