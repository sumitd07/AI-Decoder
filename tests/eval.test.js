'use strict';
// Tests for the eval harness (eval/golden.js, eval/negatives.json,
// eval/score-retrieval.js, eval/score-explanation.js, eval/report.js).
// node:test, no network — anything that would touch a provider is tested via
// its pure functions (prompt building, reply parsing, the model guard) rather
// than by actually calling complete().

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const golden = require('../eval/golden');
const scoreRetrieval = require('../eval/score-retrieval');
const scoreExplanation = require('../eval/score-explanation');
const report = require('../eval/report');

// ---------------------------------------------------------------------------
// CSV parser
// ---------------------------------------------------------------------------

test('parseCsv: plain commas', () => {
  const rows = golden.parseCsv('a,b,c\n1,2,3\n');
  assert.deepEqual(rows, [['a', 'b', 'c'], ['1', '2', '3']]);
});

test('parseCsv: commas inside a quoted field are not delimiters', () => {
  const rows = golden.parseCsv('Sentence,Cards\n"Hello, world",foo\n');
  assert.deepEqual(rows, [['Sentence', 'Cards'], ['Hello, world', 'foo']]);
});

test('parseCsv: doubled quotes are an escaped quote', () => {
  const rows = golden.parseCsv('a,b\n"She said ""hi""",2\n');
  assert.deepEqual(rows[1], ['She said "hi"', '2']);
});

test('parseCsv: a newline inside a quoted field does not start a new row', () => {
  const rows = golden.parseCsv('a,b\n"line one\nline two",2\n');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[1], ['line one\nline two', '2']);
});

test('parseCsv: quotes, commas, and newlines together in one field', () => {
  const rows = golden.parseCsv('a,b\n"He said, ""go""\nand left",done\nnext,row\n');
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[1], ['He said, "go"\nand left', 'done']);
  assert.deepEqual(rows[2], ['next', 'row']);
});

// ---------------------------------------------------------------------------
// Golden-set loader
// ---------------------------------------------------------------------------

test('loadGolden: real golden-set.csv has 39 rows, 28 positive / 11 negative', () => {
  const rows = golden.loadGolden();
  assert.equal(rows.length, 39);
  const positives = rows.filter((r) => !r.is_negative);
  const negatives = rows.filter((r) => r.is_negative);
  assert.equal(positives.length, 28);
  assert.equal(negatives.length, 11);
});

test('loadGolden: every row has a sentence and row numbers are 1..39 with no gaps', () => {
  const rows = golden.loadGolden();
  for (const r of rows) assert.ok(r.sentence.length > 0, `row ${r.row} has an empty sentence`);
  assert.deepEqual(rows.map((r) => r.row), Array.from({ length: 39 }, (_, i) => i + 1));
});

test('loadGolden + assertCardIdsResolve: all real card ids resolve against the real shelf export', () => {
  const rows = golden.loadGolden();
  assert.doesNotThrow(() => golden.assertCardIdsResolve(rows));
});

test('assertCardIdsResolve: throws when a row references an id the shelf does not have', () => {
  const rows = [{ row: 1, card_ids: ['this-id-does-not-exist-anywhere'] }];
  const shelfIds = new Set(['some-real-id']);
  assert.throws(() => golden.assertCardIdsResolve(rows, shelfIds), /don't resolve/);
});

test('loadGolden: throws if the header does not match (wrong file fed in)', () => {
  const tmp = path.join(os.tmpdir(), `golden-bad-header-${Date.now()}.csv`);
  fs.writeFileSync(tmp, 'Wrong,Header,Here,Nope\n1,2,3,4\n');
  assert.throws(() => golden.loadGolden(tmp), /header column/);
  fs.rmSync(tmp);
});

test('loadGolden: throws if the row count drifts from 39', () => {
  const tmp = path.join(os.tmpdir(), `golden-short-${Date.now()}.csv`);
  fs.writeFileSync(tmp, 'Sentence,Associated Cards (Comma separated),Explanation,Card IDs\n"one",,"exp",\n');
  assert.throws(() => golden.loadGolden(tmp), /expected 39 rows/);
  fs.rmSync(tmp);
});

// ---------------------------------------------------------------------------
// eval/negatives.json
// ---------------------------------------------------------------------------

test('negatives.json: covers exactly the 11 negative rows from the golden set, no more no less', () => {
  const rows = golden.loadGolden();
  const negativeRowNumbers = new Set(rows.filter((r) => r.is_negative).map((r) => r.row));

  const negatives = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'eval', 'negatives.json'), 'utf8'));
  const classifiedRowNumbers = negatives.rows.map((r) => r.row);

  assert.equal(classifiedRowNumbers.length, 11, 'negatives.json should classify exactly 11 rows');
  assert.deepEqual(new Set(classifiedRowNumbers), negativeRowNumbers, 'negatives.json rows must exactly match the golden set\'s negative rows');

  for (const r of negatives.rows) {
    assert.ok(['true_gap', 'false_friend'].includes(r.class), `row ${r.row} has an invalid class "${r.class}"`);
    assert.ok(r.reason && r.reason.length > 0, `row ${r.row} has no reason`);
  }
});

