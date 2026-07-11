# Decision & challenge log

A running record of the meaningful decisions, trade-offs, and challenges on Decoder — kept for future reference (and interviews). Newest entries at the bottom. Each entry: what was decided, why, what was rejected, and any challenge hit.

---

## 1. Reframe: "learning tool" → "orientation tool"
**Decision.** Positioned Decoder as a decoder ring for AI jargon, not a course.
**Why.** The brief was "learn everything AI, optimised for simplicity." The word "learn" drags in curricula, progress bars, and video — the exact weight users are trying to escape. The real job-to-be-done is: a term flew by, get me un-lost in ~20 seconds, then back to what I was doing.
**Rejected.** A course/module structure; a static dictionary (ignores that the field's vocabulary decays — e.g. "vibe coding").
**Consequence.** Drove every later choice: one-breath explanations, status tags (Core/Rising/Fading/Historical), and "obituary" cards for dead terms.

## 2. Tech: single-file vanilla HTML/JS, no framework
**Decision.** Build the web app as one self-contained `.html` file with vanilla JS; no build step, no dependencies.
**Why.** (a) The Claude Design handoff explicitly said recreate the *visual output* in whatever tech fits — not copy the prototype's runtime. (b) Zero-dependency static files are trivial to host, hand off, and review. (c) Keeps the prototype legible.
**Rejected.** React/Vue — unnecessary ceremony for a 15-concept prototype; a build pipeline adds friction with no payoff yet.
**Trade-off (named honestly).** State is one global object with full-innerHTML section re-renders. Fine at this scale; a production version would move to a component framework with keyed diffing.

## 3. Rendering architecture: render-once + targeted patches; CSS-var theming
**Decision.** Static surfaces (header, article) render once; only overlays and the cheatsheet re-render. Theme (light/dark) and status colors are driven by CSS variables scoped to `[data-theme]`, so theme switching is pure CSS with no JS re-render.
**Why.** Full re-renders break text selection and replay entrance animations. CSS-var theming avoids re-computing/re-rendering colored elements on toggle.

## 4. CHALLENGE — CSS custom-property scoping bug (modal "all over the place")
**Symptom.** The detail modal rendered with broken colors (transparent bg, black text) while status badges still had color.
**Root cause.** The overlay root containers (`#modalRoot`, `#spotRoot`, …) lived *outside* the `.dm-shell` element, but all theme variables (`--surface`, `--text`, `--accent`) were defined *on* `.dm-shell`. CSS variables inherit down the tree, not to siblings — so `var(--surface)` inside the modal resolved to nothing.
**Fix.** Moved the overlay roots inside `.dm-shell` so they inherit the theme.
**Why I missed it & process change.** My verification tested behavior (syntax, data integrity, logic) but never the *rendered appearance* — and the sandbox has no browser (and the npm registry is blocked, so no jsdom/puppeteer), so I can't produce a pixel render. Added a **static CSS-var scope audit** to catch this class of bug: it asserts every `var(--x)` used has a definition, and that dynamic overlay roots are descendants of the themed shell. Standing limitation documented: true visual QA needs the user's browser/preview tab.

## 5. Animation smoothness (Emil design-eng review)
**Decision.** Stop rebuilding the modal on internal state changes; patch in place with interruptible CSS transitions.
- **Lens toggle (Plain/In practice/Technical):** was a full modal rebuild → replayed the entrance `pop`. Now the segment buttons update in place and the one-liner crossfades (fade out → swap text → fade in). No rebuild.
- **"Go deeper":** was `renderModal(false)` (rebuild, no animation). Now an interruptible `grid-template-rows: 0fr → 1fr` collapse + opacity, custom ease-out `cubic-bezier(.23,1,.32,1)`, ~240ms. Chosen over `max-height` (no magic number) and over rebuild (janky).
**Also applied from Emil's guidance.** `:active { scale(0.98) }` press feedback; gate `:hover` transforms behind `@media (hover:none)` so taps don't leave sticky states on touch; honor `prefers-reduced-motion`; entrance animations only on open, never on internal updates.
**Rejected.** Keyframes for interruptible UI (they restart from zero); animating height directly (layout thrash).

## 6. Copy & voice
**Decision.** (a) Removed "AI-slop" copy — e.g. hero went from *"Not a course you finish — a friend you check with…"* to *"Understand any AI term in seconds."* (b) Standardized in-product voice to first person ("**my** cheatsheet") everywhere; kept second person ("**your** cheatsheet") only in store/README marketing copy.
**Why.** The dash-reframe rule-of-three reads as machine-generated; simple and direct builds trust. The voice split is deliberate: product chrome speaks *as the user* ("my"), marketing speaks *to the user* ("your").

## 7. Removed the "Read" demo surface
**Decision.** Deleted the in-app Read/select-to-explain demo.
**Why.** The Chrome extension now delivers that exact experience on real pages, so the in-app demo became redundant. Removed the tab, section, article handlers, and orphaned trigger functions; left the popover render helpers dormant (guarded by `state.sel`) to avoid touching many call sites — a low-risk call for a prototype.

## 8. Chrome extension design
**Decision.** MV3 content script that underlines shelf terms and shows a click-to-explain popover; toolbar popup for the cheatsheet; `chrome.storage.local` for saves.
**Key choices & why.**
- **Matching:** single regex, alternation sorted **longest-first** (so "context window" beats "context"), with `(?<![\w-])…(?![\w-])` boundaries so short tokens like "rag" don't fire inside "storage". Unit-tested with 8 cases.
- **Styling:** popover uses **inline styles + a forced light surface** (readable on light *and* dark host pages) and **system fonts** (instant, no web-font fetch, no CSP issues). Considered Shadow DOM for isolation — deferred as heavier than needed; inline styles resist host CSS well enough.
- **Dynamic pages:** debounced `MutationObserver` highlights content that loads later (SPAs, infinite scroll), guarded so our own inserted spans don't cause loops.

## 9. Auth + sync backend: Supabase
**Decision.** Google sign-in + cross-device cheatsheet via Supabase (Postgres + row-level security), called from the static client with the public anon key.
**Why.** Least code for "simple and secure": Google auth, DB, and per-user RLS out of the box; generous free tier; anon key is safe in the browser because RLS scopes every row to `auth.uid()`.
**Rejected.** Firebase (more lock-in), custom Node backend (most to build/host), staying local-only (user wants secure cross-device).
**Honest constraint.** I can't run the Supabase/Google/hosting/GitHub steps — they need the user's accounts and credentials, and creating accounts / entering secrets is out of scope for me. Wrote `SETUP.md` with exact steps and verified the OAuth flow against current Supabase docs (the `redirect_uri_mismatch` gotcha: must copy the full `/auth/v1/callback` path).

## 10. Progressive-enhancement auth model
**Decision.** Three states: **unconfigured** (no keys) → preview mode; **configured + logged out** → gated UI with working sign-in; **signed in** → cloud sync. On first sign-in, merge any local saves up to the cloud, then treat the cloud set as source of truth.
**Why.** Lets the gated design be fully reviewable *before* Supabase is wired (sign-in buttons show a "not connected yet" toast), and nothing looks broken in any state.
**Challenge — script ordering.** The Supabase bridge is an ES module (deferred), so it runs *after* the classic app script. Solved by having the module dispatch a `decoder-auth` CustomEvent that the already-registered app listener handles — no race, no polling.

## 11. Gating model vs. the "no sign-up" promise
**Decision.** Looking up terms stays free (no account); **saving** requires sign-in; logged-out shelf shows a preview (cap 100) with a sign-in CTA to "access more." Save actions on a logged-out user open a sign-in prompt instead of failing silently.
**Tension resolved.** This conflicted with the old hero line "No sign-up." Changed it to "Free to look up" — accurate: browsing is free, saving/sync is the reason to sign in. Also gated the tab badge and grid "saved" flags behind sign-in so stale local saves don't leak into the logged-out UI.

## 12. Mobile optimization approach
**Decision.** Responsive via `@media` overrides keyed to added ids/classes (with `!important`), rather than refactoring the heavy inline-style markup to classes.
**Why.** The app uses inline styles (inline beats stylesheet specificity), so responsive overrides need `!important` media rules. Full refactor to classes was higher-risk churn for a prototype.
**What changed on ≤640px.** Header collapses (hide "for AI" tag, search becomes icon-only, auth becomes avatar-only), single-column shelf, reduced section padding, ≥40px touch targets, modal becomes a bottom-anchored sheet.

## 13. CHALLENGE — "Go deeper" still jerky after the first fix
**Symptom.** After switching the accordion to `grid-template-rows: 0fr → 1fr`, the reveal still felt jerky.
**Root cause (two compounding issues).** (a) Animating `grid-template-rows` animates *layout* every frame, and it runs under the modal's `backdrop-filter: blur` — the blurred area behind the growing card is re-sampled each frame, which is expensive. (b) The `fr`-unit collapse has a min-height stepping quirk unless the item is forced to `min-height:0`, causing a small snap at the ends.
**Fix.** Replaced the CSS grid transition with a **Web Animations API height animation**: measure the collapsed and full heights, animate `height` from the current *visual* height to the target with the iOS drawer curve `cubic-bezier(.32,.72,0,1)` (260ms open / 190ms close — asymmetric per Emil), fade the inner via a CSS opacity transition, and reserve scrollbar space (`scrollbar-gutter: stable`) so a scrollbar appearing mid-expand doesn't cause a horizontal reflow jump. Measuring `start` *before* cancelling any in-flight animation makes rapid toggles continue from the current position instead of snapping — true interruptibility.
**Note.** Height is still a layout property (Emil prefers transform/opacity), but for a single contained accordion the WAAPI height animation is the reliable, well-worn "smooth accordion" and sidesteps both the grid quirk and most of the backdrop-resample cost.

## 14. CHALLENGE — SETUP.md wasn't sequential
**Symptom (caught by user).** Step 4 (deploy) said "Push to GitHub first (step 5)" — forward references made the guide non-linear.
**Root cause.** I'd grouped steps by topic (Supabase, Google, hosting, GitHub, store) instead of by dependency order. But there's a genuine chicken-and-egg: Google OAuth's "authorized origins" needs the deployed URL, and the deploy needs the GitHub repo.
**Fix.** Reordered into a strict dependency chain: Supabase → keys in app → GitHub → deploy (yields the live URL) → Google OAuth (consumes that URL) → connect Google to Supabase → test. The Web Store step is genuinely independent, so it's labeled as such and placed last. No step now points forward.
**Lesson.** For setup docs, order by dependency, not by topic — and read them as a first-timer would, top to bottom, to catch forward references.

## 15. CHALLENGE — setup guide written for the wrong audience
**Symptom (repeated user frustration).** The setup steps assumed developer knowledge: "push to GitHub from the project root," raw `git` commands with no context, and unexplained jargon like "Authorized redirect URIs" and `<project-ref>`.
**Root cause.** I wrote the guide in the register I'd use for an engineer, not for the actual reader (a non-developer in Cowork). Cardinal docs mistake: writing for yourself, not the audience.
**Fix.** Full plain-language rewrite of `SETUP.md`: every click spelled out, GUI-first (GitHub Desktop instead of terminal; Netlify Drop as a no-Git option; Finder "Compress" instead of a `zip` command), each technical term defined in place with a concrete worked example (e.g. showing `https://abcdefgh.supabase.co/auth/v1/callback` rather than a `<placeholder>`), and terminal steps kept only as clearly-optional alternatives.
**Lesson.** Match the register to the reader. For a non-technical audience: lead with GUI tools, define every term at first use, use concrete examples over placeholders, and never assume they know what/where the terminal is.

## 16. CHALLENGE — dashboard menu paths kept going stale
**Symptom (repeated).** Instructions like "Authentication → Providers → click Google" and "Project Settings → API" didn't match what the user actually saw — Supabase and Google both reorganized their dashboards.
**Root cause.** I described third-party UI menus from memory. Vendor consoles rename/move menus every few months, so any hardcoded click-path rots — and I hadn't verified against current docs.
**Fix.** (a) Fetched Supabase's official Google-auth doc to get the *current* flow. (b) Switched the guide to **direct dashboard links** that jump to the exact page regardless of menu labels — e.g. the Supabase Google provider page `…/auth/providers?provider=Google` and Google's `console.cloud.google.com/auth/clients` — with the click-path kept only as a fallback. (c) Noted explicitly in the doc *why* (menus change), so the reader isn't surprised when labels differ.
**Lesson.** For third-party setup steps, prefer stable deep links over menu navigation, and verify the flow against the vendor's live docs rather than trusting memory — vendor UIs are a moving target.

## 17. Store submission kit + brand mark
**Decision.** Turned the stub `STORE-LISTING.md` into a complete submission kit and generated real assets.
**What I did.** (a) Generated a logo/icon: a lowercase **"d" with a dot above it** (a tittle, echoing the app's dot motif) — the user explicitly rejected the earlier "ring/notch" mark as generic ("AI slop"), so the final mark is purely typographic and monochrome. Rendered at 16/32/48/128 px + a 128 store icon + 440×280 and 1400×560 promo tiles (Pillow, verified sizes against Chrome's current image spec). (b) Wired `icons` + `action.default_icon` into `manifest.json`. (c) Wrote a real **privacy policy** (`extension/PRIVACY.md`) — required because the store treats reading page content as handling user data, even though Decoder transmits nothing. (d) Rewrote `STORE-LISTING.md` around the actual dashboard tabs: single-purpose statement, per-permission justifications, "no remote code," data-collection certifications, and the exact 1280×800 screenshot spec (screenshots must be real captures — I can't produce them without a browser).
**Verified vs. docs.** Asset dimensions and privacy requirements checked against `developer.chrome.com` (July 2026) rather than memory.
**Domain question (answered for the record).** A website domain does **not** materially affect extension review. What drives review: the requested permissions (Decoder's `<all_urls>` host access gets extra scrutiny), single-purpose clarity, data handling, and a valid privacy-policy URL (which can be hosted anywhere). Noted the `activeTab` fallback if broad host access is challenged.

## 18. CHALLENGE — Web Store "broad host permissions" delay warning
**Symptom.** At submission, the dashboard warned the extension "may require an in-depth review" because it requested `<all_urls>` (via `content_scripts: matches: ["<all_urls>"]`) — broad host access at install time.
**Context (for the record).** This warning is not a rejection; password managers like LastPass legitimately use `<all_urls>` (they must autofill on any site) and simply accept the in-depth review. So broad access is allowed — just scrutinized.
**Options weighed.** (a) Submit as-is and accept the slower review; (b) switch to `activeTab` (on-demand, one click per page — kills the ambient feel); (c) **one-time opt-in** via `optional_host_permissions`.
**Decision.** Went with (c). Per Chrome's own guidance, moving `<all_urls>` into `optional_host_permissions` and requesting it at runtime with `chrome.permissions.request()` removes the broad permission from the *required* manifest, so the submission warning doesn't fire — while still allowing automatic highlighting once the user opts in.
**Implementation.** Manifest: `permissions: [storage, scripting]`, `optional_host_permissions: ["<all_urls>"]`, plus a background service worker. `background.js` registers/unregisters the content script based on `chrome.permissions.contains`, driven by `permissions.onAdded/onRemoved`. The popup gained an "Enable on all sites" control that calls `permissions.request()` (from a user gesture) and injects into the current tab immediately for instant feedback. `content.js` got a `window.__decoderLoaded` re-injection guard and now always scans when injected (the permission grant replaced the old on/off toggle).
**Verified vs. docs.** Confirmed against developer.chrome.com that optional host permissions avoid the submission-time broad-permission warning.
**Untested caveat.** No browser in the sandbox, so the permission/register/inject flow is verified by construction + syntax only; real test is loading it unpacked and clicking "Enable on all sites."

## 19. Extension → account sync (one shared cheatsheet)
**Trigger (user caught it).** The privacy copy said the extension keeps saves "on-device," but the product intent is that clips sync to the account and show up in the web app. As built, the extension *was* local-only — a real gap, not a leak.
**Decision.** Wire the extension to the same Supabase project/table as the web app so saves sync both ways.
**Implementation choices.**
- **Auth:** `chrome.identity.launchWebAuthFlow` → Supabase `/auth/v1/authorize?provider=google&redirect_to=<chromiumapp.org redirect>`; parse the returned `#access_token`/`refresh_token` from the fragment; store in `chrome.storage.local`; refresh via the GoTrue token endpoint. No Google-Chrome-extension OAuth client needed — Supabase brokers Google.
- **Data:** plain `fetch` against Supabase's PostgREST (`/rest/v1/cheatsheet_items`) with `apikey` + `Bearer` — no bundled `supabase-js` (keeps the package small and MV3-CSP-clean). `user_id` comes from decoding the JWT `sub`; RLS enforces per-user access exactly like the web app.
- **Architecture:** all reads/writes route through the background service worker (`background.js` message router); `content.js` and `popup.js` never touch tokens directly. `supa.js` is shared (importScripts in the worker, `<script>` in the popup). `config.js` holds the same Supabase URL + publishable key as the web app.
- **Parity:** concept IDs are identical across `extension/concepts.js` and the web app, so a term saved in one surface resolves in the other.
**Permissions impact.** Added `identity` (sign-in) and a **specific** host permission `https://*.supabase.co/*` (a single backend domain — does not trigger the broad-host review). `<all_urls>` stays optional.
**Privacy/store impact (accounted for).** The extension now *does* collect data when signed in (email + saved term IDs) → updated `web/privacy.html`, `extension/PRIVACY.md`, and the store data-collection answers (PII: email; User activity: saved IDs; purpose: app functionality). Core highlighting still needs no login; reviewer note updated to say sign-in is optional.
**Setup added.** New SETUP §8b: fill `config.js`, and add the extension's `https://<id>.chromiumapp.org/` redirect to Supabase Redirect URLs (plus the published ID later).
**Untested caveat (important).** No browser/Supabase in the sandbox, so this is verified by syntax + message-contract checks only. OAuth/redirect/RLS almost always need one real-browser debugging pass — most likely snag is the Supabase redirect-URL allowlist or the implicit-vs-PKCE token return.

## 20. Unified the glossary (single source)
**Decision.** Removed the duplicated concept data. `web/concepts.js` is now the single source (`DECODER_CONCEPTS` + `DECODER_LENSES` + `DECODER_STATUS`); the web app loads it via a `<script>` tag (data no longer inline in `index.html`), and `extension/concepts.js` is an exact copy.
**Why this shape (not a build step).** The web app and extension are separate deployment artifacts, so each needs its own physical file at runtime — a build tool isn't available/wanted. So: one authored file, copied to both, edit-one-place. The canonical file exposes all three globals; each surface uses what it needs (web ignores `DECODER_STATUS`, extension ignores `DECODER_LENSES`) so the two files stay byte-identical.
**How.** Extracted the existing `DATA`/`LENSES` literals from `index.html` and the `DECODER_STATUS` from the old extension file programmatically (no retyping), assembled `concepts.js`, wrote it to both locations, and rewired `index.html` (`const DATA = window.DECODER_CONCEPTS`). Sync step documented: `cp web/concepts.js extension/concepts.js`. Verified identical + all files parse.
**Size:** small, as estimated.

## 21. Scaling the shelf: 15 → 1,000+ terms (DB-backed, scheduled batch generation)
**Context.** The glossary needs to grow from a handful to 1,000+ terms so the app can be tested at real scale. The data currently lives in a static file; a per-user saves table exists but the glossary itself was never a database. Goal restated by the user: populate the DB with ≥1,000 terms; intermediate counts (15 vs 100) are irrelevant — come back when it's at scale. Auto-publish accepted; batching/schedulers/agents all authorized.

**Decision.** Move the glossary into a `public.concepts` table (schema + RLS in `supabase/concepts.sql`), and generate content via a **resumable, scheduled batch pipeline**:
- `content/backlog.json` — the full candidate term list (names + domain + status guess), the work queue.
- `content/registry.json` — every id + alias already produced (dedup + cross-link source of truth). Seeded from the existing 31.
- `content/STYLE.md` — the voice contract + exemplars, so any fresh agent run stays on-voice.
- `scripts/validate_and_emit.js` — validates a batch (unique ids, resolvable `related` links, no alias collisions, required fields, valid status), emits `supabase/batches/seed_NNN.sql`, updates the registry, and regenerates a single `supabase/seed_all.sql`.
- A **scheduled task** runs every few hours; each run drafts the next N terms, validates, emits SQL, updates registry + `PROGRESS.md`, and stops when the total reaches 1,000 — then notifies the user.

**Hard limitation (named honestly).** This sandbox cannot reach Supabase (network-blocked). So the pipeline produces *runnable SQL*, not live inserts. The actual DB population is one manual step: run `supabase/seed_all.sql` in the Supabase SQL Editor. I cannot verify the live DB myself; the SQL is verified structurally (parses, integrity-checks pass) and the insert/visual check is the user's. Browser-automation into the Supabase dashboard was considered and rejected for autonomous runs (fragile, needs a live logged-in session).

**Alternatives rejected.**
- *In-session mega-batch (write all 1,000 now).* Infeasible: exceeds a single session's output/context budget, quality degrades badly at the tail, and it's one enormous token spike — the exact cost the user wants to pace.
- *Parallel subagents, one per domain.* Faster wall-clock but token-expensive (many cold starts re-deriving context) and integrity-hostile: independent runs collide on ids/aliases and can't see each other's cross-links, forcing a messy reconcile pass. Kept as an *option inside* a scheduled run if a batch is large, but not the default.
- *Keep it a static file.* Doesn't meet the "database with admin CRUD" requirement and won't scale to thousands shipped to every browser/extension.

**Consequences / trade-offs.**
- Reaching 1,000 is paced over ~2.5–3.5 days (≈60 terms/run, ~16 runs, every 4h), not instant. Accepted — the user prioritized scale over speed and wants token pacing.
- Content is model-generated with no human review gate (auto-publish). Mitigation: every generated term is tagged (`tags` includes a batch marker) so the whole test population can be rolled back with one `delete from concepts where tags @> '{"seed"}'`. Voice risk is mitigated by STYLE.md + registry-enforced integrity, not by review.
- Resumability: registry + PROGRESS make runs idempotent — a failed/partial run simply resumes; no double-inserts (SQL is upsert-on-id).
- Extension is under review and stays frozen: all of this is DB + SQL + web-only. Nothing writes to `extension/`. The homepage shelf reads the static bundle, so these terms are reachable via search immediately and via the shelf only after an explicit export — a deliberate split, not a bug.

**Engineering discipline applied.** ADR-style record (this entry); every script gets `node --check` + an integrity validator before use; SQL is idempotent (upsert) so re-runs are safe; rollback path defined before shipping; the one unverifiable step (live DB) is called out rather than papered over.

## 22. CHALLENGE — the "cheatsheet → saved terms" rename broke web saves
**Symptom (caught during a doc review, not by a bug report).** `web/index.html` called `sb.from("saved terms_items")` — a table that doesn't exist. The real table is `cheatsheet_items` (schema + extension both use it). Every web-app save/list/remove had been failing silently since the copy rename.
**Root cause.** The decision-6 voice rename ("cheatsheet" → "saved terms") was applied by find-and-replace without word-boundary care, and it caught a *table name* inside a code string. The same sweep also garbled prose in `web/privacy.html` ("your saved terms follows you", "save a saved terms that syncs") — fixed in the same pass.
**Verified live.** From the browser: `GET /rest/v1/cheatsheet_items` → 200; `GET /rest/v1/saved terms_items` → 404. The fix is provably correct and the old name provably broken.
**Lesson.** After any rename sweep, grep the result for the new phrase in *code* positions (identifiers, table names, URLs) — user-facing copy and machine names must never be renamed by the same pass.

## 23. Extension is live — homepage CTA + popup web link
**Context.** The extension shipped on the Chrome Web Store (v1.0.0). Two cross-links were added so each surface advertises the other.
**Homepage CTA (design per Emil).** A ghost-pill `<a>` directly below the hero search button: monochrome Chrome glyph + "Get the Chrome extension" + muted tagline + accent arrow. Deliberately *secondary*: the search button keeps the visual weight (filled shadow, larger), the pill reads as a quieter sibling; it joins the hero stagger at .25s so it feels part of one composition rather than an ad. On ≤640px the tagline hides, leaving the pill compact. Rejected: header placement (competes with search + auth), a banner (AI-slop pattern), a card in the shelf (mixes chrome with content).
**Popup → web app.** A single hairline-separated footer in the popup: "Your saved terms, on the web — aidecoder.app →" (11.5px, muted, hover-darkens). One quiet line, always visible, so users learn where their data lives without the popup selling anything. Version bumped to 1.0.1 — needs a store re-upload to ship.
**Also:** shelf heading dropped the term count ("The shelf · N terms" → "The shelf") — the number was pipeline trivia, not user value; favicon wired from the existing "d" mark (16/32/apple-touch PNGs + link tags).
**Revised same day (user feedback).** The ghost pill under-weighted the extension. Sumit's framing: like Pocket, *the extension is the real product* — the web app is where saved terms live, but the value is captured while reading elsewhere. So the hierarchy flipped: the store link is now the hero's PRIMARY action — a filled accent button ("Add Decoder to Chrome", Chrome glyph, accent-tinted shadow, first stagger slot) with "Free — underlines and explains AI terms on any page you read" microcopy beside it — and the search pill demoted to secondary below it (search is also always in the header, so nothing is lost). Full-width button + hidden microcopy on ≤640px. Lesson: visual hierarchy must encode the *business* hierarchy, not the on-page interaction hierarchy — search is what you do on the site, but the extension is why the product exists.

## 24. Performance pass at 335 DB terms
**Symptom.** The app was designed around 15 static terms; with 335 (target 1000+) loaded from the DB it felt laggy.
**Fixes (all verified in the browser preview at 335 terms).**
- *Spotlight:* was rebuilding the full results innerHTML (335 rows) on every keystroke, arrow key, AND mouse hover. Now: rows capped at 60 with a "N more — keep typing to narrow" footer, and selection changes patch a `.on` class between two rows instead of rebuilding (verified: DOM nodes persist across arrow-key navigation).
- *Card entrance stagger:* `i*45ms` delays meant card #285 stayed invisible for 12.8s. Now only the first 24 cards animate (30ms stagger); the rest appear instantly.
- *Offscreen rendering:* `content-visibility:auto; contain-intrinsic-size:auto 160px` on `.card` skips layout/paint for offscreen cards.
- *Rising-dot pulse:* the infinite `box-shadow` glow animation (paint work on every Rising card, forever) replaced with a `::after` ring animating transform/opacity only (compositor-friendly).
- *No replay:* `loadShelfFromDB()`'s re-render used to replay all hero/card entrance animations ~1s after load (visible flash). `renderLookup(still)` now suppresses entrance animations on every re-render after first paint.
- *`.srow` hover:* animated `padding-left` (layout) → background-color only.
**Lesson.** Entrance animations, per-item infinite animations, and full-list rebuilds are all fine at 15 items and disqualifying at 300+; scale changes which patterns are acceptable.

## Cross-cutting: verification under a constrained sandbox
No browser, no jsdom, npm registry blocked. So I lean on: `node --check` for syntax (classic + module scripts), data-integrity scripts (every internal link/alias resolves, every concept well-formed), a matcher unit test for the extension, and a static CSS-var scope audit. Repeatedly flagged the one real gap this leaves — **visual/pixel QA must happen in the user's browser** — rather than claiming coverage I don't have.
