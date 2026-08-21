# Decoder RAG — the beats

Everything here is beats, the short cues for what to say. Not a script. The mental model up top is the spine, and every answer hangs off it.

---

## The mental model (say this first, everything follows from it)

**A dictionary that bluffs is worse than useless. So I built it so it can only tell you what the glossary actually supports.**

Three moves, in order:

1. **Ground it.** Pull the few glossary cards the sentence hinges on.
2. **Say it plainly.** A small model restates the sentence in plain English, using only those cards.
3. **Prove it.** Evals check that it never invents, and a verify step is going in to enforce it.

That's the whole story. Ground, say it plainly, prove it. Learn it as three words.

---

## "What is Decoder?"

- plain-language dictionary for AI jargon
- look a term up, or click it while you read
- the RAG feature: highlight a whole sentence, get what it's *saying*
- grounded in our glossary, aware of the page
- never makes anything up

One line: *"It's a plain-language dictionary for AI jargon. The RAG piece lets you highlight a confusing sentence anywhere and get it explained in plain English from our glossary, and it never invents."*

---

## "Why RAG? Why not just ask a chatbot?"

- four correct word-definitions still leave you lost on the sentence
- the cards are generic, the confusion is specific
- a chatbot will confidently bluff, and that's the one thing we can't do
- so: explain the sentence, but only from a source we trust

---

## "How does it work?"

Walk the three moves.

**Ground it**
- the shelf: ~1000 clean, hand-written cards (the knowledge base)
- indexed once by meaning, so paraphrases still match
- sentence comes in, pull the few cards it hinges on
- no match found? that's allowed, it means we admit the gap

**Say it plainly**
- small fast model restates the sentence, resolves the jargon
- only the terms that matter, each links to its full card
- one pass, no agent loop, so runs stay comparable

**Prove it**
- gold set of real sentences with human-written answers
- scored on four things: correct, grounded, sounds like us, actually useful
- a different model does the judging
- one made-up answer fails the whole test, that's the bar

One line if they want it fast: *"Clean glossary, searched by meaning, a small model explains the sentence from only the cards it pulled, and if we don't have a term it says so."*

---

## "What did you learn?" (the meat, lead here if you can)

**1. Score what the user sees.**
- retrieval looked completely broken
- the actual answers on screen were clean
- I nearly fixed a number no user ever sees
- lesson: the output is the scoreboard, retrieval is just a diagnosis

**2. The fix isn't always upstream.**
- quality was off, so I fed the model more cards
- the answers got worse
- it only ever used two or three anyway
- lesson: the bottleneck was the model, so I stopped throwing search at it

**3. Doubt the measurement before you panic.**
- a score screamed "everything's broken"
- every single time, the test setup was the bug
- lesson: if a number looks catastrophic, check how you measured first

---

## "What's next?" (talk about it as in flight)

- **a verify step** that checks every claim before it reaches the reader. This is the real invention-killer, and the reason I could afford a cheap fast model to generate
- **the model call**, testing a couple head-to-head on the gold set to lock the right one
- **the search index** moving into a proper vector store so it scales past a glossary
- **into the browser extension**, so it's there in the flow of reading, which was the original point
- **a growth loop for free**: every "we don't cover that" logs the next card to write

---

## "Why does this matter for this role?"

- it's a knowledge base + retrieval + grounded answers + an eval loop
- that's Ask AI in miniature, and I built it end to end
- same rule Ask AI needs: answer from the source, or admit the gap
- I've lived that discipline on a product whose whole value is that it won't bluff you
