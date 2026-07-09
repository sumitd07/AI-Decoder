# Decoder — project state (read this first)

Compact snapshot so a new session doesn't re-derive everything. For deep history see `DECISIONS.md`.

## What it is
A plain-language glossary for AI terms. Look a term up (or click it while reading) → get a simple explanation + example + status (Core/Rising/Fading/Historical). Sign in to save terms; they sync across the web app and the browser extension.

- **Live site:** https://aidecoder.app (Vercel; also `ai-decoder-nine.vercel.app`).
- **Terminology:** the saved collection is called **"saved terms"** (NOT "cheatsheet" — renamed). Tone: simple, direct, minimal formatting.

## Layout
- `web/index.html` — the whole web app (vanilla JS, single file). `web/privacy.html` — privacy policy page (`/privacy`). `web/vercel.json`.
- `extension/` — Chrome MV3 extension (see below).
- `supabase/schema.sql` — `cheatsheet_items` table + RLS.
- `SETUP.md` (deploy/setup, plain-language), `TESTING.md`, `STORE-LISTING.md` (in extension/), `DECISIONS.md` (rationale log).
- `01-strategy/`, `02-prototype/` — historical; `store-assets/` — icons + promo tiles.

## Architecture
- **Auth + data:** Supabase project `ivyfvwnxjkqyicbjzqoz`. Google OAuth. Table `cheatsheet_items(user_id, concept_id)` with per-user RLS. Web app + extension write to the SAME table (concept IDs match), so saves sync.
- **Web app:** single HTML file; Supabase via ESM CDN in a small module bridge; keys in `window.DECODER_CONFIG` (filled). Signed-out = gated (save prompts sign-in; shelf shows a sign-in CTA). Mobile-optimized. "Go deeper" uses a WAAPI height animation.
- **Extension (MV3):** `manifest.json` — `storage`+`scripting`+`identity`, required host `https://*.supabase.co/*`, **optional** `<all_urls>` (opt-in, so no broad-permission warning). `background.js` registers the content script after opt-in + routes save/list/remove to Supabase. `supa.js` = auth (chrome.identity→Supabase) + REST (plain fetch). `config.js` = Supabase keys (filled). `content.js` = highlighter + popover (skips links). `popup.js/html` = sign-in + saved-terms list + "Enable on all sites". Icons = "d" with a dot.

## Glossary source (unified)
- **Single source:** `web/concepts.js` defines `DECODER_CONCEPTS` (full: term, aliases, aliasList, status, oneLiner, analogy, example, related, deeper), `DECODER_LENSES`, `DECODER_STATUS`. Web app loads it via `<script src="concepts.js">` (DATA/LENSES no longer inline); extension loads it in the content script + popup.
- **`extension/concepts.js` is an exact copy.** To change the glossary: edit `web/concepts.js`, then `cp web/concepts.js extension/concepts.js`, then redeploy web + reload/re-zip the extension.

## Known gaps / TODO
- **Domain:** DONE — `aidecoder.app` live on Vercel.
- **Extension OAuth untested** — needs the extension's `https://<id>.chromiumapp.org/` redirect added to Supabase Redirect URLs, and one real-browser debug pass.
- **Store submission:** needs real 1280×800 screenshots; permission justifications/data-collection/reviewer note are written in `STORE-LISTING.md`.

## Working constraints
- No browser / no Supabase / npm registry blocked in this sandbox. Verify code with `node --check` + static/grep checks; visual + OAuth testing happens in the user's browser.
- Contact email: sumitd0704@gmail.com.
