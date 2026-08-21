# Decoder — Chrome extension

Subtly underlines AI jargon on any web page. Click a term to understand it in seconds and save it — the browser adaptation of Decoder's "Read" surface. Highlight a whole sentence and it is explained in plain English in place ("Explain This", surface 1b).

## Install (unpacked, for testing)

1. Open `chrome://extensions` in Chrome (or any Chromium browser — Edge, Brave, Arc).
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select this `extension/` folder.
4. Click the Decoder toolbar icon and press **Enable on all sites** (approve Chrome's prompt). This is the one-time opt-in that grants page access.
5. Visit any article-heavy page (news, blog, docs). Known AI terms get a faint dotted underline.
6. Click an underlined term → an in-place card explains it, with **＋ Save**.
7. Highlight a sentence in the article → a **Decode** pill appears at the end of the selection → click it. The sentence is explained in place, with a chip for every shelf term in it and a line naming anything the shelf doesn't cover.
8. Click the toolbar icon anytime to see your saved terms, flip **Highlight terms** / **Decode sentences** independently, or **Turn off** to revoke access.

## How it works

- **Permission is opt-in.** At install the extension has no page access — `<all_urls>` is an *optional* permission requested only when the user clicks **Enable on all sites**. This keeps broad access out of the required manifest (no Web Store broad-permission warning).
- Once granted, `background.js` registers the content script for all sites (and the popup injects it into the current tab immediately, so it lights up without a reload).
- `content.js` scans page text for the shelf terms (via each concept's alias list), wraps matches in a subtle highlight, and shows the popover on click. A re-injection guard (`window.__decoderLoaded`) prevents double-binding, and links (`<a>`, `role="link"`) are skipped so clicks aren't hijacked (e.g. Google result titles).
- Matching is word-boundary aware and longest-first, so "context window" wins over "context", and short tokens (e.g. "rag") won't match inside other words ("storage").
- It watches for dynamically loaded content (infinite scroll, SPAs) and highlights new text as it appears.
- **Decoding is opt-in twice over: the host permission, then the click.** Highlighting a sentence sends nothing; clicking **Decode** posts that one sentence to `https://aidecoder.app/api/explain` — the same endpoint the web app's Decode box uses, unchanged. The call runs in the service worker, not the content script: a content-script `fetch` is subject to the *page's* CORS and the endpoint sends no CORS headers.
- **The selection is repaired before it is sent.** `extract.js` rejoins hyphenated line breaks, drops soft hyphens and footnote markers, collapses two-column whitespace, completes a partial selection to its sentence boundaries from the surrounding block, and caps the result at three sentences and 1000 characters — saying so in the panel when it trims. It is pure and DOM-free, and covered by `tests/extract.test.js`.
- **Chips open cards, never URLs.** The endpoint answers from the full 1010-card shelf while the extension bundles 95, so a chip whose card isn't local is fetched by id from Supabase (public glossary data, anon key, no session) and opened through the same popover renderer.
- **Two switches, stored in `chrome.storage.local` under `decoder.features`.** Both default on; content scripts follow `storage.onChanged`, so a flip lands in every open tab without a reload. The switches only appear once page access is granted.
- **Saved terms syncs with the web app account.** Sign-in (Google, via `chrome.identity` → Supabase) and saves are handled with plain `fetch` against Supabase's REST API — no bundled library. `content.js` and `popup.js` route reads/writes through `background.js`, which holds the session and calls Supabase. Terms saved in the extension appear in the web app's saved terms and vice-versa. Without sign-in, saving is disabled and nothing is transmitted.

## Files

| File | Role |
|------|------|
| `manifest.json` | MV3 manifest — `storage`/`scripting`/`identity`, required `supabase.co` host, **optional** `<all_urls>`, popup, background worker |
| `background.js` | Service worker: registers/unregisters the content script on opt-in, and routes saved terms reads/writes to Supabase |
| `config.js` | Your Supabase URL + publishable key (same project as the web app) |
| `supa.js` | Supabase auth (Google via `chrome.identity`) + REST helpers, plain `fetch` |
| `concepts.js` | Glossary data + status metadata. **Exact copy of `web/concepts.js`** (the single source) — edit there, then `cp web/concepts.js extension/concepts.js` |
| `content.js` | Page scanner, highlighter, and click-to-explain popover (injected after opt-in). Exposes a narrow `window.__decoderCard` bridge for `explain.js` |
| `extract.js` | Selection → one clean sentence. Pure, no DOM, no `chrome.*` — testable in Node |
| `explain.js` | Surface 1b: the Decode pill, the answer panel, chip resolution |
| `content.css` | Highlight style, popover/toast animations, and the 1b panel — one motion language with the web app |
| `popup.html` / `popup.js` | Sign-in, the account saved terms, the "Enable on all sites" opt-in, and the two feature switches |

## Working on it

- `node --test` from the repo root runs the extraction tests (no browser, no network, no key).
- `node scripts/preview-server.js` then <http://localhost:8743/preview/1b.html> loads the
  real `content.js` / `extract.js` / `explain.js` / `content.css` on a deliberately messy
  article with `chrome.*` shimmed. `/api/explain` there is the **real** pipeline; nothing
  is mocked. Add `?mode=500`, `?mode=network`, `?mode=malformed` or `?mode=400` to see the
  failure states.
- <http://localhost:8743/extension/popup.html?shim=1> opens the real popup in a normal tab
  (add `&granted=0` for the pre-opt-in state).
- None of that exercises `chrome.*` for real. Anything touching permissions, the registered
  content script, cross-tab storage events or the popup's own window is unverified until
  the extension is loaded unpacked.

## Notes & scope

- Toolbar/store icons (16/32/48/128px, a "d" with a dot) are in `icons/` and wired into `manifest.json`. Promo tiles for the store are in the top-level `store-assets/` folder.
- The popover uses system fonts (not the Newsreader/Inter web fonts) so it renders instantly and identically on any page without a network fetch.
- Data is bundled in the extension; there's no backend or live "currency" updates. Keeping `concepts.js` in sync with the web app's shelf is a manual step for now.
