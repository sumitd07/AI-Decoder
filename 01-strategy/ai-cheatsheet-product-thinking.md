# The AI Cheatsheet — A Product Thinking Doc

*Working title. A lightweight tool for staying fluent in AI without taking a course.*

---

## 1. Start by renaming the problem

You called it a "tool to learn everything AI." I think that framing is a trap, and it's the same trap every existing product falls into. The moment you say "learn," you inherit the whole apparatus of learning: curricula, prerequisites, progress bars, completion. That machinery is exactly what makes those tools heavy.

The real job is smaller and sharper. It's the moment you're reading a thread, sitting in a meeting, or skimming a launch post, and a term goes by — *"we should add an eval harness before we ship"* — and you need to not be lost. You don't want to *learn* evals. You want to be **oriented** in about twenty seconds and get back to what you were doing.

So the reframe I'd anchor everything to:

> **This isn't a learning tool. It's an orientation tool. A decoder ring for the language of AI.**

Cheatsheet is the right instinct, but even "cheatsheet" undersells it, because a cheatsheet is static and this field isn't. What you're really building is a **living translator for a conversation that never stops moving.**

Everything below serves that one reframe.

## 2. The three forces you're actually fighting

Every design decision should be checked against these, because they're the reasons the incumbents feel wrong.

**Friction.** A 10-minute video to re-learn one idea is absurd when the idea itself takes one sentence. The unit of value here is tiny, so the cost of getting it must be tinier. If understanding "RAG" takes longer than it took the term to show up in your feed, you've lost.

**Staleness.** Your vibe-coding example is the whole thesis. The field has a *relevance half-life*. Terms rise, peak, and quietly die, and a tool that treats a dead term the same as a live one is lying to you by omission. Most reference products are built like dictionaries — permanent, flat, all entries equal. You need something with a pulse.

**Intimidation.** People don't ask "what's an embedding?" out loud because they're afraid it makes them look behind. A tool that removes that fear — private, jargon-free, no judgment, no "you should already know this" energy — has a real emotional job to do, not just an informational one.

Friction, staleness, intimidation. If a feature doesn't reduce one of these, it's probably decoration.

## 3. Design principles (the spine)

- **One breath, then more.** Every concept opens with a single sentence you can read in one breath. Depth exists, but it's earned by a click, never forced. Progressive disclosure is the whole game.
- **Analogy before definition.** Lead with "it's like ___," not with the technically-correct sentence. People file new ideas next to old ones; give them the hook first, the precision second.
- **Show the "so what," now.** Every concept answers *why does this matter to me today* — including "it doesn't anymore." Relevance is content, not metadata.
- **Currency is a feature, not a chore.** The tool should visibly know what's hot, what's core, and what's fading. Freshness should be *felt*, like opening a newspaper versus a textbook.
- **Zero-commitment by default.** No login wall to read. No path to follow. No streak to protect. You can land, get your answer, and leave — and that's a *success*, not a funnel leak.
- **Confidence, quietly.** The emotional deliverable is "oh, I've got it." Tone should be plain, a little witty, and honest enough to say "this was overhyped."

## 4. The atom: what a concept looks like

Simplicity lives or dies at the level of the individual entry. If every concept has the *same predictable shape*, the user's eyes learn it once and then skim at full speed forever. I'd lock a strict card anatomy and never break it:

1. **The term** — plus its aliases and how it's actually said aloud (HITL → "human in the loop"). Half the intimidation is not knowing how to pronounce the acronym.
2. **The one-liner** — the one-breath explanation. This is the hero. Ruthlessly edited.
3. **The analogy** — "It's like a librarian who fetches the right book before answering." One vivid image.
4. **Status** — a single honest signal: *Core / Rising / Fading / Historical*. This is your antidote to staleness, and it's the thing no competitor has.
5. **A real example** — one concrete, current instance of it in the wild. Not abstract. "When Claude Code runs your tests before finishing a task, that's an agent doing an eval-like check."
6. **Connections** — two or three neighboring concepts, phrased as a thought ("often confused with…", "the grown-up version of…"), not a bare tag list.
7. **Go deeper** — hidden by default. One layer down for the person who *does* want the mechanics. Optional, never in the way.

That's it. If a card needs more than this, the concept probably needs splitting, not expanding.

## 5. Interface concepts — pick a soul, not just a layout

You said the search-bar-plus-list feels uncreative, and you're right — not because it's *wrong*, but because it has no point of view. Here are four directions with actual souls. They're not mutually exclusive, but one should lead.

