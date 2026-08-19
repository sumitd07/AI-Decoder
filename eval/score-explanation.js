#!/usr/bin/env node
'use strict';
// LLM judge for the explanation half of the golden set (PRD §Evaluation: "did
// it find the right cards" is score-retrieval.js's job; this scores whether
// the explanation itself is correct, grounded, in-voice, useful).
//
//   node eval/score-explanation.js <path/to/results.json> [--judge-model=] [--judge-provider=]
//
// Grounded is the ship gate (PRD §Success criteria: "zero ungrounded claims...
// a single confident invention is a ship-blocker"). The judge returns a
// boolean `ungrounded_claim` per row separate from the 1-5 axis scores, and
// this file reports it as a COUNT, never averaged into a mean — averaging
// would let one invention hide inside a 4.8.
//
// Runs through explain/providers/llm.js, same as generation, but the judge
// model must differ from the generator model (a model grading its own output
// is not evidence) — enforced as a loud warning, not a hard stop, since a
// warning is what CONTRACT.md asks for.

const fs = require('fs');
const path = require('path');
const { mapWithConcurrency, poolSize } = require('./pool');

const { complete } = require(path.join(__dirname, '..', 'explain', 'providers', 'llm.js'));

const DEFAULT_JUDGE_PROVIDER = 'gemini';
const DEFAULT_JUDGE_MODEL = 'gemini-pro-latest'; // -latest alias: pinned 2.0/2.5 ids are
                                                   // retired or zero-quota on this account.
const DEFAULT_GENERATOR_MODEL = 'gemini-flash-lite-latest'; // matches explain/providers/llm.js's default

// Named separately, as its own const, so a prompt-wording change is a one-line
// diff and score-explanation's history shows exactly when the rubric moved.
const JUDGE_PROMPT_TEMPLATE = `You are grading one output of "Explain This", a feature that explains a highlighted sentence using only a small set of glossary cards. You did not write the explanation and you are not being asked to improve it — only to score it.

You will be given:
- SENTENCE: the sentence that was highlighted.
- RETRIEVED CARDS: the glossary cards the system found for this sentence. This is the ONLY source of definitional truth it was allowed to use, besides the sentence itself.
- GENERATED OUTPUT: what the system produced — a restatement, plus terms it resolved and gaps it admitted.
- GOLD EXPLANATION: a human-written reference explanation for the same sentence, for comparison only. The generated output does not need to match it word for word — it needs to be right, grounded, in-voice, and useful on its own terms.

Score four axes, 1-5 each, with a one-line justification for each score:

- correct (1-5): Does the restatement accurately capture what the sentence claims? Compare against the gold explanation and your own reading of the sentence. A confident but wrong restatement scores low even if it reads well.
- grounded (1-5): Is every claim in the restatement traceable to a retrieved card (for what a term means) or to the sentence itself (for how terms relate)? A claim that is true but NOT in the cards or the sentence is still an invention — score it down. This is the most important axis.
- in_voice (1-5): Simple, direct, one idea at a time. Not bullet soup, not assistant-voice ("it's important to note", "this highlights"), no hedging padding. Starts by restating what kind of thing the sentence is when that helps. Score down generic-explainer prose even if it's accurate.
- useful (1-5): Would a reader who highlighted this sentence be un-lost in about twenty seconds? Score down anything that is technically correct but still leaves the reader needing to re-read it.

Then set ungrounded_claim: true if, and only if, the restatement states ANY definitional fact that is not in the retrieved cards and is not simple restatement of the sentence's own words — even one such invented detail. If unsure whether something is grounded, treat the uncertainty itself as a reason to look closer, not as reason to pass it; when genuinely unresolvable, set ungrounded_claim to true and say why in ungrounded_claim_detail. If there is no such claim, set it false and leave ungrounded_claim_detail empty.

An empty restatement (the system admitted a gap or found nothing) is not automatically wrong — score correct/grounded/useful on whether admitting the gap was the RIGHT call for this sentence, per the GOLD EXPLANATION.

Return only JSON, in exactly this shape:

{
  "correct": { "score": 1-5, "justification": "one line" },
  "grounded": { "score": 1-5, "justification": "one line" },
  "in_voice": { "score": 1-5, "justification": "one line" },
  "useful": { "score": 1-5, "justification": "one line" },
  "ungrounded_claim": true or false,
  "ungrounded_claim_detail": "what was invented, or empty string if none"
}

SENTENCE:
{{SENTENCE}}

RETRIEVED CARDS:
{{CARDS}}

GENERATED OUTPUT:
{{OUTPUT}}

GOLD EXPLANATION:
{{GOLD}}`;

