#!/usr/bin/env node
'use strict';
// Gate-only eval for the Jev sense gate (explain/gate.js). No generator calls:
// it reuses the retrieval and outputs already saved by earlier runs, asks Jev
// about each retrieved card, and reports what the gate would have done.
//
//   node --env-file=.env eval/gate-jev.js [--runs=v1-flashlite,v8-pro] [--label=NAME] [--model=jev-1.13.0] [--dry-run]
//
// What it answers, per threshold:
//   - negatives the gate would skip outright (no card passes → no generator call)
//   - positives it would wrongly skip (no card passes on a real AI sentence)
//   - expected cards kept on positives (the gate must not starve the generator)
//   - chips each saved run emitted that the gate would drop, split into
//     wrong chips on negatives (good) and right chips on positives (bad)
// plus the one-question "is this sentence about AI?" baseline, side by side.
//
// Ground truth is the golden set only. On positives, a retrieved card outside
// the expected Card IDs is unlabelled (it may be the right sense but not load-
// bearing), so it is counted separately and never scored as right or wrong.

const fs = require('fs');
const path = require('path');
const { senseCheck, aiSentenceCheck, decide } = require('../explain/gate');
const { resolveModel } = require('../explain/providers/jev');
const { mapWithConcurrency, poolSize } = require('./pool');

const ROOT = path.join(__dirname, '..');
const THRESHOLDS = [0.2, 0.3, 0.5, 0.7, 0.8, 0.9];
const PRICE_PER_INPUT_TOKEN = 0.042 / 1e6; // docs.typesafe.ai/models, output free

function parseArgs(argv) {
  const opts = { runs: ['v1-flashlite', 'v8-pro'], label: null, model: null, dryRun: false };
  for (const arg of argv) {
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg.startsWith('--runs=')) opts.runs = arg.slice(7).split(',').filter(Boolean);
    else if (arg.startsWith('--label=')) opts.label = arg.slice(8);
    else if (arg.startsWith('--model=')) opts.model = arg.slice(8);
    else throw new Error(`gate-jev: unrecognised argument "${arg}"`);
  }
  return opts;
}

function shelfVersionDir() {
  const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'shelf', 'shelf-index.json'), 'utf8'));
  return path.join(__dirname, 'out', idx.version_id);
}

function loadShelf() {
  const cards = JSON.parse(fs.readFileSync(path.join(ROOT, 'shelf', 'shelf-export.json'), 'utf8'));
  return new Map(cards.map((c) => [c.id, c]));
}

