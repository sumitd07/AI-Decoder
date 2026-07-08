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

## Cross-cutting: verification under a constrained sandbox
No browser, no jsdom, npm registry blocked. So I lean on: `node --check` for syntax (classic + module scripts), data-integrity scripts (every internal link/alias resolves, every concept well-formed), a matcher unit test for the extension, and a static CSS-var scope audit. Repeatedly flagged the one real gap this leaves — **visual/pixel QA must happen in the user's browser** — rather than claiming coverage I don't have.