// results.json stores retrieved cards as {id, title, score, legs} — no card text,
// to keep the file small. The judge needs the definitions: without them every card
// renders as "undefined", the judge sees no source for anything, and it correctly
// reports the whole run as ungrounded. That failure looks exactly like a real ship
// gate breach, so the text is loaded back from the shelf export by id.
let SHELF = null;
function shelfCard(id) {
  if (!SHELF) {
    const p = path.join(__dirname, '..', 'shelf', 'shelf-export.json');
    SHELF = new Map(JSON.parse(fs.readFileSync(p, 'utf8')).map((c) => [c.id, c]));
  }
  return SHELF.get(id) || null;
}

function renderCard(card) {
  const full = card.definition ? card : (shelfCard(card.id) || card);
  if (!full.definition) throw new Error(`judge: no card text for "${card.id}" — is shelf/shelf-export.json the version this run used?`);
  card = { ...card, definition: full.definition, examples: full.examples };
  const lines = [`- ${card.title} [${card.id}]: ${card.definition}`];
  for (const ex of card.examples || []) lines.push(`  example: ${ex}`);
  return lines.join('\n');
}

function buildJudgePrompt(row) {
  const cardsText = (row.retrieved && row.retrieved.length)
    ? row.retrieved.map(renderCard).join('\n')
    : '(none — retrieval returned an empty set for this sentence)';

  const outputText = JSON.stringify(
    {
      restatement: row.output.restatement,
      terms: row.output.terms,
      gaps: row.output.gaps,
    },
    null,
    2
  );

  const user = JUDGE_PROMPT_TEMPLATE
    .replace('{{SENTENCE}}', row.sentence)
    .replace('{{CARDS}}', cardsText)
    .replace('{{OUTPUT}}', outputText)
    .replace('{{GOLD}}', row.expected.explanation || '(no gold explanation for this row)');

  return {
    system: 'You are a careful, skeptical grader. You do not give credit for confident prose — only for claims that trace to the given sources.',
    user,
  };
}

// Same tolerant-extraction shape as explain/generate.js's extractJson, since
// the judge is asked for JSON but nothing guarantees it. Kept local rather
// than imported: this file must keep working even if generate.js's internals
// change shape, and the two parsers solve genuinely different problems (an
// output-contract vs a judge-rubric shape).
function extractJson(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  const attempts = [s];
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) attempts.push(fence[1].trim());
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first >= 0 && last > first) attempts.push(s.slice(first, last + 1));
  for (const a of attempts) {
    try {
      const parsed = JSON.parse(a);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch { /* try the next shape */ }
  }
  return null;
}

function coerceAxis(v) {
  const score = v && Number.isFinite(Number(v.score)) ? Math.min(5, Math.max(1, Math.round(Number(v.score)))) : null;
  const justification = v && typeof v.justification === 'string' ? v.justification.trim() : '';
  return { score, justification };
}

