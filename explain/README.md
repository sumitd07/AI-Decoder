# Explain This — Phase 1 (Ground)

A reader hits a sentence that doesn't parse. They paste it into the Decode box and get
that sentence explained in plain English, grounded in the Decoder shelf. Not a
definition — an explanation of *that sentence*.

Specs live in `Mitsu/Docs`: `Explain-This-PRD.md` (what and why),
`Explain-This-Technical.md` (how), `DECISIONS-Explain-This.md` (the D-numbers).
`CONTRACT.md` here is the module interface. This file is how to run it.

## Setup

One key: `GEMINI_API_KEY`, from Google AI Studio. Free tier is enough.

```bash
echo 'GEMINI_API_KEY=your_key' > .env      # already gitignored
set -a && . ./.env && set +a
```

For the live site the key goes in Vercel → Project Settings → Environment Variables,
never in the repo.

| Variable | Default | What it does |
|---|---|---|
| `GEMINI_API_KEY` | — | The only key. Embeddings and generation both use it. |
| `EMBED_PROVIDER` | `gemini` | `gemini` or `mock`. |
| `EMBED_MODEL` | `gemini-embedding-001` | |
| `LLM_PROVIDER` | `mock` | `gemini` or `mock`. Set to `gemini` in production. |
| `LLM_MODEL` | `gemini-flash-lite-latest` | Small-fast tier, D17. Keep the `-latest` alias — pinned 2.0/2.5 ids are retired or carry no free-tier quota. |
| `EXPLAIN_DEBUG` | unset | `1` adds `_debug` to the endpoint's response. |

## Build the index, then run

```bash
node scripts/export-shelf.js     # shelf → shelf/shelf-export.json  (only when the shelf changes)
node scripts/build-index.js      # embed 1010 cards → shelf/shelf-index.json
node --test                      # 66 tests, no network, mock providers
```

`build-index.js` refuses to write mock vectors to the default path. A mock index is
indistinguishable from a real one once it's on disk, and a retrieval score read off
one is noise — pass `--allow-mock --out /tmp/x.json` if you want one for wiring.

## The pipeline

Deterministic. One sentence in, one explanation out. No agent loop, no retries (D1) —
a varying trajectory destroys attribution, and you cannot measure a retrieval change
if the path differs per run.

```
sentence
  ↓
retrieve()    hybrid: semantic (primary) + lexical (exact) → ranked set, cut at 5, can be empty
  ↓
buildPrompt() sentence + full cards + instruction
  ↓
generate()    small-fast model → { restatement, terms[], gaps[] }
```

`explain(sentence)` wraps all three and is surface-agnostic — it does not know whether
the sentence came from the Decode box or, later, from a highlight on a page (D19).
`web/api/explain.js` is the one endpoint both surfaces call.

## Retrieval, and the two knobs that matter

Semantic leads (D11/D15): most cards the golden set expects are concepts the sentence
*describes but never names*, which only embeddings reach. Lexical owns proper nouns and
exact terms. Cards embed `title + "\n" + definition` and nothing else (D14).

The set can be **empty**, and that is a correct answer (D8) — for a sentence whose terms
aren't on the shelf, and for a false friend where the string is a shelf term but the
sense isn't.

Two knobs are deliberately left open, to be tuned against the golden set rather than
guessed up front:

- **`weights`** — how the two legs fuse. Default `{ semantic: 1.0, lexical: 0.5 }`.
- **`floor`** / **`semanticFloor`** — the absolute score below which a card is dropped.
  This is what makes the set reach empty. D16's watch: a fixed top-5 admits weak matches
  when the true count is fewer, and a floor underneath the cap is the fix if the
  negatives leak.

`retrieve()` takes `legs: 'semantic' | 'lexical' | 'both'` so each leg can be scored
alone — D15's three-number attribution.

### Measured: the lexical leg alone, over the real 1010-card shelf

D15 skipped the lexical baseline on the grounds that both its failure modes were
already visible in the golden set. Running it costs nothing now that the shelf is
exported, so here it is — no embeddings involved, so these are exact:

