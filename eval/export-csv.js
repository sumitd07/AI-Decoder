#!/usr/bin/env node
// Dumps a scored run to one CSV, row by row.
//   node eval/export-csv.js eval/out/<version>/<label> [out.csv]
//
// The JSON the scorers write is built for diffing runs, not for reading. This
// joins results + retrieval scores + judge scores into the flat shape you'd
// actually scan: what was asked, what came back, and why the judge scored it
// that way — one line per golden-set row.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function readJson(p) {
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// RFC 4180: quote everything, double any embedded quote. The explanations contain
// commas, quotes and the occasional newline, so nothing here is optional.
function cell(v) {
  if (v === null || v === undefined) return '""';
  return '"' + String(v).replace(/"/g, '""') + '"';
}

const COLS = [
  'row', 'kind', 'negative_class', 'sentence', 'gold_explanation', 'model_restatement',
  'expected_card_ids', 'retrieved_card_ids', 'shown_card_ids', 'shown_surfaces', 'gaps_named',
  'retrieval_precision', 'retrieval_recall', 'retrieval_f1',
  'output_precision', 'output_recall', 'output_clean',
  'judge_correct', 'judge_grounded', 'judge_in_voice', 'judge_useful', 'ungrounded_claim',
  'why_correct', 'why_grounded', 'why_in_voice', 'why_useful', 'ungrounded_detail',
  'latency_ms', 'input_tokens', 'output_tokens',
];

function main(argv) {
  const runDir = argv[0];
  if (!runDir) {
    console.error('usage: node eval/export-csv.js eval/out/<version>/<label> [out.csv]');
    process.exit(1);
  }
  const results = readJson(path.join(runDir, 'results.json'));
  if (!results) { console.error(`export-csv: no results.json in ${runDir}`); process.exit(1); }

  // Both scorers are optional: a run can be dumped before it has been scored,
  // and the score columns simply come out empty.
  const retrieval = readJson(path.join(runDir, 'retrieval-scores.json'));
  const explanation = readJson(path.join(runDir, 'explanation-scores.json'));
  const negatives = readJson(path.join(ROOT, 'eval', 'negatives.json'));

  const retBy = new Map(((retrieval || {}).per_row || []).map((r) => [r.row, r]));
  const expBy = new Map(((explanation || {}).per_row || []).map((r) => [r.row, r]));
  const negBy = new Map(((negatives || {}).rows || []).map((r) => [r.row, r]));

  const lines = [COLS.map(cell).join(',')];
  for (const r of results.rows) {
    const R = retBy.get(r.row) || {};
    const S = (expBy.get(r.row) || {}).scores || {};
    const ax = (a, k) => ((S[a] || {})[k] ?? '');
    const num = (v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : '');
    const row = {
      row: r.row,
      kind: r.is_negative ? 'negative' : 'positive',
      negative_class: r.is_negative ? (negBy.get(r.row) || {}).class || '' : '',
      sentence: r.sentence,
      gold_explanation: r.expected.explanation,
      model_restatement: r.output.restatement,
      expected_card_ids: r.expected.card_ids.join('; '),
      retrieved_card_ids: (r.retrieved || []).map((c) => c.id).join('; '),
      shown_card_ids: (r.output.terms || []).map((t) => t.card_id).join('; '),
      shown_surfaces: (r.output.terms || []).map((t) => t.surface).join('; '),
      gaps_named: (r.output.gaps || []).join('; '),
      retrieval_precision: num(R.precision),
      retrieval_recall: num(R.recall),
      retrieval_f1: num(R.f1),
      output_precision: num(R.output_precision),
      output_recall: num(R.output_recall),
      output_clean: R.output_clean === null || R.output_clean === undefined ? '' : R.output_clean,
      judge_correct: ax('correct', 'score'),
      judge_grounded: ax('grounded', 'score'),
      judge_in_voice: ax('in_voice', 'score'),
      judge_useful: ax('useful', 'score'),
      ungrounded_claim: S.ungrounded_claim ?? '',
      why_correct: ax('correct', 'justification'),
      why_grounded: ax('grounded', 'justification'),
      why_in_voice: ax('in_voice', 'justification'),
      why_useful: ax('useful', 'justification'),
      ungrounded_detail: S.ungrounded_claim_detail || '',
      latency_ms: r.latency_ms ?? '',
      input_tokens: (r.usage || {}).input_tokens ?? '',
      output_tokens: (r.usage || {}).output_tokens ?? '',
    };
    lines.push(COLS.map((c) => cell(row[c])).join(','));
  }

  const out = argv[1] || path.join(ROOT, 'outputs', `explain-this-eval-${results.run_label}.csv`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, lines.join('\n') + '\n');
  console.log(`wrote ${results.rows.length} rows → ${out}`);
  if (!retrieval) console.log('  (no retrieval-scores.json — those columns are empty)');
  if (!explanation) console.log('  (no explanation-scores.json — judge columns are empty)');
}

if (require.main === module) main(process.argv.slice(2));
module.exports = { cell, COLS };
