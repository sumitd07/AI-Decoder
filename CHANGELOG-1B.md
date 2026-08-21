# Explain This 1b — changelog and ship checklist

Extension **v1.0.4 → v1.1.0**, plus a public demo on the web app.
Written 2026-08-21. Decisions behind every choice: `Mitsu/Docs/DECISIONS-Explain-This.md`
D31–D39. Current state: `EXPLAIN-THIS-STATE.md`.

**No backend change.** `explain/`, `web/api/explain.js` and the shelf index are untouched.
Both new surfaces post the same `{ sentence }` to the same `/api/explain` the Decode box
has been using.

---

## What changed

### New files

| File | What it is |
|---|---|
| `extension/extract.js` | Selection → one clean sentence. Pure, DOM-free. **Source of truth** |
| `extension/explain.js` | Surface 1b: the Decode pill, the answer panel, chip resolution |
| `web/extract.js` | Copy of the above — Vercel's root is `web/`, so the demo needs its own |
| `preview/1b.html` | DEV harness. Shims `chrome.*`. **Never deploy this** |
| `preview/chrome-shim.js` | Same, for opening the real popup in a normal tab |
| `tests/extract.test.js` | 26 extraction cases + a guard that fails if the two copies drift |
| `CHANGELOG-1B.md` | This file |

### Changed — extension

| File | Change |
|---|---|
| `manifest.json` | Version → **1.1.0**. Description mentions sentences. `https://aidecoder.app/*` added to **optional** hosts. **No new required permission** (D34) |
| `background.js` | New `explain` and `getCard` message handlers; registers `extract.js` + `explain.js` |
| `content.js` | Narrow `window.__decoderCard` bridge for 1b; highlighter now honours its switch; popover controls got press/hover/focus states |
| `content.css` | 1b panel and pill styles; term hover gated behind a fine pointer; motion aligned to the web app (D38) |
| `popup.html` / `popup.js` | **Two switches** — Highlight terms, Decode sentences (D36). Opt-in copy now covers both surfaces |
| `PRIVACY.md` | Discloses that a decoded sentence leaves the device |
| `STORE-LISTING.md` | Single purpose, permission justifications, data-collection, reviewer steps, screenshots |
| `README.md` | 1b install steps, how it works, how to run the harness |

### Changed — web

| File | Change |
|---|---|
| `index.html` | **New "How it works" tab** (D39) — the 1b surface, live, on a sample article, at `/#how-it-works`. Also: a pre-existing mobile header overflow fixed |
| `privacy.html` | Discloses the decode call for **both** the web Decode box and the extension. The box was never disclosed either — fixed in the same pass |
| `scripts/preview-server.js` | Serves `preview/`, and injects the chrome shim on `?shim=1`. Dev only |

### Changed — docs

`EXPLAIN-THIS-STATE.md` (1b marked built, verification recorded), `HANDOFF-1B-HIGHLIGHTER.md`
(marked history), `Mitsu/Docs/DECISIONS-Explain-This.md` (D31–D39).

---

## CTA 1 — Deploy the web app. Do this FIRST.

The privacy policy currently live says page content is never sent anywhere. That stops
being true the moment v1.1.0 is in anyone's browser, so **the site has to go out before
the extension is submitted**, not after.

```bash
cd "/Users/shibbypills/Documents/Mitsu/AI Dictionary" && git add -A && git status
```

Check the list before committing — another session has its own uncommitted work in
`explain/` and `eval/` (see Flags). Then:

```bash
cd "/Users/shibbypills/Documents/Mitsu/AI Dictionary" && git commit -m "Explain This 1b: extension highlighter, public demo, privacy disclosure" && git push
```

**`web/extract.js` must be in the commit** — it is new, and without it the How it works
tab silently offers no Decode button.

Then check production:

```bash
curl -sI https://aidecoder.app/extract.js | head -1
```

and open `https://aidecoder.app/#how-it-works` — highlight a sentence in the sample
article, press Decode, click a chip. Also open `https://aidecoder.app/privacy` and
confirm it mentions Gemini.

## CTA 2 — Real-Chrome pass on the extension

Nothing touching `chrome.*` has been verified — it cannot be, outside a real browser.
`chrome://extensions` → Developer mode → **Load unpacked** → pick `extension/`.

1. Toolbar popup → **Enable on all sites**, approve the prompt.
2. Open a dense AI article. Terms get a dotted underline; click one; the card opens.
3. **Highlight a sentence → the Decode pill appears → click it.** The answer lands in place.
4. **Click a chip whose card is not one of the bundled 95** (top-k, reranking, retrieval
   are all good tests) — it should fetch and open. This is the path that needs Supabase.
5. Popup → toggle **Decode sentences** off. The pill stops appearing, underlines stay.
6. Popup → toggle **Highlight terms** off. Underlines vanish, decode still works.
7. Scroll a long article with the panel open; it should follow its sentence.

If step 4 fails, it is the anon Supabase RPC, not the pipeline. If step 3 fails with a
permission message, `<all_urls>` was not granted.

## CTA 3 — Repackage and submit the listing

**Before zipping:** `extension/config.js` holds live Supabase keys. That is by design
(publishable key), but confirm nothing else crept in.

1. Finder → right-click `extension/` → **Compress**.
2. Web Store dashboard → the Decoder item → **Package → Upload new package**.
3. **Store listing tab:** update the description (it now mentions sentences) and set
   **Homepage URL** to `https://aidecoder.app/#how-it-works`.
4. **Screenshots — these need re-shooting.** The current ones show only the highlighter.
   1280×800, from `STORE-LISTING.md` §1: underlined terms; the term popover; **a decoded
   sentence panel**; the popup with the two switches.
5. **Privacy tab — this is the one that changes.** `STORE-LISTING.md` §3 has the exact
   wording. The material change: add **Website content** to the data-collection form —
   user-initiated, one sentence at a time, purpose App functionality. Leave the three
   certifications ticked; they all still hold.
6. **Test instructions tab:** paste the updated block from `STORE-LISTING.md` §3b — it
   now tells the reviewer to highlight a sentence, which they will not discover alone.
7. Submit.

---

## Flags

**1. The 1a grounding gate is still breached.** 10 of 39 golden rows carry an ungrounded
claim, and the PRD calls a single confident invention a ship-blocker. 1b went ahead on
your explicit call, logged as D31. **D13's model bake-off has still never run** — one env
var, about $0.20, ~90 seconds, and it is the cheapest thing that could move that number.

**2. Someone else's work is in this repo right now.** `explain/explain.js`,
`explain/generate.js` and `eval/run.js` have uncommitted changes I did not make —
`maxTokens` 800→2000 and the prompt's rules 4 and 7 tightened against naming a gap and
then explaining it anyway. That is aimed squarely at the grounding number, so **re-run
the eval before trusting 10/39**. Mid-session that other session also ran `git stash`,
which reverted my files under me; recovered from `stash@{0}`, which is still there and
still holds their `explain/` work. Check `git status` before you commit.

**3. The demo makes the missing rate limit louder.** Every decode costs a model call and
D5 still ships with no spend ceiling and no per-IP limit. The demo caps itself at 8
decodes per visit, which stops honest over-use and nothing else. Phase 3 (C8) is the real
fix. Worth watching the Gemini bill for a week after launch.

**4. The Vercel deploy blocker looks resolved.** The live endpoint answered a real request
in about 3 seconds. Whoever fixed it did not write down which of the two fixes they used.
