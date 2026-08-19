#!/usr/bin/env node
'use strict';
// Scores retrieval on a results.json from eval/run.js. Pure code, no model —
// CONTRACT.md / PRD §Evaluation: "retrieval (did it find the right cards)".
//
//   node eval/score-retrieval.js <path/to/results.json> [--negatives=path]
//
// Per row: precision, recall, F1 vs the expected card ids, rank of the first
// expected card, and whether every expected card made the top-5 cut. Negative
// rows invert (D8): the correct answer is an EMPTY retrieved set. Empty-set
// rate is reported split by true_gap vs false_friend (eval/negatives.json) —
// a false friend that leaks a card is a precision failure with its own number,
// not folded into one undifferentiated "negatives" score.

const fs = require('fs');
const path = require('path');

const DEFAULT_NEGATIVES_PATH = path.join(__dirname, 'negatives.json');

// Scores one row. `expectedIds` and `retrievedIds` are plain id arrays;
// `retrievedIds` is assumed already rank-ordered and already cut at k (that's
// what retrieve()/explain() hand back — this function doesn't re-cut).
//
// Convention on the edge cases, spelled out because "0/0" arithmetic is where
// a scorer quietly lies: a positive row (expected non-empty) that retrieves
// nothing scores precision 0 (found zero of what it returned, i.e. nothing to
// be right about, so it doesn't get credit); a negative row (expected empty)
// that retrieves nothing scores precision 1 and recall 1 (the only correct
// outcome, correctly hit) — this is exactly what makes precision on a
// false-friend leak collapse to 0 below, which is the number that matters.
function scoreRow(expectedIds, retrievedIds) {
  const expected = new Set(expectedIds || []);
  const retrieved = retrievedIds || [];
  const retrievedSet = new Set(retrieved);
  const tp = retrieved.filter((id) => expected.has(id)).length;

  const precision = retrieved.length ? tp / retrieved.length : (expected.size ? 0 : 1);
  const recall = expected.size ? tp / expected.size : (retrieved.length ? 0 : 1);
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;

  let rank_of_first_expected = null;
  for (let i = 0; i < retrieved.length; i++) {
    if (expected.has(retrieved[i])) { rank_of_first_expected = i + 1; break; }
  }
  // Null, not true, on a negative row: "every expected card made the cut" is
  // vacuously true when nothing is expected, and printing `top5=true` next to a
  // row that leaked five cards reads as a pass. The negative's real number is the
  // empty-set rate below.
  const all_in_top5 = expected.size ? [...expected].every((id) => retrievedSet.has(id)) : null;

  return {
    precision,
    recall,
    f1,
    rank_of_first_expected,
    all_in_top5,
    tp,
    expected_count: expected.size,
    retrieved_count: retrieved.length,
    is_empty: retrieved.length === 0,
  };
}

function loadNegatives(negativesPath = DEFAULT_NEGATIVES_PATH) {
  const raw = JSON.parse(fs.readFileSync(negativesPath, 'utf8'));
  const byRow = new Map(raw.rows.map((r) => [r.row, r.class]));
  return byRow;
}