test('negatives.json: summary counts match the row classifications', () => {
  const negatives = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'eval', 'negatives.json'), 'utf8'));
  const trueGap = negatives.rows.filter((r) => r.class === 'true_gap').length;
  const falseFriend = negatives.rows.filter((r) => r.class === 'false_friend').length;
  assert.equal(negatives.summary.true_gap, trueGap);
  assert.equal(negatives.summary.false_friend, falseFriend);
  assert.equal(negatives.summary.total, 11);
});

// ---------------------------------------------------------------------------
// Retrieval scorer
// ---------------------------------------------------------------------------

test('scoreRow: perfect match', () => {
  const s = scoreRetrieval.scoreRow(['a', 'b'], ['a', 'b']);
  assert.equal(s.precision, 1);
  assert.equal(s.recall, 1);
  assert.equal(s.f1, 1);
  assert.equal(s.rank_of_first_expected, 1);
  assert.equal(s.all_in_top5, true);
});

test('scoreRow: partial match — worked precision/recall/F1 arithmetic', () => {
  // expected {a,b,c}, retrieved [a,x,b,y] (order matters for rank).
  const s = scoreRetrieval.scoreRow(['a', 'b', 'c'], ['a', 'x', 'b', 'y']);
  assert.equal(s.tp, 2);
  assert.equal(s.precision, 2 / 4);
  assert.equal(s.recall, 2 / 3);
  const expectedF1 = (2 * (2 / 4) * (2 / 3)) / ((2 / 4) + (2 / 3));
  assert.ok(Math.abs(s.f1 - expectedF1) < 1e-9, `f1 ${s.f1} !== worked ${expectedF1}`);
  assert.ok(Math.abs(s.f1 - 4 / 7) < 1e-9, `f1 ${s.f1} !== 4/7`);
  assert.equal(s.rank_of_first_expected, 1); // 'a' is first
  assert.equal(s.all_in_top5, false); // 'c' never retrieved
});

test('scoreRow: empty retrieval on a positive row scores 0, not undefined/NaN', () => {
  const s = scoreRetrieval.scoreRow(['a', 'b'], []);
  assert.equal(s.precision, 0);
  assert.equal(s.recall, 0);
  assert.equal(s.f1, 0);
  assert.equal(s.rank_of_first_expected, null);
  assert.equal(s.all_in_top5, false);
  assert.equal(s.is_empty, true);
});

test('scoreRow: empty retrieval on a negative row is the CORRECT answer (D8)', () => {
  const s = scoreRetrieval.scoreRow([], []);
  assert.equal(s.precision, 1);
  assert.equal(s.recall, 1);
  assert.equal(s.f1, 1);
  assert.equal(s.is_empty, true);
});

test('scoreRow: a card leaking on a negative row is a precision failure', () => {
  const s = scoreRetrieval.scoreRow([], ['some-card']);
  assert.equal(s.precision, 0);
  assert.equal(s.is_empty, false);
});

