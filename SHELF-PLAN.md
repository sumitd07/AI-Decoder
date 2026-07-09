# Shelf scale-up — plan of action

Goal: grow the glossary ("the shelf") from ~15 terms toward thousands, and move it from a hand-edited static file into a database the admin can CRUD.

## The core problem

Today the shelf is **not** a database. It lives in `web/concepts.js` as hand-written JS objects, copied verbatim to `extension/concepts.js`. The only real table is `cheatsheet_items` — per-user *saved* terms, keyed by `concept_id`. So "put the shelf in a DB with admin CRUD" = create a new `concepts` table, migrate the file into it, and make the DB the source of truth. Everything else follows from that.

Each term is a rich object, not a row of text. The schema has to carry: `term`, `aliases`, `said`, `aliasList[]`, `status`, `oneLiner`, `analogy`, `example`, `related[]` (cross-links to other term ids), and `deeper`. The two things that make scaling hard: keeping a consistent **voice** across thousands of entries, and keeping the **related-link graph** valid as terms come and go.

## Decisions locked

- **Content:** AI-drafts in themed batches, auto-published live (spot-check, not gate).
- **Delivery:** hybrid — a static bundle for the common "core," live DB search for the long tail.
- **Admin:** Supabase Studio now to unblock content; build a custom in-app admin page later once volume justifies it.

---

## Phase 1 — The `concepts` table

Create `public.concepts` mirroring the JS object, plus metadata needed for scale:

- `id` (text, PK) — the stable slug (`rag`, `mcp`, …). Never reused, never renamed.
- `term`, `said`, `aliases` (text) — display fields.
- `alias_list` (text[]) — match strings for the highlighter/search.
- `status` (text) — Core / Rising / Fading / Historical.
- `one_liner`, `analogy`, `example`, `deeper` (text).
- `related` (jsonb) — array of `{text, id}` cross-links.
- **New for scale:** `domain` (text, the taxonomy bucket), `tags` (text[]), `priority` (int — drives the core/long-tail split), `is_published` (bool), `review_state` (text: `auto` / `flagged` / `reviewed`), `search_tsv` (generated tsvector for full-text), `created_at`, `updated_at`.

`review_state` is cheap insurance: even with auto-publish, it lets you queue suspect entries for a later pass without blocking anything now.

RLS: **public read** where `is_published = true`; writes restricted. Studio uses the service role and bypasses RLS, so **no admin-role plumbing is needed yet** — that only arrives with the custom admin page in Phase 5.

`cheatsheet_items` stays as-is. Do **not** add a cascading FK — a user's saved term must survive a concept being unpublished or merged. Handle stale saves with the integrity check in Phase 6, not a hard delete.

## Phase 2 — Seed & migrate

One-time: parse the current `web/concepts.js` and emit `seed.sql` (INSERT rows). You run it in Supabase; I can't reach the DB from here. Before emitting, validate that every `related.id` resolves to a real term id — flag any that don't. This proves the pipeline end-to-end on the 15 you already trust.

## Phase 3 — Hybrid delivery

DB becomes the source of truth; the app reads two ways:

- **Static core bundle** — a build step exports `concepts.js` (published rows above a `priority` threshold, e.g. all Core/Rising plus curated picks) → the web app and extension load it exactly like today. Fast, cached, works offline in the extension. This replaces the manual `cp web/concepts.js extension/concepts.js` step with a generated one.
- **Live long-tail search** — a Supabase RPC / PostgREST endpoint backed by the `search_tsv` index serves everything else on demand (type-to-search, click-to-look-up). The web app queries it live; the extension uses it when online and degrades gracefully to the core bundle offline.

Net effect: the highlighter and the popular terms stay instant, while thousands of rarer terms are reachable without shipping a giant file to every extension user.

## Phase 4 — Bulk content pipeline (the actual scale-up)

This is where thousands come from. Sequence:

1. **Taxonomy first.** Define ~10–12 domains so batches don't overlap or drift — e.g. Foundations, Training, Architectures, Agents & Tools, Retrieval & Memory, Safety & Alignment, Evaluation, Infra & Serving, Multimodal, Ecosystem & Products, History/Deprecated. Set a rough target count per domain so "thousands" has a concrete shape.
2. **Master term list.** Assemble a big, deduped candidate list per domain (terms + aliases only — no prose yet). This backbone is what we draw batches from and track coverage against.
3. **Batch drafting.** I generate 25–50 fully-formed terms per batch in the exact schema, matched to your voice, with `status`, `alias_list`, and `related` cross-links.
4. **Guardrails before insert** (even on auto-publish): schema/required-field validation, duplicate-`id` and duplicate-alias checks, and related-link resolution — a `related.id` links only if that id already exists or is in the same batch; otherwise it degrades to plain text. Everything lands `is_published = true`, `review_state = auto`.
5. **Re-export** the static core bundle after each batch so the app stays current.

## Phase 5 — Custom admin (later)

When Studio gets painful (nested `related[]` editing, no publish workflow), build a gated `/admin` route: searchable table, add/edit/delete, status + related-link editor, and paste-a-JSON-batch import that runs the Phase 4 guardrails. This is when real admin-role plumbing goes in — an `admins(user_id)` table with RLS policies checking membership, so write access isn't service-role-only.

## Phase 6 — Quality & maintenance

A repeatable integrity check (script now, cron later): broken `related` links, orphaned `concept_id`s in `cheatsheet_items`, duplicate aliases, missing fields, and `review_state = flagged` items awaiting a look. Plus a periodic status refresh, since terms migrate Rising → Core → Fading → Historical over time.

---

## Key risks & how the plan handles them

- **Voice/accuracy drift from auto-publish** → `review_state` column + per-batch spot-checks; nothing is permanent, everything is re-editable in place.
- **Breaking user saves** → slugs are immutable, no cascading deletes, merges handled via alias/redirect rather than deletion.
- **Offline extension can't hit long-tail search** → acceptable; the core bundle covers the terms most people highlight, and it degrades gracefully.
- **Related-link rot at volume** → resolution guardrail at insert + the Phase 6 integrity sweep.

## First concrete steps (in order)

1. You approve the taxonomy + rough target counts per domain.
2. I write the `concepts` table schema + `seed.sql` from the current 15; you run both in Supabase.
3. I write the export/build script (DB → `concepts.js`) and the long-tail search RPC.
4. We wire the web app to load static core + live search, then start batch generation.
