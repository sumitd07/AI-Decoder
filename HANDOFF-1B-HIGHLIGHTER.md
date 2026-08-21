# Explain This — handover for surface 1b (the extension highlighter)

> **STATUS 2026-08-21: 1b is BUILT.** This file is now history — the reasoning it set out
> is what the build followed, and where the build decided something the file left open,
> the decision is recorded as D31–D38 in `Mitsu/Docs/DECISIONS-Explain-This.md`.
> For current state read `EXPLAIN-THIS-STATE.md`. What is still owed:
> a real-Chrome pass, store screenshots, and the privacy redeploy.
>
> The gate question at the top of this file was answered by Sumit directly — proceed,
> on the grounds that 1b adds no backend risk (D31). D13's bake-off still has not run.

Read `HANDOFF-EXPLAIN-THIS.md` first for the state of 1a and the pipeline. This file
is only about 1b.

---

## Read this before you write any code

**1b's gate is not met.** D4 and D19 both say the highlighter starts *only after 1a's
eval passes.* 1a's eval has run, and it did not pass:

| Axis | Score /5 |
|---|---|
| Correct | 4.51 |
| In-voice | 4.54 |
| Useful | 4.51 |
| Grounded | 4.23 |
| **Ungrounded claims** | **10 / 39 rows** |

The PRD calls a single confident invention a ship-blocker. Ten rows carry one.

That is not a reason to refuse the work — it is a decision Sumit has to make
explicitly, because the gate was written down and it is being crossed. The two honest
readings:

- **Wait.** The gate exists so a surface is never built on an untrusted pipeline. The
  cheapest thing that could move it is D13's bake-off (below), which has never run.
- **Proceed anyway,** on the grounds that 1b adds no backend risk — it reuses the exact
  endpoint 1a already uses — and that Phase 3's verification gate is where grounding
  gets *enforced* rather than measured (D17 says so explicitly). Under this reading the
  10/39 is expected, not a regression.

Get that decision from Sumit before starting. Do not let it be decided by silence.

## What 1b actually is

**No backend work.** The pipeline is surface-agnostic by design: `explain/explain.js`
does not know where a sentence came from, and `web/api/explain.js` takes
`POST { sentence }` and returns `{ restatement, terms[], gaps[] }`. 1a already proves
that path end to end in production.

1b adds exactly two things, and a failure in either is *the surface*, not the pipeline
— which is the whole point of splitting them (D19):

1. **Clean sentence extraction from a messy page.** The shelf is 1010 hand-written
   cards; the web is nav chrome, ads, code blocks, footnotes, tables, two-column PDFs.
2. **In-place render** — the explanation appears where the reader is, without leaving
   the page.

## What already exists in `extension/`

Live on the Chrome Web Store; local code is **v1.0.4**. MV3.

| File | What it does |
|---|---|
| `content.js` (273 lines) | The existing term highlighter: `scanRoot` walks text nodes, `highlightNode` wraps matches, `renderPopover` shows a card. **This is the file 1b extends.** |
| `content.css` | Popover and highlight styling |
| `background.js` | Service worker. Registers the content script after opt-in, fetches `concepts.json` from aidecoder.app on install/startup, caches in `chrome.storage.local` |
| `supa.js` | Auth (chrome.identity → Supabase) + REST |
| `config.js` | Supabase keys |
| `popup.js` / `popup.html` | Sign-in, saved terms, "Enable on all sites" |

Manifest today: permissions `storage`, `scripting`, `identity`; required host
`https://*.supabase.co/*`; **optional** `<all_urls>` (opt-in, which is why the store
listing carries no broad-permission warning).

## Things that will bite you

**1. The manifest needs a new host permission, and that is a store-review event.**
The content script must reach `https://aidecoder.app/api/explain`. Today the only
required host is Supabase. Adding a host permission changes the store listing's
permission disclosure and needs `STORE-LISTING.md` updated. Do not discover this at
submission time.

**2. Every call costs money and there is no rate limit.** D5 deliberately ships open,
with the spend ceiling and per-IP limit deferred to Phase 3 — and the seam for them is
marked in `web/api/explain.js`, unbuilt. 1a is a box someone types into; 1b fires on a
highlight, which is a far easier gesture to repeat. Decide the trigger deliberately: a
button on the selection is safer than firing on `selectionchange`.

**3. Cold starts are ~20s, warm is ~1.3s, and the cause is unidentified.** On the web
page that reads as a slow box. In a popover over someone's article it reads as broken.
See the cold-start section in `HANDOFF-EXPLAIN-THIS.md` — including the measurement
that would settle it, which has not been run.

**4. Chips must not link to `/term/<id>`.** Four cards have no term page (`a2a`,
`agentops`, `agentidentity`, `agentpayments`) and one id contains a space
(`serversent events`). 1a resolves chips through the in-app card opener (D28). The
extension has its own card renderer in `content.js` — route chips through that, and
check the id against loaded concepts before rendering a link.

**5. The extension's OAuth flow is still untested in a real browser.** Pre-existing,
unrelated to 1b, but it will surface if you touch auth. It needs the extension's
`https://<id>.chromiumapp.org/` redirect added to Supabase's Redirect URLs.

**6. Chrome-API flows cannot be verified in this environment.** Anything touching
`chrome.*` is unverified until someone loads the extension unpacked and tests by hand.
Say so in your report rather than implying it was tested.

## The real problem: sentence extraction

This is the part with no prior art in the repo, and the reason 1b is its own step.

A reader highlights loosely. They select part of a sentence, or a sentence and a half,
or drag across a line break in a two-column layout and pick up a footnote marker. The
pipeline expects one clean sentence, ≤1000 characters.

Worth deciding up front, and worth writing down as decisions:
- Do you send the raw selection, or expand/trim it to sentence boundaries first?
- What happens on a multi-sentence selection — refuse, take the first, or send all?
- Code blocks and inline `<code>`: strip, or keep as part of the sentence?
- Do you normalise whitespace and soft hyphens from PDF-ish layouts?

The eval measures the *pipeline*, not extraction. If you change what a sentence looks
like before it reaches the endpoint, none of 1a's numbers transfer. Consider a small
extraction test set of real messy selections, scored separately.

## Do these first

1. **Get Sumit's explicit call on the gate** (top of this file).
2. **Run D13's bake-off** — `LLM_MODEL=gemini-pro-latest node eval/run.js --label=pro`,
   then the two scorers. ~$0.20, ~90 seconds. It has never been run and it is the
   cheapest thing that could move the grounding number, which is what the gate turns on.
   It also answers the open question from D29: the generator shows ~2.3 term chips per
   row no matter how many cards it is given — is that Flash-Lite, or the task?
3. **Only then** touch `extension/`.

## Do not

- Do not modify anything under `explain/` or `web/api/` for 1b. If you think the
  backend needs a change, that is a finding to report, not a task — the whole value of
  the 1a/1b split is that a 1b failure is known to be the surface.
- Do not re-tune retrieval. D29 records that raising the top-5 cap improved retrieval
  recall and made the reader's experience worse. It is settled unless a stronger
  generator changes the picture.
- Do not build the spend ceiling, rate limit, or verification gate. They are Phase 3
  (D5, C8) and the seams are already marked.

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
