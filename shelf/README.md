# Shelf export — the retrieval corpus for "Explain This"

The Decoder shelf in the card shape `Explain-This-Technical.md` specifies. This is
the one input that doc says you supply; everything else in Phase 1 is code.

Rebuild it with:

```bash
node scripts/export-shelf.js
```

## Files

| File | What it is |
|---|---|
| `shelf-export.json` | The card contract, exactly — `id`, `title`, `aliases`, `definition`, `examples`, `related`. Nothing else. This is what the index is built from. |
| `shelf-export.full.json` | The same cards with an `_extra` object carrying the Decoder fields the contract has no slot for: `analogy`, `deeper`, `status`, `domain`, `tags`, `lens_pm`, `lens_eng`, `said`, `source`, `updated_at`. |
| `shelf-export.meta.json` | Version stamp, counts, every merge this run made, and the duplicate report. |

**1010 cards.** Version `shelf-1010-02e436fd8106`.

Stamp any eval score with the `version_id` from the meta file. The shelf grows, so
a retrieval score from one version isn't comparable to a score from another —
`Explain-This-Technical.md` calls for exactly this and it costs nothing now.

## Where the cards come from

Two sources, because the shelf has two (see `PROJECT-STATE.md`):

1. **Supabase `concepts`, published rows** — 1011 rows, the primary source and what
   the live web app renders. A superset of `supabase/seed_all.sql` (999 rows); the
   extra 12 are older hand-seeded rows that predate the batch seeds.
2. **`web/concepts.js`** — 95 rows. The web app merges any of these the DB lacks, so
   readers see them and the export has to as well. Only **4** turned out to be
   genuinely absent from the DB: `a2a`, `agentops`, `agentidentity`, `agentpayments`.

## Field mapping

| Contract field | Source | Note |
|---|---|---|
| `id` | `concepts.id` | Unchanged, so `terms[].card_id` in the output contract links to a real card. |
| `title` | `concepts.term` | |
| `aliases` | `alias_list` + the `aliases` display string + aliases inherited from merged cards | Deduped case- and punctuation-insensitively; anything that reduces to the title is dropped. This is the lexical leg's surface. |
| `definition` | `one_liner` | |
| `examples` | `[example, analogy]` | Concrete instance first, analogy second, empties dropped. The analogy is included because it is Decoder's most voice-carrying line and D17 puts voice control on a small-fast model — it is the cheapest voice anchor the prompt can carry. It also doubles the surface behind the D18 watch (examples pulling the model into explaining the example); if that shows up on the eval, dropping `examples[1]` is a one-line change. |
| `related` | `related[].id` | The DB stores `[{text, id?}]`; only the ids come across, since the contract is card IDs. Self-references and pointers into merged-away cards are resolved or dropped. 99 DB entries carry prose with no id and are not represented. |

Everything else lives in `_extra` in the full export. Two are worth knowing about:

- **`deeper`** is the card's mechanism paragraph — real definitional substance
  ("chopped into chunks, turned into embeddings, stored in a vector database").
  It is deliberately **not** folded into `definition`, because D14 embeds
  `title + definition` and `deeper` names adjacent concepts freely: RAG's `deeper`
  mentions the context window, so folding it in makes RAG a candidate for
  context-window sentences. That is precision the negatives will punish. Appending
  it is a legitimate knob to try against the golden set — the full export exists so
  you can — but the default keeps the embedded surface tight.
- **`lens_pm` / `lens_eng`** are audience-specific rewrites. Out of scope for Phase 1.

## Duplicate concepts — collapsed, and still outstanding

The shelf carries the same concept twice in places, a legacy of `concepts.js` and
the DB batch seeds being written independently. Two cards for one concept is a
retrieval bug: both match, both eat one of the five slots (D16), and the grounding
for a single claim splits across two sources.

**Collapsed by the exporter** — 27 cards, all listed in `meta.merges`:

- 5 DB-internal pairs: `ai-safety`/`aisafety`, `incontextlearning`/`incontext`,
  `mixtureofexperts`/`moe`, `red-teaming`/`redteaming`, `semantic-search`/`semanticsearch`.
  Survivor is the higher-priority row.
- 22 `concepts.js` cards folded into their DB equivalents (`tooluse` → `tool-use`,
  `vectordb` → `vectordatabase`, and so on).