### A. The Spotlight (my lean)
Model it on the command palette / Spotlight search, not a website. You summon it with a keystroke from anywhere, type three letters, and the answer is already there before you finish. No homepage, no navigation, almost no UI — just a bar and an instant, beautifully-typeset card. This is the purest expression of "cheatsheet the night before the exam": maximum speed, minimum ceremony. The delight is in *how fast the fog clears.* Ships small, feels magical, and it's honest about what the product is — a lookup, perfected.

### B. Paste-anything (the killer feature disguised as a concept)
You paste a tweet, a paragraph, a job description — and the tool highlights every piece of jargon inline and lets you tap any of it for the card. This attacks the real job head-on: you meet these terms *inside text you're already reading*, so meet the user there. This is the single most differentiated idea in this doc, and it can live *inside* the Spotlight rather than replace it.

### C. The living map (delight-forward)
Concepts as a constellation. Proximity means relatedness, brightness means current relevance, and dim/greyed stars are the fading ideas (vibe coding, quietly dimming in the corner). You don't search so much as *wander*, and the map visibly changes shape over months as the field moves. Gorgeous and memorable, but heavier to build and easy to over-engineer. I'd treat it as a "browse / explore" mode, not the front door — wandering is a mood, orientation is a need, and needs should be one keystroke away.

### D. The pulse / feed
Part dictionary, part newspaper. A scrollable stream that mixes evergreen cards with "what changed this week" — a term that just spiked, one that just died, a new one worth knowing. This is what turns a one-time lookup into a habit and directly monetizes your staleness insight. Strong as a *second* surface (the reason to come back), weaker as the *first* (too much to greet a person who just wants one word).

**Recommendation:** Lead with **A (Spotlight)** as the core, build **B (Paste-anything)** — and its sharper sibling, the **in-page extension** in §5b — as the signature trick, and add **D (Pulse)** as the reason to return. Keep **C (the map)** as an aspirational "explore" view for later — it's the marketing screenshot, not the daily driver.

## 5b. Select-to-explain — and the cheatsheet that becomes *yours*

Your extension idea is the best one in this thread, because it collapses the distance to zero. Spotlight still asks the user to *leave* the sentence, open a bar, and type. Selecting a word right where you're reading — and getting the explanation *in place, in the same window* — is the lowest-friction version of orientation that can physically exist. You meet the term at the exact instant of confusion, in the exact spot it appeared. That's the dream, and it's worth building toward even though the install and engineering cost is higher than a web app.

But it introduces two design problems that will make or break it, and a new pillar that changes the whole product.

**Problem one: don't become the annoying popup.** Every "select text → popup appears" extension eventually feels like a hijack — you go to copy a sentence and something lunges at your cursor. The fix is *summon on intent, never on every selection.* Options, roughly in order of grace: a small, quiet affordance that fades in near the selection (a single dot or pill you can ignore), or a keyboard shortcut / right-click after selecting. The default posture should be *invisible until asked.* The tool earns trust by staying out of the way 95% of the time.

**Problem two: know what's a "concept" vs. just a word.** If it explains everything, it explains nothing. The magic is that it lights up for *AI jargon specifically* — "eval," "RAG," "context window" — and stays silent on "the," "however," "meeting." That selectivity is what makes it feel smart rather than eager. (This is also where §5's Paste-anything and the extension are literally the same engine — jargon detection — wearing two costumes.)

**The popover anatomy** should be the §4 card, compressed to its first three lines: the one-liner, the analogy, one example. Everything else is a click away in the full card. In-place means *tiny* — a tooltip, not a takeover.

### The new pillar: "Save to your cheatsheet"

This is the part that quietly upgrades the whole product from a *lookup* to something you *own.* The moment you add a save button, the tool stops being a public dictionary and starts assembling **a personal cheatsheet of exactly the concepts you, personally, stumbled on** — which is a far more valuable artifact than any curated list, because it's a map of your own edges. It's literally the "cheatsheet the night before the exam," except it wrote itself from your real reading.

A few things this unlocks that are worth designing for deliberately:

- **The revise loop.** Your saved cards are the reason to come back — a private, one-screen sheet you can skim before a meeting or an interview. This, not the Pulse, may be the real retention engine, because it's *yours.*
- **Living saves.** A card you saved three months ago can quietly update its status. "That term you saved in April is now *Fading*" is a delightful, honest nudge that only works *because* you built currency (§6) as a first-class property. Your cheatsheet ages with the field, so you never revise a dead idea.
- **Save = the strongest signal you'll ever get.** Every save tells you which concepts are actually confusing people in the wild, in real reading, right now. That's a cleaner "what's rising" signal than any trend scrape — feed it straight into the Pulse and the draft-new-cards pipeline.
- **Ownership without an account wall.** Reading should still need no login (§3), but *saving* is the natural, earned moment to offer sync — "keep your cheatsheet across devices." It's the one place a sign-in feels like a gift rather than a toll.

