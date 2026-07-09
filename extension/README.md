# Decoder — Chrome extension

Subtly underlines AI jargon on any web page. Click a term to understand it in seconds and save it to your cheatsheet — the browser adaptation of Decoder's "Read" surface.

## Install (unpacked, for testing)

1. Open `chrome://extensions` in Chrome (or any Chromium browser — Edge, Brave, Arc).
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select this `extension/` folder.
4. Click the Decoder toolbar icon and press **Enable on all sites** (approve Chrome's prompt). This is the one-time opt-in that grants page access.
5. Visit any article-heavy page (news, blog, docs). Known AI terms get a faint dotted underline.
6. Click an underlined term → an in-place card explains it, with **＋ Save to my cheatsheet**.
7. Click the toolbar icon anytime to see your saved cheatsheet (or **Turn off** to revoke access).

## How it works

- **Permission is opt-in.** At install the extension has no host access — `<all_urls>` is an *optional* permission requested only when the user clicks **Enable on all sites**. This keeps broad access out of the required manifest (no Web Store broad-permission warning).
- Once granted, `background.js` registers the content script for all sites (and the popup injects it into the current tab immediately, so it lights up without a reload).
- `content.js` scans page text for the shelf terms (via each concept's alias list), wraps matches in a subtle highlight, and shows the popover on click. A re-injection guard (`window.__decoderLoaded`) prevents double-binding.
- Matching is word-boundary aware and longest-first, so "context window" wins over "context", and short tokens (e.g. "rag") won't match inside other words ("storage").
- It watches for dynamically loaded content (infinite scroll, SPAs) and highlights new text as it appears.
- Saves live in `chrome.storage.local` and sync between the popover and the toolbar cheatsheet.

## Files

| File | Role |
|------|------|
| `manifest.json` | MV3 manifest — `storage` + `scripting` permissions, **optional** `<all_urls>` host access, popup, background worker |
| `background.js` | Service worker: registers/unregisters the content script based on whether the user has granted access |
| `concepts.js` | Shared concept data + status metadata (single source of truth) |
| `content.js` | Page scanner, highlighter, and click-to-explain popover (injected after opt-in) |
| `content.css` | Highlight style + popover/toast animations |
| `popup.html` / `popup.js` | Toolbar cheatsheet + the "Enable on all sites" opt-in control |

## Notes & scope

- Toolbar/store icons (16/32/48/128px, a "d" with a dot) are in `icons/` and wired into `manifest.json`. Promo tiles for the store are in the top-level `store-assets/` folder.
- The popover uses system fonts (not the Newsreader/Inter web fonts) so it renders instantly and identically on any page without a network fetch.
- Data is bundled in the extension; there's no backend or live "currency" updates. Keeping `concepts.js` in sync with the web app's shelf is a manual step for now.