function mean(nums) {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

// Scores every row of a results.json manifest against its own `expected` field
// (written by run.js from the golden set) plus the negatives classification.
// Retrieval is an internal step. What D8 actually promises the reader is about the
// OUTPUT: the term chips they see and the gaps named. A leaked card that generation
// then ignores never reaches them, so scoring only the retrieved set reports a
// failure where the product is behaving correctly — and would buy "fixes" that cost
// real recall to move a number the reader never observes.
//
// So every row gets scored twice, at both layers:
//   retrieval  — did the right cards get FOUND (precision/recall/F1, empty on negatives)
//   output     — did the right terms get SHOWN (chips the reader clicks)
// A negative row passes at the output layer when it shows no chips, whatever
// retrieval handed the model.
function scoreOutput(expectedIds, output, isNegative) {
  const shown = [...new Set(((output && output.terms) || []).map((t) => t.card_id).filter(Boolean))];
  const expected = new Set(expectedIds);
  const hits = shown.filter((id) => expected.has(id));
  const gaps = ((output && output.gaps) || []).length;
  return {
    shown_ids: shown,
    shown_count: shown.length,
    gap_count: gaps,
    // On a negative, showing nothing is the win. On a positive, the usual pair.
    output_clean: isNegative ? shown.length === 0 : null,
    output_precision: isNegative ? null : (shown.length ? hits.length / shown.length : 0),
    output_recall: isNegative ? null : (expected.size ? hits.length / expected.size : 0),
    restatement_len: ((output && output.restatement) || '').length,
  };
}

function scoreResults(manifest, negativesByRow) {
  const perRow = manifest.rows.map((row) => {
    const retrievedIds = (row.retrieved || []).map((c) => c.id);
    const scored = scoreRow(row.expected.card_ids, retrievedIds);
    const outScored = scoreOutput(row.expected.card_ids, row.output, row.is_negative);
    const negClass = row.is_negative ? (negativesByRow.get(row.row) || 'unclassified') : null;
    return {
      row: row.row,
      sentence: row.sentence,
      is_negative: row.is_negative,
      negative_class: negClass,
      expected_card_ids: row.expected.card_ids,
      retrieved_ids: retrievedIds,
      error: row.error || null,
      ...scored,
      ...outScored,
    };
  });

  const positiveRows = perRow.filter((r) => !r.is_negative);
  const negativeRows = perRow.filter((r) => r.is_negative);

  const macro = {
    precision: mean(positiveRows.map((r) => r.precision)),
    recall: mean(positiveRows.map((r) => r.recall)),
    f1: mean(positiveRows.map((r) => r.f1)),
    n: positiveRows.length,
    all_in_top5_rate: positiveRows.length ? positiveRows.filter((r) => r.all_in_top5).length / positiveRows.length : 0,
    output_precision: mean(positiveRows.map((r) => r.output_precision)),
    output_recall: mean(positiveRows.map((r) => r.output_recall)),
  };

  function classSummary(cls) {
    const rows = negativeRows.filter((r) => r.negative_class === cls);
    const emptyCount = rows.filter((r) => r.is_empty).length;
    const leaks = rows.filter((r) => !r.is_empty);
    const cleanCount = rows.filter((r) => r.output_clean).length;
    const shownLeaks = rows.filter((r) => !r.output_clean);
    return {
      n: rows.length,
      empty_count: emptyCount,
      empty_rate: rows.length ? emptyCount / rows.length : null,
      leak_rows: leaks.map((r) => ({ row: r.row, retrieved_ids: r.retrieved_ids })),
      // The one that matters: chips the reader would actually have seen.
      output_clean_count: cleanCount,
      output_clean_rate: rows.length ? cleanCount / rows.length : null,
      output_leak_rows: shownLeaks.map((r) => ({ row: r.row, shown_ids: r.shown_ids })),
    };
  }

  const negatives = {
    true_gap: classSummary('true_gap'),
    false_friend: classSummary('false_friend'),
    unclassified: classSummary('unclassified'),
    overall: {
      n: negativeRows.length,
      empty_count: negativeRows.filter((r) => r.is_empty).length,
      empty_rate: negativeRows.length ? negativeRows.filter((r) => r.is_empty).length / negativeRows.length : null,
      output_clean_count: negativeRows.filter((r) => r.output_clean).length,
      output_clean_rate: negativeRows.length ? negativeRows.filter((r) => r.output_clean).length / negativeRows.length : null,
    },
  };

  return {
    shelf_version_id: manifest.shelf_version_id,
    run_label: manifest.run_label,
    legs: manifest.legs,
    pipeline: manifest.pipeline,
    macro,
    negatives,
    per_row: perRow,
  };
}

function pct(x) { return x == null ? ' n/a' : (x * 100).toFixed(0).padStart(3) + '%'; }

function formatReport(scores) {
  const L = [];
  const m = scores.macro;
  const tg = scores.negatives.true_gap;
  const ff = scores.negatives.false_friend;
  const ov = scores.negatives.overall;

  L.push(`shelf ${scores.shelf_version_id}  ·  run "${scores.run_label}"  ·  legs=${scores.legs}  ·  ${scores.pipeline}`);
  L.push('');
  L.push('Two layers are scored. RETRIEVAL is what the system found. OUTPUT is what the');
  L.push('reader actually sees — the term chips. A card that retrieval found and the model');
  L.push('then ignored never reaches anyone, so OUTPUT is the layer the product promises on.');
  L.push('');
  L.push('POSITIVES — 28 rows that should produce cards');
  L.push('                          retrieval    output');
  L.push(`  precision               ${pct(m.precision)}         ${pct(m.output_precision)}    of what was returned/shown, how much was right`);
  L.push(`  recall                  ${pct(m.recall)}         ${pct(m.output_recall)}    of what was expected, how much was found/shown`);
  L.push(`  every expected card in top-5   ${pct(m.all_in_top5_rate)}              capped at 5, so 5 rows can never reach this`);
  L.push('');
  L.push('NEGATIVES — 11 rows that should produce NOTHING');
  L.push('                          retrieval    output');
  L.push(`  true gaps (n=${tg.n})          ${pct(tg.empty_rate)}         ${pct(tg.output_clean_rate)}    no card exists for the term`);
  L.push(`  false friends (n=${ff.n})      ${pct(ff.empty_rate)}         ${pct(ff.output_clean_rate)}    the word is a shelf term, the sense is not`);
  L.push(`  all negatives (n=${ov.n})      ${pct(ov.empty_rate)}         ${pct(ov.output_clean_rate)}`);
  L.push('');
  if (ov.output_clean_count < ov.n) {
    const bad = [...ff.output_leak_rows, ...tg.output_leak_rows, ...scores.negatives.unclassified.output_leak_rows];
    L.push('  READER-VISIBLE FAILURES — chips shown on a row that should have shown none:');
    for (const r of bad) L.push(`    row ${r.row}: ${r.shown_ids.join(', ')}`);
    L.push('');
  }
  if (scores.negatives.unclassified.n) {
    L.push(`  ! ${scores.negatives.unclassified.n} negative row(s) missing from eval/negatives.json — fix that file.`);
    L.push('');
  }

  L.push('PER ROW');
  L.push('  row  kind          retrieval P/R    shown  expected   note');
  for (const r of scores.per_row) {
    const kind = r.is_negative ? (r.negative_class === 'false_friend' ? 'neg:friend' : 'neg:gap   ') : 'pos       ';
    let note = '';
    if (r.error) note = 'ERROR';
    else if (r.is_negative) note = r.output_clean ? 'clean' : 'SHOWED CHIPS';
    else if (r.output_recall === 0) note = 'showed nothing correct';
    else if (r.recall === 1) note = 'all found';
    L.push(
      `  ${String(r.row).padStart(3)}  ${kind}  ${r.precision.toFixed(2)}/${r.recall.toFixed(2)}` +
      `        ${String(r.shown_count).padStart(2)}     ${String(r.expected_count).padStart(2)}       ${note}`
    );
  }
  return L.join('\n');
}

function main(argv) {
  const [resultsArg, ...rest] = argv;
  if (!resultsArg) {
    console.error('usage: node eval/score-retrieval.js <path/to/results.json> [--negatives=path]');
    process.exit(1);
  }
  let negativesPath = DEFAULT_NEGATIVES_PATH;
  for (const arg of rest) {
    if (arg.startsWith('--negatives=')) negativesPath = arg.slice('--negatives='.length);
  }

  const manifest = JSON.parse(fs.readFileSync(resultsArg, 'utf8'));
  const negativesByRow = loadNegatives(negativesPath);
  const scores = scoreResults(manifest, negativesByRow);

  const report = formatReport(scores);
  console.log(report);

  const outPath = path.join(path.dirname(resultsArg), 'retrieval-scores.json');
  fs.writeFileSync(outPath, JSON.stringify(scores, null, 2));
  console.log(`\nWrote ${outPath}`);
  return scores;
}

if (require.main === module) {
  main(process.argv.slice(2));
}

module.exports = { scoreRow, scoreResults, formatReport, loadNegatives, mean, DEFAULT_NEGATIVES_PATH };