// Never silently pass a malformed judge reply as "clean". A parse failure or
// missing field is graded as the worst case on every axis and flagged
// ungrounded — a broken judge must fail loud, not fail quiet.
function parseJudgeReply(text) {
  const parsed = extractJson(text);
  if (!parsed) {
    return {
      correct: { score: 1, justification: 'judge reply was not parseable JSON' },
      grounded: { score: 1, justification: 'judge reply was not parseable JSON' },
      in_voice: { score: 1, justification: 'judge reply was not parseable JSON' },
      useful: { score: 1, justification: 'judge reply was not parseable JSON' },
      ungrounded_claim: true,
      ungrounded_claim_detail: 'judge reply was not parseable JSON — could not verify grounding, treated as unverified rather than clean',
      parse_error: true,
    };
  }

  const result = {
    correct: coerceAxis(parsed.correct),
    grounded: coerceAxis(parsed.grounded),
    in_voice: coerceAxis(parsed.in_voice),
    useful: coerceAxis(parsed.useful),
    ungrounded_claim: typeof parsed.ungrounded_claim === 'boolean' ? parsed.ungrounded_claim : true,
    ungrounded_claim_detail: typeof parsed.ungrounded_claim_detail === 'string' ? parsed.ungrounded_claim_detail : '',
    parse_error: false,
  };

  // A missing axis is coerced to a null score above; that null itself is a
  // signal something's wrong with the judge's reply, not a 0 to average in —
  // treat it the same as a parse failure for that axis's number, but keep
  // whatever the judge DID return for the rest.
  for (const axis of ['correct', 'grounded', 'in_voice', 'useful']) {
    if (result[axis].score == null) {
      result[axis].score = 1;
      result[axis].justification = result[axis].justification || 'judge reply missing this axis';
      result.parse_error = true;
    }
  }
  return result;
}

// D13/CONTRACT.md guard: the judge must not be the same model as the
// generator, since a model grading its own output isn't evidence. Compares
// model id strings only — case-sensitive equality is enough to catch the
// mistake this guards against (leaving JUDGE_MODEL unset so it defaults to
// the same thing LLM_MODEL resolves to).
function isSameModel(generatorModel, judgeModel) {
  if (!generatorModel || !judgeModel) return false;
  return String(generatorModel).trim() === String(judgeModel).trim();
}

async function judgeRow(row, judgeOpts) {
  const prompt = buildJudgePrompt(row);
  const started = Date.now();
  let res;
  try {
    // 4000. The judge tier reasons before it answers and that reasoning is billed
    // against the same output budget: at 500 every reply was ~20 characters of a
    // truncated object, at 2000 two rows still ran out mid-JSON. A judge that
    // fails this way looks identical to a system that failed the ship gate, so
    // the ceiling is deliberately generous — an unused ceiling costs nothing.
    res = await complete({ system: prompt.system, user: prompt.user, maxTokens: 4000, temperature: 0 }, judgeOpts);
  } catch (err) {
    return {
      row: row.row,
      scores: parseJudgeReply(''), // routes through the same "unparseable -> fail loud" path
      raw: null,
      judge_model: judgeOpts.model,
      error: String((err && err.message) || err),
      latency_ms: Date.now() - started,
    };
  }
  const scores = parseJudgeReply(res.text);
  return {
    row: row.row,
    sentence: row.sentence,
    scores,
    raw: res.text, // never discarded — CONTRACT.md
    judge_model: res.model,
    error: null,
    latency_ms: Date.now() - started,
  };
}

function aggregate(perRow) {
  const axisMean = (axis) => {
    const nums = perRow.map((r) => r.scores[axis].score).filter((n) => Number.isFinite(n));
    return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
  };
  const ungroundedRows = perRow.filter((r) => r.scores.ungrounded_claim);
  return {
    n: perRow.length,
    correct_mean: axisMean('correct'),
    grounded_mean: axisMean('grounded'),
    in_voice_mean: axisMean('in_voice'),
    useful_mean: axisMean('useful'),
    // The count is the ship gate — kept separate from every mean above so it
    // can never be averaged away.
    ungrounded_claim_count: ungroundedRows.length,
    ungrounded_claim_rows: ungroundedRows.map((r) => r.row),
    parse_error_count: perRow.filter((r) => r.scores.parse_error).length,
  };
}

