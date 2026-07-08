# Prototype prompt — AI Cheatsheet

*Paste this into Claude, along with the attached product thinking doc (`ai-cheatsheet-product-thinking.md`).*

---

I've attached a product thinking doc for a lightweight tool that helps people stay fluent in AI without taking a course. Read it first — it's the source of truth for the concept, tone, and principles.

Now build an interactive, clickable prototype (single self-contained HTML file, no backend). Prioritize creativity, simplicity, and delight over completeness.

**Build these three surfaces:**

1. **Spotlight lookup (the core).** A keystroke-summoned search bar over a set of ~15 example concept cards. Results appear instantly as I type. Each card uses the strict anatomy from §4: term + aliases, a one-line explanation, an analogy, a status badge (Core / Rising / Fading / Historical), one concrete example, 2–3 related concepts, and a hidden "go deeper" layer. Include at least one Historical "obituary" card (e.g. vibe coding).

2. **Select-to-explain (§5b).** Show a sample article/paragraph of text. When I select an AI term, a small, unobtrusive popover appears in place with the compressed card (one-liner + analogy + example) and a "Save to my cheatsheet" button. It should feel invisible-until-asked, not like an aggressive popup.

3. **My cheatsheet.** A simple personal collection of saved cards — a calm, skimmable glossary. Saving from surface 2 adds to it here.

**Constraints:**
- Tone: plain, confident, a little witty — like a smart friend leveling with you. No jargon-explaining-jargon.
- Feel: fast, glanceable, low-commitment. No login walls, no quizzes, streaks, or gamification.
- Use realistic placeholder content for the ~15 concepts (RAG, evals, context window, HITL, agents, embeddings, fine-tuning, etc.).
- Keep it a single HTML file with in-memory state (no localStorage). Make the interactions and micro-transitions feel polished.

Use your judgment on visual style, but keep it minimal and modern. Start by confirming your plan for the three surfaces in one or two sentences, then build.
