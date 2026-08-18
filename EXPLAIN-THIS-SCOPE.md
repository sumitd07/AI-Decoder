# Explain This — scope

**Status:** proposed, not built
**Date:** 2026-08-18

---

## What it is

A reader highlights a sentence on any page and gets that sentence explained in plain English — grounded in the Decoder shelf, and aware of the page it came from.

Not a definition. An explanation of *that sentence*.

## Why

Decoder today answers "what does this word mean?" It cannot answer "what is this sentence saying?"

Those are different problems. Someone stuck on:

> "We reduced hallucination by tightening the retriever's top-k and reranking before the context is assembled."

can hover four separate terms, read four correct cards, and still not know what the sentence means. The cards are generic. The confusion is specific.

This is also the original brief. From DECISIONS #1: *a term flew by, get me un-lost in ~20 seconds, then back to what I was doing.* Right now we get them un-lost on the word and leave them lost on the paragraph.

## The moment

Reading a post about AI infrastructure. Hits a sentence that doesn't parse. Highlights it. Within about a second:

- a plain restatement of what the sentence is actually claiming
- the jargon in it resolved *as this author is using it*
- each term a chip linking to its full card
- if something in the sentence isn't in the shelf, it says so rather than guessing

Then back to reading.

## What good looks like

**It answers the sentence.** If the output would work as a generic definition, it failed.

**It never invents.** Decoder's whole premise is that it stops you being bluffed. A dictionary that hallucinates is worse than one that says "I don't cover that yet." Every claim traces to a card or to the page itself.

**It sounds like Decoder.** Simple, direct, one idea at a time, an analogy when it earns its place. Not assistant-voice. Not bullet soup.

**It's fast enough to not break reading flow.** If it's slow enough to notice, people stop using it and go back to skimming.

**It degrades to something useful.** When it can't do better, showing today's card is a perfectly good answer. Never a spinner that ends in nothing.

## In scope (v1)

- Highlight a sentence → get an explanation
- The shelf is the source of truth for what terms mean
- The surrounding page is the source for what *this author* means by them
- Every term surfaced links to its real card
- Explicit "not covered yet" when the sentence turns on something outside the shelf

## Out of scope (v1)

- Follow-up questions / chat
- Summarizing whole articles
- Explaining non-AI jargon
- Saving or syncing explanations
- Anything that writes back to the glossary

## What makes this hard

Flagging these because they shape the build, not to prescribe solutions.

**The page is messy.** The shelf is 900 clean, hand-written cards. The page is not — nav chrome, ads, code blocks, footnotes, tables, paywall stubs, two-column PDFs. Pulling the author's own usage out of that is the genuinely difficult retrieval problem here. It must degrade gracefully when the page is unreadable: fall back to shelf-only, don't fail.

**The shelf has holes.** Sentences will contain terms we don't have. That case is common, not an edge case, and the behavior needs deciding up front. Default should be admitting it. Every occurrence is also free signal about which term to write next — worth logging.

**Quality is subjective, so it needs an eval set before any code.** Suggested: ~50 real sentences pulled from real pages, spanning easy to genuinely hard, each with a human-written gold explanation. Score every generation on four axes — correct, grounded, in-voice, actually useful to someone stuck. Without this there's no way to tell a prompt change from a regression.

**Generation costs money and invites abuse.** Unlike everything Decoder does today, each use has a marginal cost. Needs a spend ceiling and a rate limit from day one, not after the first bill.

**Voice drift is the quiet failure.** The model will trend toward competent, generic explainer prose. That erodes the only thing that makes Decoder worth using over asking ChatGPT directly. The eval set has to police voice, not just accuracy.

## Success criteria

**Hard gate:** zero ungrounded claims across the eval set. A single confident invention is a ship-blocker.

**Quality bar:** on the eval set, a clear majority rated "this would have unstuck me" by someone who wasn't the author.

**Speed:** fast enough that a reader doesn't context-switch while waiting.

**Restraint:** when the existing card already answers it, don't generate at all. Measured as the share of highlights that correctly resolve without a model call.

## Open questions for the build session

1. Extension first, web app first, or both? The extension is where reading happens; the web app is far easier to iterate on.
2. Signed-in only, or open to everyone? Auth already exists and gives per-user limits, but it adds friction to the exact moment that sells the product.
3. When nothing in the sentence matches the shelf — admit it, explain ungrounded with a label, or invest in fuzzier retrieval up front?

## Related

- `DECISIONS.md` #1 (the original brief), #47 (term matching)
- `PROJECT-STATE.md` — glossary data flow, the two sources
- `GROWTH-PLAN.md` — how this interacts with the SEO term pages