test('scoreResults: aggregates macro P/R/F1 over positives only, and splits negatives by class', () => {
  const negativesByRow = new Map([
    [3, 'true_gap'],
    [4, 'false_friend'],
  ]);
  const manifest = {
    shelf_version_id: 'test-shelf',
    run_label: 'test-run',
    legs: 'both',
    pipeline: 'explain.js',
    rows: [
      { row: 1, sentence: 'pos perfect', is_negative: false, expected: { card_ids: ['a'] }, retrieved: [{ id: 'a' }], error: null },
      { row: 2, sentence: 'pos miss', is_negative: false, expected: { card_ids: ['b'] }, retrieved: [], error: null },
      { row: 3, sentence: 'true gap, correctly empty', is_negative: true, expected: { card_ids: [] }, retrieved: [], error: null },
      { row: 4, sentence: 'false friend, LEAKS a card', is_negative: true, expected: { card_ids: [] }, retrieved: [{ id: 'leaked' }], error: null },
    ],
  };
  const scores = scoreRetrieval.scoreResults(manifest, negativesByRow);
  assert.equal(scores.macro.n, 2);
  assert.equal(scores.macro.precision, (1 + 0) / 2);
  assert.equal(scores.negatives.true_gap.empty_rate, 1);
  assert.equal(scores.negatives.false_friend.empty_rate, 0);
  assert.equal(scores.negatives.false_friend.leak_rows.length, 1);
  assert.equal(scores.negatives.false_friend.leak_rows[0].row, 4);
});

test('scoreResults scores BOTH layers, and they can disagree', () => {
  // The point of the output layer: retrieval leaking a card on a negative row is
  // harmless if generation then shows no chip. Row 4 is exactly that case, and it
  // must read as a retrieval leak but an output pass. Row 5 is the one that
  // actually reaches the reader.
  const negativesByRow = new Map([[3, 'true_gap'], [4, 'false_friend'], [5, 'false_friend']]);
  const manifest = {
    shelf_version_id: 'test-shelf', run_label: 'test-run', legs: 'both', pipeline: 'explain.js',
    rows: [
      { row: 1, sentence: 'x', is_negative: false, expected: { card_ids: ['a', 'b'] }, retrieved: [{ id: 'a' }],
        output: { restatement: 'r', terms: [{ card_id: 'a', surface: 'A' }], gaps: [] }, error: null },
      { row: 3, sentence: 'y', is_negative: true, expected: { card_ids: [] }, retrieved: [],
        output: { restatement: 'nothing to decode', terms: [], gaps: [] }, error: null },
      { row: 4, sentence: 'z', is_negative: true, expected: { card_ids: [] }, retrieved: [{ id: 'leaked' }],
        output: { restatement: 'not about AI', terms: [], gaps: [] }, error: null },
      { row: 5, sentence: 'w', is_negative: true, expected: { card_ids: [] }, retrieved: [{ id: 'shownleak' }],
        output: { restatement: 'wrongly explained', terms: [{ card_id: 'shownleak', surface: 'S' }], gaps: [] }, error: null },
    ],
  };
  const scores = scoreRetrieval.scoreResults(manifest, negativesByRow);

  // Retrieval layer: rows 4 and 5 both leaked; only row 3 was empty.
  assert.equal(scores.negatives.overall.empty_count, 1);
  // Output layer: rows 3 and 4 are clean; only row 5 reached the reader.
  assert.equal(scores.negatives.overall.output_clean_count, 2);

  const r4 = scores.per_row.find((r) => r.row === 4);
  assert.equal(r4.is_empty, false, 'row 4 leaked at retrieval');
  assert.equal(r4.output_clean, true, 'row 4 is clean at the output layer');

  const r1 = scores.per_row.find((r) => r.row === 1);
  assert.equal(r1.output_precision, 1, 'one shown chip, and it was right');
  assert.equal(r1.output_recall, 0.5, 'one of two expected cards shown');

  const text = scoreRetrieval.formatReport(scores);
  assert.ok(text.includes('POSITIVES'), 'positives section');
  assert.ok(text.includes('NEGATIVES'), 'negatives section');
  assert.ok(text.includes('READER-VISIBLE FAILURES'), 'names the failures that reach a reader');
  assert.ok(text.includes('shownleak'), 'names the offending chip');
  assert.ok(!/row 4: /.test(text), 'a retrieval-only leak must NOT be reported as reader-visible');
});

// ---------------------------------------------------------------------------
// Explanation judge — pure functions only, no network
// ---------------------------------------------------------------------------

