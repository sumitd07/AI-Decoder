'use strict';
// Sense gate (experiment, not wired into explain.js). After retrieval, ask Jev
// one yes/no per retrieved card: does this sentence use this term in this
// card's sense? Refusal becomes its own layer instead of rule 7 of the
// generation prompt, so the generator can be picked for grounding alone (D41:
// Pro grounds better, refuses worse).
//
// One request per card, not one request carrying all five cards: Jev's own
// guidance (jev-1.13 jaggedness) is that irrelevant state is a distractor, so
// each question sees only the sentence and the one card it is about.
//
// The contrast examples are deliberately NOT from the golden set (dropout,
// epoch, flops...), or the eval would be scoring its own answer key.

const { systemOne } = require('./providers/jev');

const SENSE_QUESTION = {
  type: 'noul',
  instructions:
    'Does `sentence` use the glossary term `term.title` (or one of `term.aliases`) in the sense given by `term.definition`, ' +
    'or describe that same concept without naming it?',
  criteria: {
    true:
      'The writer means the concept in `term.definition`: they name it, use an alias for it, or describe it in other words.',
    false:
      'The writer does not mean that concept. Either nothing in the sentence refers to it, or a word that matches the term ' +
      'is used with its everyday or other-field meaning (for example a "transformer" on a power line, a subway "token", ' +
      'paying "attention", a "model" on a runway).',
  },
};

// Sumit's original framing, kept as a baseline to compare the per-card gate
// against: one question about the whole sentence.
const AI_SENTENCE_QUESTION = {
  type: 'noul',
  instructions: 'Is `sentence` about artificial intelligence, machine learning, or software and products built on them?',
  criteria: {
    true: 'The sentence discusses AI or ML technology, research, products, or the industry around them.',
    false: 'The sentence is about something else, even if it contains a word that is also an AI term.',
  },
};

function cardState(sentence, card) {
  return {
    sentence,
    term: { title: card.title, aliases: card.aliases || [], definition: card.definition },
  };
}

async function senseCheck(sentence, cards, opts = {}) {
  return Promise.all(
    cards.map(async (card) => {
      const r = await systemOne({ state: cardState(sentence, card), questions: { sense: SENSE_QUESTION } }, opts);
      return { id: card.id, p: r.answers.sense ? r.answers.sense.noul : null, ms: r.ms, usage: r.usage, model: r.model };
    }),
  );
}

async function aiSentenceCheck(sentence, opts = {}) {
  const r = await systemOne({ state: { sentence }, questions: { ai: AI_SENTENCE_QUESTION } }, opts);
  return { p: r.answers.ai ? r.answers.ai.noul : null, ms: r.ms, usage: r.usage, model: r.model };
}

// Policy lives in code, not in the question: same probabilities, any threshold.
// keep = cards to hand the generator; skip = no card passed, answer "nothing to
// decode" without a generator call.
function decide(checks, threshold) {
  const keep = checks.filter((c) => c.p !== null && c.p >= threshold).map((c) => c.id);
  return { keep, skip: keep.length === 0 };
}

module.exports = { senseCheck, aiSentenceCheck, decide, SENSE_QUESTION, AI_SENTENCE_QUESTION };

// The rule the gate-only eval settled on (jev-evaluation/GATE-RESULTS.md): skip
// generation if the sentence isn't about AI, or if no retrieved card is used in
// its glossary sense. The two questions miss different rows (an AI job post vs a
// weather dashboard), so either one saying no is enough.
const DEFAULT_THRESHOLD = 0.3;

async function applyGate(sentence, cards, opts = {}) {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  const [checks, ai] = await Promise.all([senseCheck(sentence, cards, opts), aiSentenceCheck(sentence, opts)]);
  const { keep } = decide(checks, threshold);
  const notAi = ai.p !== null && ai.p < threshold;
  return { skip: notAi || keep.length === 0, keep, threshold, ai, checks, ms: Math.max(ai.ms, ...checks.map((c) => c.ms)) };
}

module.exports.applyGate = applyGate;
module.exports.DEFAULT_THRESHOLD = DEFAULT_THRESHOLD;
