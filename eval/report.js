#!/usr/bin/env node
'use strict';
// Human-readable summary of one eval run, or a run-vs-run comparison — the
// whole point of the harness (task brief: "that comparison is the whole point").
//
//   node eval/report.js <run>            summarise one run
//   node eval/report.js <runA> <runB>    compare two runs, delta-style
//
// A "<run>" is either a path to a results.json, or the directory containing
// it (eval/out/<version_id>/<label>/). retrieval-scores.json and
// explanation-scores.json are read from the same directory if present;
// either or both can be missing (e.g. only run.js has been run so far) —
// this degrades to "not scored yet" rather than crashing, so the harness is
// checkable before a real eval has been fully scored.

const fs = require('fs');
const path = require('path');

function resolveDir(runArg) {
  if (fs.existsSync(runArg) && fs.statSync(runArg).isDirectory()) return runArg;
  if (runArg.endsWith('.json')) return path.dirname(runArg);
  return runArg;
}

function readJsonIfExists(p) {
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function loadRun(runArg) {
  const dir = resolveDir(runArg);
  const results = readJsonIfExists(path.join(dir, 'results.json'));
  if (!results) throw new Error(`report: no results.json in ${dir}`);
  const retrieval = readJsonIfExists(path.join(dir, 'retrieval-scores.json'));
  const explanation = readJsonIfExists(path.join(dir, 'explanation-scores.json'));
  return { dir, results, retrieval, explanation };
}

function pct(n) {
  return n == null ? 'n/a' : `${(n * 100).toFixed(0)}%`;
}
function fixed(n, d = 2) {
  return n == null ? 'n/a' : Number(n).toFixed(d);
}

// Lowest-`n` rows on one axis, for the "worst 5 rows per axis" requirement.
// Ties broken by row number so the list is stable across identical reruns.
function worstRows(perRow, axis, n = 5) {
  return [...perRow]
    .filter((r) => r.scores && r.scores[axis] && r.scores[axis].score != null)
    .sort((a, b) => a.scores[axis].score - b.scores[axis].score || a.row - b.row)
    .slice(0, n);
}

function formatSingle(run) {
  const lines = [];
  const { results, retrieval, explanation } = run;

  lines.push('='.repeat(72));
  lines.push(`Explain This — eval report`);
  lines.push(`  shelf version : ${results.shelf_version_id}`);
  lines.push(`  run label     : ${results.run_label}`);
  lines.push(`  pipeline      : ${results.pipeline}${results.pipeline === 'stub' ? '  *** STUB — not a scored run ***' : ''}`);
  lines.push(`  legs          : ${results.legs}`);
  lines.push(`  dry_run       : ${results.dry_run}`);
  lines.push(`  rows          : ${results.row_count} (${results.errored_count} errored)`);
  if (results.llm) lines.push(`  llm model     : ${results.llm.provider}/${results.llm.model} (configured=${results.llm.configured})`);
  if (results.embed) lines.push(`  embed model   : ${results.embed.provider}/${results.embed.model} (configured=${results.embed.configured})`);
  if (explanation) lines.push(`  judge model   : ${explanation.judge_provider}/${explanation.judge_model}${explanation.judge_same_as_generator ? '  *** SAME AS GENERATOR — invalid comparison ***' : ''}`);
  lines.push('='.repeat(72));

  lines.push('');
  lines.push('RETRIEVAL');
  if (!retrieval) {
    lines.push('  not scored yet — run: node eval/score-retrieval.js ' + path.join(run.dir, 'results.json'));
  } else {
    const m = retrieval.macro;
    lines.push(`  positives (n=${m.n}): precision=${fixed(m.precision)} recall=${fixed(m.recall)} f1=${fixed(m.f1)} all-in-top5=${pct(m.all_in_top5_rate)}`);
    const tg = retrieval.negatives.true_gap;
    const ff = retrieval.negatives.false_friend;
    lines.push(`  negatives — true_gap (n=${tg.n}): empty-set rate ${pct(tg.empty_rate)}`);
    lines.push(`  negatives — false_friend (n=${ff.n}): empty-set rate ${pct(ff.empty_rate)}${ff.leak_rows.length ? `  *** ${ff.leak_rows.length} LEAK(S): rows ${ff.leak_rows.map((r) => r.row).join(', ')} ***` : ''}`);
    if (retrieval.negatives.unclassified.n) {
      lines.push(`  *** ${retrieval.negatives.unclassified.n} negative row(s) missing from eval/negatives.json ***`);
    }
  }

  lines.push('');
  lines.push('EXPLANATION (LLM judge)');
  if (!explanation) {
    lines.push('  not scored yet — run: node eval/score-explanation.js ' + path.join(run.dir, 'results.json'));
  } else {
    const a = explanation.aggregate;
    lines.push(`  correct=${fixed(a.correct_mean)}  grounded=${fixed(a.grounded_mean)}  in_voice=${fixed(a.in_voice_mean)}  useful=${fixed(a.useful_mean)}  (n=${a.n})`);
    lines.push('');
    lines.push(`  *** UNGROUNDED CLAIMS: ${a.ungrounded_claim_count} / ${a.n} — SHIP GATE (PRD §Success criteria) ***`);
    if (a.ungrounded_claim_count) {
      lines.push(`      rows: ${a.ungrounded_claim_rows.join(', ')}`);
    }
    if (a.parse_error_count) {
      lines.push(`  (${a.parse_error_count} row(s) had an unparseable judge reply, scored worst-case)`);
    }

    lines.push('');
    lines.push('  Worst 5 rows per axis:');
    for (const axis of ['correct', 'grounded', 'in_voice', 'useful']) {
      lines.push(`    ${axis}:`);
      for (const r of worstRows(explanation.per_row, axis)) {
        const snippet = (r.sentence || '').slice(0, 60);
        lines.push(`      row ${String(r.row).padStart(2)}  score=${r.scores[axis].score}  "${snippet}${r.sentence && r.sentence.length > 60 ? '…' : ''}"  — ${r.scores[axis].justification}`);
      }
    }
  }

  lines.push('');
  return lines.join('\n');
}

function delta(a, b) {
  if (a == null || b == null) return 'n/a';
  const d = b - a;
  const sign = d > 0 ? '+' : '';
  return `${sign}${d.toFixed(3)}`;
}

function formatCompare(runA, runB) {
  const lines = [];
  lines.push('='.repeat(72));
  lines.push(`Explain This — run comparison`);
  lines.push(`  A: ${runA.results.run_label}  (shelf ${runA.results.shelf_version_id}, legs=${runA.results.legs})`);
  lines.push(`  B: ${runB.results.run_label}  (shelf ${runB.results.shelf_version_id}, legs=${runB.results.legs})`);
  if (runA.results.shelf_version_id !== runB.results.shelf_version_id) {
    lines.push('  *** DIFFERENT SHELF VERSIONS — these scores are not directly comparable (Explain-This-Technical.md) ***');
  }
  lines.push('='.repeat(72));

  lines.push('');
  lines.push('RETRIEVAL');
  if (!runA.retrieval || !runB.retrieval) {
    lines.push('  one or both runs have no retrieval-scores.json — score both before comparing.');
  } else {
    const ma = runA.retrieval.macro, mb = runB.retrieval.macro;
    lines.push(`  precision  A=${fixed(ma.precision)}  B=${fixed(mb.precision)}  Δ=${delta(ma.precision, mb.precision)}`);
    lines.push(`  recall     A=${fixed(ma.recall)}  B=${fixed(mb.recall)}  Δ=${delta(ma.recall, mb.recall)}`);
    lines.push(`  f1         A=${fixed(ma.f1)}  B=${fixed(mb.f1)}  Δ=${delta(ma.f1, mb.f1)}`);
    const tga = runA.retrieval.negatives.true_gap, tgb = runB.retrieval.negatives.true_gap;
    const ffa = runA.retrieval.negatives.false_friend, ffb = runB.retrieval.negatives.false_friend;
    lines.push(`  true_gap empty-rate      A=${pct(tga.empty_rate)}  B=${pct(tgb.empty_rate)}`);
    lines.push(`  false_friend empty-rate  A=${pct(ffa.empty_rate)}  B=${pct(ffb.empty_rate)}  (leaks A=${ffa.leak_rows.length} B=${ffb.leak_rows.length})`);
  }

  lines.push('');
  lines.push('EXPLANATION');
  if (!runA.explanation || !runB.explanation) {
    lines.push('  one or both runs have no explanation-scores.json — score both before comparing.');
  } else {
    const aa = runA.explanation.aggregate, ab = runB.explanation.aggregate;
    for (const [label, key] of [['correct', 'correct_mean'], ['grounded', 'grounded_mean'], ['in_voice', 'in_voice_mean'], ['useful', 'useful_mean']]) {
      lines.push(`  ${label.padEnd(9)} A=${fixed(aa[key])}  B=${fixed(ab[key])}  Δ=${delta(aa[key], ab[key])}`);
    }
    lines.push('');
    const worseGate = ab.ungrounded_claim_count > aa.ungrounded_claim_count;
    lines.push(`  *** UNGROUNDED CLAIMS  A=${aa.ungrounded_claim_count}  B=${ab.ungrounded_claim_count}  ${worseGate ? '— REGRESSION, B invents more than A ***' : ab.ungrounded_claim_count < aa.ungrounded_claim_count ? '— improvement ***' : '— unchanged ***'}`);
  }

  lines.push('');
  return lines.join('\n');
}

function main(argv) {
  if (argv.length === 1) {
    const run = loadRun(argv[0]);
    console.log(formatSingle(run));
  } else if (argv.length === 2) {
    const runA = loadRun(argv[0]);
    const runB = loadRun(argv[1]);
    console.log(formatCompare(runA, runB));
  } else {
    console.error('usage: node eval/report.js <run>  |  node eval/report.js <runA> <runB>');
    process.exit(1);
  }
}

if (require.main === module) {
  main(process.argv.slice(2));
}

module.exports = { loadRun, formatSingle, formatCompare, worstRows, resolveDir };