function pct(n, d) { return d ? `${n}/${d} (${Math.round((100 * n) / d)}%)` : '0/0'; }
function quantile(xs, q) { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0; }

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const jevOpts = { model: opts.model || undefined, provider: opts.dryRun ? 'mock' : undefined };
  const outBase = shelfVersionDir();
  const shelf = loadShelf();

  const runs = opts.runs.map((name) => {
    const p = path.join(outBase, name, 'results.json');
    if (!fs.existsSync(p)) throw new Error(`gate-jev: no results.json for run "${name}" at ${p}`);
    return { name, rows: JSON.parse(fs.readFileSync(p, 'utf8')).rows };
  });

  // Retrieval comes from the first run. Every run on one shelf version shares
  // the index; if a later run retrieved differently, say so instead of hiding it.
  const base = runs[0].rows;
  for (const r of runs.slice(1)) {
    const diff = r.rows.filter((row, i) => JSON.stringify(row.retrieved.map((c) => c.id)) !== JSON.stringify(base[i].retrieved.map((c) => c.id)));
    if (diff.length) console.warn(`gate-jev: run ${r.name} retrieved differently from ${runs[0].name} on rows ${diff.map((d) => d.row).join(', ')}; using ${runs[0].name}'s retrieval`);
  }

  const started = Date.now();
  const rows = await mapWithConcurrency(base, poolSize('JEV_CONCURRENCY', 4), async (row) => {
    const cards = row.retrieved.map((c) => shelf.get(c.id)).filter(Boolean);
    const [checks, ai] = await Promise.all([senseCheck(row.sentence, cards, jevOpts), aiSentenceCheck(row.sentence, jevOpts)]);
    return {
      row: row.row,
      sentence: row.sentence,
      is_negative: row.is_negative,
      expected: row.expected.card_ids || [],
      checks,
      ai,
      chips: Object.fromEntries(runs.map((r) => {
        const rr = r.rows.find((x) => x.row === row.row);
        return [r.name, ((rr && rr.output && rr.output.terms) || []).map((t) => t.card_id)];
      })),
    };
  });

  const model = rows[0] && rows[0].ai.model;
  const calls = rows.flatMap((r) => [...r.checks, r.ai]);
  const inputTokens = calls.reduce((s, c) => s + ((c.usage && c.usage.input_tokens) || 0), 0);
  const rowMs = rows.map((r) => Math.max(r.ai.ms, ...r.checks.map((c) => c.ms)));

  const lines = [];
  const say = (s = '') => { lines.push(s); console.log(s); };
  say(`# Jev sense gate — ${opts.dryRun ? 'DRY RUN (mock probabilities, numbers mean nothing)' : model}`);
  say(`Retrieval from ${runs[0].name}; chips from ${runs.map((r) => r.name).join(', ')}. ${rows.length} rows, ${calls.length} Jev calls.`);
  say(`Input tokens ${inputTokens} → $${(inputTokens * PRICE_PER_INPUT_TOKEN).toFixed(5)} for the run, $${((inputTokens * PRICE_PER_INPUT_TOKEN) / rows.length).toFixed(6)} per decode.`);
  say(`Per-decode gate latency (cards in parallel): p50 ${quantile(rowMs, 0.5)} ms, p95 ${quantile(rowMs, 0.95)} ms. Wall clock ${Date.now() - started} ms.`);
  say();

  const neg = rows.filter((r) => r.is_negative);
  const pos = rows.filter((r) => !r.is_negative);

  say('## Per-card sense gate, by threshold');
  say();
  const header = ['threshold', 'negatives skipped', 'positives wrongly skipped', 'expected cards kept', 'unlabelled cards kept',
    ...runs.flatMap((r) => [`${r.name}: wrong chips dropped (neg)`, `${r.name}: right chips dropped (pos)`])];
  say(`| ${header.join(' | ')} |`);
  say(`|${header.map(() => '---').join('|')}|`);
  for (const t of THRESHOLDS) {
    const negSkipped = neg.filter((r) => decide(r.checks, t).skip);
    const posSkipped = pos.filter((r) => decide(r.checks, t).skip);
    let expRetrieved = 0, expKept = 0, otherRetrieved = 0, otherKept = 0;
    for (const r of pos) {
      for (const c of r.checks) {
        const kept = c.p !== null && c.p >= t;
        if (r.expected.includes(c.id)) { expRetrieved++; if (kept) expKept++; }
        else { otherRetrieved++; if (kept) otherKept++; }
      }
    }
    const chipCols = runs.flatMap((run) => {
      let negChips = 0, negDropped = 0, posRight = 0, posRightDropped = 0;
      for (const r of rows) {
        const keep = new Set(decide(r.checks, t).keep);
        for (const id of r.chips[run.name]) {
          if (r.is_negative) { negChips++; if (!keep.has(id)) negDropped++; }
          else if (r.expected.includes(id)) { posRight++; if (!keep.has(id)) posRightDropped++; }
        }
      }
      return [pct(negDropped, negChips), pct(posRightDropped, posRight)];
    });
    say(`| ${t} | ${pct(negSkipped.length, neg.length)} | ${pct(posSkipped.length, pos.length)}${posSkipped.length ? ` rows ${posSkipped.map((r) => r.row).join(',')}` : ''} | ${pct(expKept, expRetrieved)} | ${pct(otherKept, otherRetrieved)} | ${chipCols.join(' | ')} |`);
  }
  say();

  say('## Baseline: one "is this sentence about AI?" question');
  say();
  say('| threshold | negatives flagged not-AI | positives wrongly flagged not-AI |');
  say('|---|---|---|');
  for (const t of THRESHOLDS) {
    const n = neg.filter((r) => r.ai.p !== null && r.ai.p < t);
    const p = pos.filter((r) => r.ai.p !== null && r.ai.p < t);
    say(`| ${t} | ${pct(n.length, neg.length)} | ${pct(p.length, pos.length)}${p.length ? ` rows ${p.map((r) => r.row).join(',')}` : ''} |`);
  }
  say();

  say('## Negatives, row by row (p = probability the card is used in its glossary sense)');
  say();
  for (const r of neg) {
    say(`- row ${r.row}: ai=${r.ai.p === null ? '?' : r.ai.p.toFixed(2)} · ${r.checks.map((c) => `${c.id} ${c.p === null ? '?' : c.p.toFixed(2)}`).join(', ') || '(no cards retrieved)'}`);
    say(`  "${r.sentence.slice(0, 110)}${r.sentence.length > 110 ? '…' : ''}"`);
  }
  say();
  say('## Expected cards on positives that scored below 0.5');
  say();
  const misses = pos.flatMap((r) => r.checks.filter((c) => r.expected.includes(c.id) && c.p !== null && c.p < 0.5).map((c) => ({ row: r.row, id: c.id, p: c.p, sentence: r.sentence })));
  if (!misses.length) say('None.');
  for (const m of misses) say(`- row ${m.row}: ${m.id} ${m.p.toFixed(2)} — "${m.sentence.slice(0, 100)}…"`);

  const label = opts.label || (opts.dryRun ? 'gate-jev-dry' : `gate-jev-${String(model).replace(/[^a-z0-9.-]/gi, '')}`);
  const dir = path.join(outBase, label);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'gate-results.json'), JSON.stringify({
    model, dry_run: opts.dryRun, retrieval_from: runs[0].name, chips_from: runs.map((r) => r.name),
    generated_at: new Date().toISOString(), input_tokens: inputTokens, rows,
  }, null, 2));
  fs.writeFileSync(path.join(dir, 'report.md'), lines.join('\n') + '\n');
  console.log(`\nSaved ${path.relative(ROOT, dir)}/gate-results.json and report.md`);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
