'use strict';
// Claim check (experiment, not wired into explain.js). After generation, ask
// Jev one yes/no per sentence of the restatement: is everything this claim
// says backed by the highlighted sentence or by the cards the generator was
// given? Verification becomes its own layer, like refusal did with gate.js,
// so the generator can stay the fast one (D45: Flash-Lite + Jev).
//
// What the eval judge flags as invented falls into two kinds, and the
// question names both: a claim stronger than the source ("eliminated" where
// the writer said "reduced"), and an explanation of a term that has no card
// (the generator lists those in `gaps`, then explains them anyway).
//
// One request per claim: each question sees only the one claim it is about,
// per Jev's guidance that irrelevant state is a distractor.
//
// Contrast examples are deliberately NOT from the golden set.

const { systemOne } = require('./providers/jev');

const CLAIM_QUESTION = {
  type: 'noul',
  instructions:
    'Is everything `claim` states supported by `sentence` or by the definitions in `cards`? ' +
    '`claim` is one sentence of a plain-English explanation of `sentence`.',
  criteria: {
    true:
      'Every fact in `claim` is said or plainly implied by `sentence`, or comes from the definition of a card used to explain ' +
      'a term in `sentence`. Rewording, simpler words, and saying what kind of text `sentence` is (a job post, a claim, a tip) are fine.',
    false:
      'The claim adds something neither `sentence` nor `cards` says: a stronger or different outcome (for example "eliminated" ' +
      'where the writer said "reduced", or "always" where they said "often"), a cause, consequence or judgment the writer did not ' +
      'state, or a meaning for a term listed in `uncovered_terms`, which has no card.',
  },
};

// Narrow companion question, one per gap term. The broad claim question above
// scored "models that handle text" (an explanation of LLMs, listed as a gap)
// as supported at 0.87; Jev answers narrow questions far better (gate.js
// showed the same). Prompt rule 4 already says "name it as a gap, do not
// define it"; this checks whether the generator obeyed.
const GAP_QUESTION = {
  type: 'noul',
  instructions:
    'Does `explanation` say what `term` means or what it does, rather than only naming it or saying it is not covered?',
  criteria: {
    true:
      'Somewhere in `explanation` there is wording that describes or paraphrases `term` itself (what it is, what it does, ' +
      'or a plainer phrase standing in for it), even if `term` is not named next to that wording.',
    false:
      '`explanation` names `term`, says it is not covered, or leaves it out, and nothing in it describes what `term` is or does.',
  },
};

async function checkGaps(output, opts = {}) {
  const explanation = String((output && output.restatement) || '');
  const gaps = (output && output.gaps) || [];
  if (!explanation) return [];
  return Promise.all(
    gaps.map(async (term) => {
      const r = await systemOne({ state: { explanation, term }, questions: { defined: GAP_QUESTION } }, opts);
      return { term, p: r.answers.defined ? r.answers.defined.noul : null, ms: r.ms, usage: r.usage, model: r.model };
    }),
  );
}

// Gap terms the explanation defines anyway (high p = defined = a violation).
function definedGaps(checks, threshold) {
  return checks.filter((c) => c.p !== null && c.p >= threshold);
}

// Sentence split on terminal punctuation. Restatements are short plain prose
// (2-3 sentences), so nothing smarter is needed.
function splitClaims(restatement) {
  return String(restatement || '')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function claimState(sentence, claim, cards, gaps) {
  return {
    sentence,
    cards: cards.map((c) => ({ title: c.title, definition: c.definition })),
    uncovered_terms: gaps || [],
    claim,
  };
}

async function checkClaims(sentence, output, cards, opts = {}) {
  const claims = splitClaims(output && output.restatement);
  return Promise.all(
    claims.map(async (claim, i) => {
      const r = await systemOne(
        { state: claimState(sentence, claim, cards, output.gaps), questions: { supported: CLAIM_QUESTION } },
        opts,
      );
      return { i, claim, p: r.answers.supported ? r.answers.supported.noul : null, ms: r.ms, usage: r.usage, model: r.model };
    }),
  );
}

// Policy in code: same probabilities, any threshold.
function flagged(checks, threshold) {
  return checks.filter((c) => c.p !== null && c.p < threshold);
}

module.exports = { checkClaims, checkGaps, splitClaims, flagged, definedGaps, CLAIM_QUESTION, GAP_QUESTION };