**One caution:** resist turning the saved cheatsheet into a study app. No decks, no spaced-repetition drills, no quizzes bolted on. It's a *reference you assembled*, not homework — the second you gamify it, you've rebuilt the heavy thing (§8). Let it stay a calm, personal glossary that happens to be perfectly tailored to you.

## 6. Currency — the hard part, treated as the main part

Anyone can write 200 definitions. The moat is keeping them alive, and most reference products rot because updating is invisible, unrewarded work. Make it structural:

**Every card decays.** Relevance is a property with a timestamp. If a concept hasn't been touched or referenced in a while, it visibly ages — a subtle "last checked" and a drifting status. Decay should be automatic and honest.

**Retire gracefully, don't delete.** When something dies, it becomes *Historical*, not gone — "Vibe coding: what people meant in 2024, and why the term folded into 'agentic coding.'" That obituary is *itself* one of the most useful and shareable cards you can have, because it maps the reader's outdated mental model onto the current one. Nobody else does this.

**Draft with AI, bless with a human.** New terms can be auto-drafted the moment they start trending, then lightly edited for the voice and the "so what." This is how a small team keeps pace with a daily field without a newsroom.

**Let the crowd point, not write.** A one-tap "I heard this and didn't get it" signal tells you what's rising before you'd otherwise notice. You don't need user-generated *content* (that erodes quality); you need user-generated *attention*.

## 7. Tone and micro-delight

The voice is the product as much as the content. Plain, confident, occasionally funny, and willing to say the quiet part — "this was mostly hype" — because that candor is *exactly* the trust that keeps people coming back. The vibe-coding obituary should read like a smart friend leveling with you, not a wiki.

Small moments that would make it feel loved: the answer landing before you finish typing; a satisfying, quiet "got it" when you mark a card understood; the map subtly redrawing itself as the field shifts; an "explain it like I'm a…" toggle (curious human / PM / engineer) so the same term meets you at your level. None of these are features you'd list on a landing page — they're the reasons it *feels* good, and feel is what gets shared.

## 8. Guardrails — what to NOT build (this protects the whole thing)

Simplicity isn't a feeling, it's a series of refusals. Write these down and defend them:

No videos. No forced learning paths or "start here." No account required to read. No quizzes, badges, or streaks (they turn a calm tool into a chore). No essay-length entries. No comment sections. The instant you add these, you've rebuilt the heavy course product you set out to escape — and the second version of that mistake always arrives disguised as "just one helpful addition."

## 9. How you'd know it's working

The metric is **time-to-understanding**, and it should feel embarrassingly short — measured in seconds, not minutes. Secondary signals: how often someone comes back *without being nudged* (the Pulse's job), and the "aha" rate — the share of lookups where the person taps "got it" and leaves rather than digging for more, because leaving satisfied is the point. Notably, *time-on-site is a vanity trap here* — low dwell time is a feature. Don't let a growth dashboard quietly turn your calm tool into a sticky one.

## 10. The smallest lovable version

Don't build the constellation, and don't start with the extension either. Build this: **a Spotlight-style search over ~50 hand-crafted cards using the strict anatomy, each with a Core/Rising/Fading/Historical status, plus three or four honest "obituary" cards for dead terms.** That alone tests the two riskiest bets — that people want orientation over education, and that *status/currency* is the thing no one else offers. If those 50 cards make someone say "oh, this is the one I'll actually use," everything else in this doc is just scaling. If they don't, no amount of beautiful map or clever extension saves it.

The **extension and the personal cheatsheet (§5b) are phase two** — the moment to build them is right after those 50 cards prove people want the content, because the extension is a *distribution and habit* bet layered on top of a *content* bet. Do them in that order and each de-risks the next; do them at once and you won't know which one failed.

## 11. Open questions worth sitting with

- **Who exactly is "people like me"?** A PM staying current, a curious non-technical person, an engineer adjacent to ML — they need different default depths. The "explain it like…" toggle papers over this, but picking a *primary* persona will sharpen the voice enormously.
- **Where does it live?** A browser extension makes "Paste-anything / explain-in-place" almost invisible-good, but it's a heavier build and a harder install than a web app. Web-first, extension-later is the safe order.
- **What's the name?** It shouldn't say "learn" or "academy." Something that signals *quick, current, plain-spoken*. Candidates to react to: *Gist, Plainly, Catch Up, The Pulse, Decoder, TL;DR AI.*

---

### The one line to keep on a sticky note

**Not a course you finish, but a friend you check with — fast, current, and honest about what's already dead.**