| | |
|---|---|
| Macro recall on the 28 positives | **40.3%** |
| Positives where lexical found nothing at all | **7 of 28** |
| Negatives correctly returning empty | **3 of 11** |
| Negatives leaking a card | **8 of 11** |

Both predicted failures are real and quantified. The seven blind positives are the
described-but-unnamed rows — row 2 (`Small language model`, `Domain Adaptation`), row 6,
row 9, row 25, row 26, row 35 — none of which name their concept. The eight leaks are
false friends: `dropout` (the college kind), `epoch` (the calendar kind), `flops` (the
box-office kind), `consent`, `dashboards`, `agents`, `nlp`, `spotinstances`.

That sets the bar for the semantic leg — it has to carry roughly 60% of recall on its
own — and it names what the floor has to suppress. Re-run this against the real index
once a key exists; if fused retrieval doesn't beat 40.3% recall while cutting the 8
leaks, the weights are wrong.

## What is NOT built, deliberately

| | Phase | Ref |
|---|---|---|
| Surrounding-page retrieval, author usage | 2 | D3 |
| Restraint gate — skip the model when a card already answers | 2 | — |
| Verification gate enforcing zero invention | 3 | C8 |
| Confidence routing | 3 | — |
| Spend ceiling, per-IP rate limit | 3 | D5 |
| Extension highlighter (surface 1b) | after 1a's eval passes | D4, D19 |

The seam for the spend ceiling is marked in `web/api/explain.js`, before the model call,
so a refusal costs nothing. The verification gate slots in after `generate()`.

Until that gate exists, **grounding is measured, not enforced** (D17). Invention risk is
accepted at the small-fast tier precisely because Phase 3 is the backstop — so a Phase 1
eval that shows ungrounded claims is information, not a passing grade.

## The eval

```bash
node eval/run.js --label=real                 # 39 sentences → eval/out/<shelf-version>/real/results.json
node eval/score-retrieval.js  <results.json>  # code
node eval/score-explanation.js <results.json> # judge
node eval/report.js <run>                     # summary
node eval/report.js <runA> <runB>             # is the change a regression?
```

`--legs=semantic|lexical|both` produces D15's three attribution numbers.
`--dry-run` exercises the whole harness on mock providers with no key.

Every result is stamped with the shelf `version_id`. Scores from different shelf
versions are not comparable, and the stamp is what makes that checkable.

The judge defaults to `gemini-pro-latest` while the generator is on
`gemini-flash-lite-latest`, and warns loudly if they resolve to the same model — a
model grading its own output is not evidence.

### The 11 negatives are classified in `eval/negatives.json`

The PRD scores the two kinds separately, and the CSV carries no label, so the split
is derived mechanically — a negative row is a **false friend** if any content word
is a whole-token match for a shelf card title or alias under the same rule the
lexical leg uses, and a **true gap** otherwise. 3 true gaps, 8 false friends. The
reasoning is stored per row so it can be argued with rather than trusted.

### Two golden-set findings, both needing an owner's call

**Row 27 has drifted from the shelf.** The sentence is about Natural Language
Processing and its gold explanation says the shelf doesn't cover NLP yet. The shelf
now has an `nlp` card, with a definition and examples. So retrieval will return it,
and the golden set will score that as a leak on a row where the card is arguably
correct. Either the row's expected cards should become `[nlp]`, or the row should be
retired. Filed as a false friend for now so the leak lands in a class where a leak is
an expected, visible number instead of quietly corrupting true-gap coverage.

**Row 16 leaks on a surface nobody anticipated.** "spot architectural risks early"
matches the alias `spot` on the `spotinstances` card. It is a real false friend, just
not one of the PRD's named examples — evidence that the false-friend class is wider
than the four terms the golden set was built around.

One more pair worth adding to the negatives: **`human-eval` vs `humaneval`** — asking
people to rate outputs, and the 164-problem coding benchmark. Two different concepts
that collide on the string, already on the shelf, and exactly the failure the false
friends exist to catch.