In every case the dropped card's aliases fold into the survivor, so the lexical leg
keeps the surface forms, and `related` pointers are redirected rather than dropped.

The merge lists are **explicit data, not a similarity heuristic**, because
normalized-title matching gets one pair badly wrong: **`human-eval`** (asking people
to rate outputs) and **`humaneval`** (the 164-problem coding benchmark) are different
concepts that collide on the string. They are kept apart deliberately — and they are
a live false-friend pair, worth adding to the golden set's negatives. Any *new* title
collision the exporter finds is printed as a warning and both cards are kept, so
future duplicates surface loudly instead of being merged on a guess.

**Still outstanding — 36 candidate pairs, reported not merged.** `meta.merges.alias_overlaps`
lists every pair of cards sharing a surface form. Where the shared surface is one
card's own title, the pair is very likely one concept filed twice:

`agi`/`artificialgeneralintelligence` · `gan`/`generativeadversarialnetwork` ·
`vae`/`variationalautoencoder` · `hyde`/`hypothetical-document-embeddings` ·
`tokenization`/`tokenizer` · `systemmessage`/`systemprompt` ·
`quantization`/`modelquantization` · `serving`/`modelserving` · `parameters`/`weights` ·
`data-poisoning`/`poisoneddata` · `residualconnection`/`skipconnection` ·
`agent-framework`/`agenticframework` · `diffusionmodel`/`diffusionmodelpm` ·
`topp`/`topk`/`topptopk` · `bias`/`biasterm` · `sampling`/`topptopk` ·
`promptoptimization`/`prompttuning` · `personaprompting`/`roleprompting` ·
`superresolution`/`upscaling` · `texttovideo`/`videogeneration` ·
`majorityvoting`/`selfconsistency` · `semantic-search`/`similarity-search` ·
`batchinference`/`batching` · `imageediting`/`inpainting` · `asr`/`speechtotext` ·
`documentunderstanding`/`ocr` · `bytepairencoding`/`tokenizer` ·
`function-calling`/`tool-use` · `tool-calling`/`tool-use` · `agent-memory`/`short-term-memory` ·
`ai-safety`/`responsible-ai` · `crewai`/`agenticframework` · `autogen`/`agenticframework` ·
`checkpointing`/`gradient` · `imageediting`/`inpainting` · `human-eval`/`humaneval` (a real
distinction, not a duplicate)

Not all of these are duplicates — some are a general card and a specific one
(`tool-use` vs `function-calling`), which is a real distinction worth keeping. Which
is which is an editorial call on the shelf, not something an exporter should decide,
so the exporter reports and stops. Worth resolving before the top-5 cut-off is tuned,
since a duplicate pair spends two of five slots on one concept.

## Known data issues

- **`serversent events`** — this card's id contains a space. It is a real published id,
  so the export preserves it, but it will not survive a URL as `terms[].card_id`.
  Fixing it means a DB rename plus a redirect, which is shelf work, not export work.
- **99 `related` entries carry prose but no card id**, so they do not appear in the
  export's `related`. They are only navigational text on the card, not retrieval signal.
- **112 cards have no aliases and 254 have no `related`.** Both are allowed by the
  contract. The alias-free cards are lexical-leg blind spots — they can only be
  reached semantically.
- **4 cards have no page under `web/term/`**: `a2a`, `agentops`, `agentidentity`,
  `agentpayments`. Term pages are generated from the DB and these four come from
  `web/concepts.js`, so the site shows them in the shelf but has no `/term/<id>` URL
  for them. Anything that turns a `terms[].card_id` into a `/term/` link will 404 on
  these — resolve chips through the in-app card opener instead, or generate the four
  pages with `scripts/build-term-pages.js`. The exporter reports this on every run.
- **5 term pages have no card behind them** — `aisafety`, `incontext`, `moe`,
  `redteaming`, `semanticsearch`, the duplicates collapsed above. Orphaned, not broken;
  worth a redirect to their canonical twin whenever the site is next rebuilt.

## Golden set

All 113 card-ID references across the 39 rows of `golden-set-decoder-filled.csv`
resolve against this export, including the 11 negative rows, which correctly
reference nothing. Checked on every run.
