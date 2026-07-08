# Decoder — QA checklist

Open `Decoder.html` in any modern browser (Chrome, Safari, Firefox, Edge). No server or build step needed.

## Spotlight (lookup)
- [ ] Press `⌘K` (Mac) / `Ctrl+K` (Win) → Spotlight opens, input auto-focused
- [ ] Press `/` when not typing → Spotlight opens
- [ ] Type `embed` → filters to a single result (Embeddings)
- [ ] `↑` / `↓` move the highlight; hovering a row also highlights it
- [ ] `↵` opens the highlighted card; `esc` closes Spotlight
- [ ] Type gibberish (`zzz`) → honest "no match" empty message
- [ ] Footer shows a live "N shown" count

## Shelf + detail card
- [ ] Grid shows all 15 terms; hovering a card lifts it and reveals the `→`
- [ ] "Rising" status dots gently pulse (Agents, MCP, Prompt injection)
- [ ] Click a card → modal opens with status badge, one-liner, analogy, example, nearby links
- [ ] "Go deeper" expands/collapses the mechanics
- [ ] A "Nearby" link opens that related card
- [ ] `esc` or clicking the backdrop closes the modal

## Explain-like-I'm-a… lens
- [ ] Card shows a Curious / PM / Engineer toggle above the one-liner
- [ ] Switching lens swaps the one-liner wording
- [ ] Lens choice sticks when opening a different card
- [ ] Lens choice survives a page reload

## Select-to-explain (Read tab)
- [ ] Underlined terms show a dotted hint underline
- [ ] Click an underlined term → popover appears in place
- [ ] Highlight a term with the cursor → same popover (only fires on known AI terms)
- [ ] Popover "＋ Save to my cheatsheet" → confirmation + toast
- [ ] Popover "Full card →" opens the full modal
- [ ] Scrolling dismisses the popover (stays honestly anchored)

## My cheatsheet
- [ ] Empty state shows when nothing is saved
- [ ] Saving from a card increments the "My cheatsheet" tab badge
- [ ] Saved terms appear as cards; Fading/Historical terms show a status nudge
- [ ] `×` removes a term; badge decrements
- [ ] **Reload the page → saved terms persist** (localStorage)

## Theme + polish
- [ ] `☾` / `☀` toggles dark/light instantly, including status badge colors
- [ ] Card entrance, modal pop, popover rise, and toast animations all play
- [ ] Layout reflows cleanly on a narrow window

## Known limitations (by design, prototype scope)
- No focus-trap inside modals (Esc closes; tab order not constrained)
- Concept data is in-file; no live "currency" updates or backend
- Persistence is local to the browser (localStorage), not synced