test('buildJudgePrompt: carries sentence, cards, output, and gold explanation', () => {
  const row = {
    sentence: 'The sentence under test.',
    retrieved: [{ id: 'foo', title: 'Foo', definition: 'Foo means bar.', examples: ['e1'] }],
    output: { restatement: 'It means bar.', terms: [{ card_id: 'foo', surface: 'foo' }], gaps: [] },
    expected: { explanation: 'Gold: it means bar.' },
  };
  const { system, user } = scoreExplanation.buildJudgePrompt(row);
  assert.ok(system.length > 0);
  assert.ok(user.includes('The sentence under test.'));
  assert.ok(user.includes('Foo means bar.'));
  assert.ok(user.includes('It means bar.'));
  assert.ok(user.includes('Gold: it means bar.'));
});

test('buildJudgePrompt: handles an empty retrieved set without crashing', () => {
  const row = {
    sentence: 'No cards here.',
    retrieved: [],
    output: { restatement: '', terms: [], gaps: ['some-term'] },
    expected: { explanation: 'Nothing to decode.' },
  };
  const { user } = scoreExplanation.buildJudgePrompt(row);
  assert.ok(user.includes('none'));
});

test('parseJudgeReply: parses a clean JSON reply', () => {
  const text = JSON.stringify({
    correct: { score: 4, justification: 'mostly right' },
    grounded: { score: 5, justification: 'all traced' },
    in_voice: { score: 3, justification: 'a bit generic' },
    useful: { score: 4, justification: 'would unstick a reader' },
    ungrounded_claim: false,
    ungrounded_claim_detail: '',
  });
  const parsed = scoreExplanation.parseJudgeReply(text);
  assert.equal(parsed.correct.score, 4);
  assert.equal(parsed.grounded.score, 5);
  assert.equal(parsed.ungrounded_claim, false);
  assert.equal(parsed.parse_error, false);
});

test('parseJudgeReply: tolerates a ```json code fence', () => {
  const inner = { correct: { score: 3, justification: 'x' }, grounded: { score: 3, justification: 'x' }, in_voice: { score: 3, justification: 'x' }, useful: { score: 3, justification: 'x' }, ungrounded_claim: false, ungrounded_claim_detail: '' };
  const text = '```json\n' + JSON.stringify(inner) + '\n```';
  const parsed = scoreExplanation.parseJudgeReply(text);
  assert.equal(parsed.correct.score, 3);
  assert.equal(parsed.parse_error, false);
});

test('parseJudgeReply: unparseable reply fails LOUD — worst-case scores, ungrounded_claim true, parse_error true', () => {
  const parsed = scoreExplanation.parseJudgeReply('not json at all, sorry');
  assert.equal(parsed.correct.score, 1);
  assert.equal(parsed.grounded.score, 1);
  assert.equal(parsed.ungrounded_claim, true);
  assert.equal(parsed.parse_error, true);
});

test('parseJudgeReply: missing ungrounded_claim boolean defaults to true (fail loud, not fail quiet)', () => {
  const text = JSON.stringify({ correct: { score: 5, justification: 'x' }, grounded: { score: 5, justification: 'x' }, in_voice: { score: 5, justification: 'x' }, useful: { score: 5, justification: 'x' } });
  const parsed = scoreExplanation.parseJudgeReply(text);
  assert.equal(parsed.ungrounded_claim, true);
});

test('isSameModel: guards against the judge being the generator', () => {
  assert.equal(scoreExplanation.isSameModel('gemini-flash-lite-latest', 'gemini-flash-lite-latest'), true);
  assert.equal(scoreExplanation.isSameModel('gemini-flash-lite-latest', 'gemini-pro-latest'), false);
  assert.equal(scoreExplanation.isSameModel(null, 'gemini-pro-latest'), false);
});

test('aggregate: ungrounded_claim_count is a count, never folded into the axis means', () => {
  const perRow = [
    { row: 1, scores: { correct: { score: 5 }, grounded: { score: 5 }, in_voice: { score: 5 }, useful: { score: 5 }, ungrounded_claim: false, parse_error: false } },
    { row: 2, scores: { correct: { score: 5 }, grounded: { score: 1 }, in_voice: { score: 5 }, useful: { score: 5 }, ungrounded_claim: true, parse_error: false } },
  ];
  const agg = scoreExplanation.aggregate(perRow);
  assert.equal(agg.ungrounded_claim_count, 1);
  assert.equal(agg.ungrounded_claim_rows.length, 1);
  assert.equal(agg.ungrounded_claim_rows[0], 2);
  // grounded_mean is an honest average of the two rows' scores (5 and 1) — the
  // count above is a SEPARATE, additional signal, not a substitute for it.
  assert.equal(agg.grounded_mean, 3);
});

