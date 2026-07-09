# Decoder term style contract

Any run (human or scheduled agent) that writes glossary entries MUST follow this. The goal: every term reads like the original 15 — plain, warm, a little witty, never marketing-speak or textbook-dry.

## Schema (every term is an object)

```js
{ id:'slug', term:'Display Name', aliases:'Full Name Or Acronym', said:'“pronounce”', // said optional
  aliasList:['slug','display name','common variants'], status:'Core|Rising|Fading|Historical',
  oneLiner:'One plain sentence. What it is, in a breath.',
  analogy:'An everyday comparison — kitchen, office, sports, not tech.',
  example:'A concrete, specific moment where the term shows up.',
  related:[{text:'How it connects, in a phrase.', id:'otherslug'}], // id optional; omit if target not in glossary
  deeper:'2–4 sentences of the real mechanism, readable but honest. The "if you want to go one level down" paragraph.',
  lens_pm:'One sentence for a product manager — the practical why-it-matters.',
  lens_eng:'One sentence for an engineer — the precise technical version.' }
```

## Voice rules

- **One-liner:** a single sentence, plain-language, ideally with a small turn of phrase. No hedging, no "refers to", no "in the context of".
- **Analogy:** everyday and physical. Open-book exam, desk that fits so many papers, USB-C, spellchecker. Never explain AI with more AI.
- **Example:** specific and grounded. A named-ish situation, not "for instance, a company might…".
- **Deeper:** tell the truth about the mechanism, including the catch or the failure mode. This is where honesty lives.
- **Lenses:** `pm` = decision/impact; `eng` = the exact mechanism. Both one sentence.
- Curly quotes “ ” and em dashes — are fine and on-brand. Avoid exclamation marks and hype.
- **Status:** Core (foundational, here to stay), Rising (newer, gaining), Fading (real but cooling), Historical (mostly dead/renamed — write it like a respectful obituary).

## Cross-links

Only set `related[].id` to a slug that already exists in `content/registry.json` OR is in the same batch. Otherwise drop the `id` and keep just the `text`. The validator enforces this — a dangling id fails the batch.

## Two exemplars (match this register)

**RAG** — oneLiner: "Hand the model a stack of your documents to read before it answers, so it stops making things up." analogy: "An open-book exam — instead of reciting from memory, it looks up the right page first." deeper: "Your docs get chopped into chunks, turned into embeddings, and stored in a vector database. At query time the system finds the closest chunks and stuffs them into the context window next to your question. Quality lives and dies on the retrieval step — bad chunks in, bad answer out."

**Hallucination** — oneLiner: "When the model states something false with total confidence — the failure mode that never fully goes away." analogy: "A friend who never says 'I don't know' and just fills the gap with a plausible-sounding story." deeper: "It's not lying — the model predicts likely text, and 'likely' is not 'true.' Grounding it in real documents and asking it to cite reduces it, but confidence and correctness are separate dials."