async function scoreExplanations(manifest, judgeOpts) {
  const generatorModel = (manifest.rows.find((r) => r.model && r.model !== 'stub') || {}).model || manifest.llm?.model || null;
  const sameModel = isSameModel(generatorModel, judgeOpts.model);
  if (sameModel) {
    console.warn(`score-explanation: WARNING — judge model "${judgeOpts.model}" is the SAME as the generator model "${generatorModel}". A model grading its own output is not evidence. Set JUDGE_MODEL to something else.`);
  }

  // Rows are independent, so they run concurrently and come back in input order.
  // EVAL_CONCURRENCY tunes the pool: lower it on a free-tier key.
  const pool = poolSize('EVAL_CONCURRENCY');
  let done = 0;
  const perRow = await mapWithConcurrency(manifest.rows, pool, async (row) => {
    const r = await judgeRow(row, judgeOpts);
    process.stdout.write(`\r  judged ${++done}/${manifest.rows.length}`);
    return r;
  });
  process.stdout.write('\n');

  return {
    shelf_version_id: manifest.shelf_version_id,
    run_label: manifest.run_label,
    generator_model: generatorModel,
    judge_provider: judgeOpts.provider,
    judge_model: judgeOpts.model,
    judge_same_as_generator: sameModel,
    per_row: perRow,
    aggregate: aggregate(perRow),
  };
}

function formatReport(scores) {
  const a = scores.aggregate;
  const lines = [];
  lines.push(`Explanation — shelf ${scores.shelf_version_id} — run "${scores.run_label}"`);
  lines.push(`Generator: ${scores.generator_model}   Judge: ${scores.judge_provider}/${scores.judge_model}`);
  if (scores.judge_same_as_generator) {
    lines.push('*** WARNING: judge model == generator model — these scores are not independent evidence. ***');
  }
  lines.push('');
  lines.push(`correct=${a.correct_mean.toFixed(2)}  grounded=${a.grounded_mean.toFixed(2)}  in_voice=${a.in_voice_mean.toFixed(2)}  useful=${a.useful_mean.toFixed(2)}  (n=${a.n})`);
  lines.push('');
  lines.push(`*** UNGROUNDED CLAIMS: ${a.ungrounded_claim_count} / ${a.n} — SHIP GATE. rows: ${a.ungrounded_claim_rows.join(', ') || 'none'} ***`);
  if (a.parse_error_count) {
    lines.push(`(${a.parse_error_count} row(s) had an unparseable or incomplete judge reply — scored as worst-case, not skipped)`);
  }
  return lines.join('\n');
}

function main(argv) {
  const [resultsArg, ...rest] = argv;
  if (!resultsArg) {
    console.error('usage: node eval/score-explanation.js <path/to/results.json> [--judge-model=] [--judge-provider=]');
    process.exit(1);
  }
  let judgeModel = process.env.JUDGE_MODEL || DEFAULT_JUDGE_MODEL;
  let judgeProvider = process.env.JUDGE_PROVIDER || process.env.LLM_PROVIDER || DEFAULT_JUDGE_PROVIDER;
  for (const arg of rest) {
    if (arg.startsWith('--judge-model=')) judgeModel = arg.slice('--judge-model='.length);
    if (arg.startsWith('--judge-provider=')) judgeProvider = arg.slice('--judge-provider='.length);
  }

  const manifest = JSON.parse(fs.readFileSync(resultsArg, 'utf8'));
  return scoreExplanations(manifest, { provider: judgeProvider, model: judgeModel }).then((scores) => {
    console.log(formatReport(scores));
    const outPath = path.join(path.dirname(resultsArg), 'explanation-scores.json');
    fs.writeFileSync(outPath, JSON.stringify(scores, null, 2));
    console.log(`\nWrote ${outPath}`);
    return scores;
  });
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err.stack || String(err));
    process.exit(1);
  });
}

module.exports = {
  buildJudgePrompt,
  parseJudgeReply,
  extractJson,
  isSameModel,
  aggregate,
  scoreExplanations,
  formatReport,
  JUDGE_PROMPT_TEMPLATE,
  DEFAULT_JUDGE_MODEL,
  DEFAULT_JUDGE_PROVIDER,
  DEFAULT_GENERATOR_MODEL,
};