// ---------------------------------------------------------------------------
// report.js — renders from a fixture without crashing
// ---------------------------------------------------------------------------

test('report.js: renders a single run from a fixture results file without crashing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-report-fixture-'));
  const results = {
    shelf_version_id: 'shelf-fixture-000000000000',
    shelf_version_source: 'fixture',
    run_label: 'fixture-run',
    legs: 'both',
    dry_run: true,
    pipeline: 'explain.js',
    generated_at: new Date().toISOString(),
    llm: { provider: 'mock', model: 'mock', configured: true },
    embed: { provider: 'mock', model: 'mock', configured: true },
    row_count: 2,
    errored_count: 0,
    elapsed_ms: 10,
    rows: [
      { row: 1, sentence: 'fixture sentence one', is_negative: false, expected: { card_ids: ['a'], associated_cards: ['A'], explanation: 'gold one' }, retrieved: [{ id: 'a', title: 'A', score: 0.9 }], legOutput: {}, output: { restatement: 'r1', terms: [], gaps: [] }, model: 'mock', embed_model: 'mock', usage: {}, notes: [], shelf_version: 'shelf-fixture-000000000000', latency_ms: 5, error: null },
      { row: 2, sentence: 'fixture sentence two', is_negative: true, expected: { card_ids: [], associated_cards: [], explanation: 'gold two' }, retrieved: [], legOutput: {}, output: { restatement: '', terms: [], gaps: [] }, model: 'mock', embed_model: 'mock', usage: {}, notes: [], shelf_version: 'shelf-fixture-000000000000', latency_ms: 5, error: null },
    ],
  };
  fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify(results, null, 2));

  // No retrieval-scores.json / explanation-scores.json — report.js must
  // degrade gracefully to "not scored yet" instead of throwing.
  const run = report.loadRun(dir);
  const text = report.formatSingle(run);
  assert.ok(text.includes('fixture-run'));
  assert.ok(text.includes('not scored yet'));

  fs.rmSync(dir, { recursive: true, force: true });
});

test('report.js: compares two runs without crashing when both are scored', () => {
  const dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-report-a-'));
  const dirB = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-report-b-'));

  const base = (label) => ({
    shelf_version_id: 'shelf-fixture-000000000000',
    shelf_version_source: 'fixture',
    run_label: label,
    legs: 'both',
    dry_run: true,
    pipeline: 'explain.js',
    generated_at: new Date().toISOString(),
    llm: { provider: 'mock', model: 'mock', configured: true },
    embed: { provider: 'mock', model: 'mock', configured: true },
    row_count: 1,
    errored_count: 0,
    elapsed_ms: 1,
    rows: [{ row: 1, sentence: 's', is_negative: false, expected: { card_ids: ['a'], associated_cards: [], explanation: 'g' }, retrieved: [{ id: 'a' }], legOutput: {}, output: { restatement: 'r', terms: [], gaps: [] }, model: 'mock', embed_model: 'mock', usage: {}, notes: [], shelf_version: 'shelf-fixture-000000000000', latency_ms: 1, error: null }],
  });

  const negatives = new Map();
  const retrievalScoresA = scoreRetrieval.scoreResults(base('run-a'), negatives);
  const retrievalScoresB = scoreRetrieval.scoreResults(base('run-b'), negatives);

  fs.writeFileSync(path.join(dirA, 'results.json'), JSON.stringify(base('run-a')));
  fs.writeFileSync(path.join(dirA, 'retrieval-scores.json'), JSON.stringify(retrievalScoresA));
  fs.writeFileSync(path.join(dirB, 'results.json'), JSON.stringify(base('run-b')));
  fs.writeFileSync(path.join(dirB, 'retrieval-scores.json'), JSON.stringify(retrievalScoresB));

  const runA = report.loadRun(dirA);
  const runB = report.loadRun(dirB);
  const text = report.formatCompare(runA, runB);
  assert.ok(text.includes('run-a'));
  assert.ok(text.includes('run-b'));

  fs.rmSync(dirA, { recursive: true, force: true });
  fs.rmSync(dirB, { recursive: true, force: true });
});
