# Decoder — project state (read this first)

Compact snapshot so a new session doesn't re-derive everything. For deep history see `DECISIONS.md`.

## What it is
A plain-language glossary for AI terms. Look a term up (or click it while reading) → get a simple explanation + example + status (Core/Rising/Fading/Historical). Sign in to save terms; they sync across the web app and the browser extension.

- **Live site:** https://aidecoder.app (Vercel; also `ai-decoder-nine.vercel.app`).
- **Live extension:** https://chromewebstore.google.com/detail/decoder-%E2%80%94-ai-terms-explai/lmkalmchomfbhfjmbepnldbcpmknajbh (Chrome Web Store). Store has v1.0.0; local code is at v1.0.2 (v1.0.1: popup web-app footer link; v1.0.2: OAuth moved to background worker). `decoder-extension-v1.0.2.zip` at repo root is ready to upload.
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
- **Store submission:** DONE — extension is live (see link above).
- **Ship v1.0.2:** upload `decoder-extension-v1.0.2.zip` to the Web Store dashboard (footer link + OAuth fix are local-only until then).
- **Deploy web changes:** push/redeploy `web/` to Vercel. Latest local-only change: sign-in robustness fix in `index.html` — the old "Sign-in isn't connected yet — see SETUP.md" toast fired whenever supabase-js (esm.sh) failed or hadn't finished loading, not just when keys were blank; `doSignIn` now waits up to 8s for the cloud bridge and shows user-facing messages, and the bridge import is wrapped in try/catch (`window.__decoderCloudError`).
- **Extension OAuth untested** — needs the extension's `https://<id>.chromiumapp.org/` redirect added to Supabase Redirect URLs, and one real-browser debug pass.
- **DB `related` text quality:** DB-seeded terms show fragment-y Related rows ("The window itself is the") — flagged as a separate task.

## Working constraints
- Cowork sessions CAN now use a browser preview + reach Supabase over the network (both were blocked in earlier sandboxes; DECISIONS entries 1–21 predate this). Preview: `scripts/preview-server.js` serves `web/` on :8743 (and `/extension/popup.html`); a `decoder-web` entry exists in Cowork's `.claude/launch.json`.
- Still off-limits: signing into Google/Supabase accounts and entering credentials — OAuth flows and store uploads are the user's.
- Contact email: sumitd0704@gmail.com.
