#!/usr/bin/env node
'use strict';
// Offline eval for the Jev claim check (explain/claimcheck.js). No generator
// calls: it reuses saved runs (outputs + judge scores), asks Jev about each
// sentence of each restatement, and compares Jev's flags with the judge's
// ungrounded_claim verdicts.
//
//   node --env-file=.env eval/claims-jev.js [--runs=v9-flashlite-jevgate,v1-flashlite,v10-pro-jevgate] [--model=] [--gaps-only] [--dry-run]
//
// Per threshold: judged-invented rows Jev catches, and judged-clean rows Jev
// flags. A clean-row flag is not automatically wrong (the judge also misses
// things), so every flagged claim is listed for a human read.

const fs = require('fs');
const path = require('path');
const { checkClaims, checkGaps, flagged, definedGaps } = require('../explain/claimcheck');
const { mapWithConcurrency, poolSize } = require('./pool');

const ROOT = path.join(__dirname, '..');
const THRESHOLDS = [0.2, 0.3, 0.4, 0.5, 0.6];
const PRICE_PER_INPUT_TOKEN = 0.042 / 1e6;

function parseArgs(argv) {
  const o = { runs: ['v9-flashlite-jevgate', 'v1-flashlite', 'v10-pro-jevgate'], model: null, dryRun: false, gapsOnly: false };
  for (const a of argv) {
    if (a === '--dry-run') o.dryRun = true;
    else if (a === '--gaps-only') o.gapsOnly = true;
    else if (a.startsWith('--runs=')) o.runs = a.slice(7).split(',').filter(Boolean);
    else if (a.startsWith('--model=')) o.model = a.slice(8);
    else throw new Error(`claims-jev: unrecognised argument "${a}"`);
  }
  return o;
}

function pct(n, d) { return d ? `${n}/${d}` : '0/0'; }

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const jevOpts = { model: opts.model || undefined, provider: opts.dryRun ? 'mock' : undefined };
  const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'shelf', 'shelf-index.json'), 'utf8'));
  const outBase = path.join(__dirname, 'out', idx.version_id);
  const shelf = new Map(JSON.parse(fs.readFileSync(path.join(ROOT, 'shelf', 'shelf-export.json'), 'utf8')).map((c) => [c.id, c]));

  const lines = [];
  const say = (s = '') => { lines.push(s); console.log(s); };
  const all = [];
  let inputTokens = 0;
  const started = Date.now();

  for (const run of opts.runs) {
    const rows = JSON.parse(fs.readFileSync(path.join(outBase, run, 'results.json'), 'utf8')).rows;
    const judged = JSON.parse(fs.readFileSync(path.join(outBase, run, 'explanation-scores.json'), 'utf8')).per_row;
    const bad = new Set(judged.filter((j) => j.scores && j.scores.ungrounded_claim).map((j) => j.row));
    const detail = new Map(judged.map((j) => [j.row, j.scores && j.scores.ungrounded_claim_detail]));

    const checked = await mapWithConcurrency(rows, poolSize('JEV_CONCURRENCY', 4), async (row) => {
      const out = row.output || {};
      if (!out.restatement || (row.notes || []).includes('gate_skip')) return { row: row.row, skipped: true };
      // The cards the generator was actually given: the gate's keep list when a gate ran.
      const ids = row.gate && Array.isArray(row.gate.keep) ? row.gate.keep : row.retrieved.map((c) => c.id);
      const cards = ids.map((id) => shelf.get(id)).filter(Boolean);
      const [checks, gapChecks] = await Promise.all([
        opts.gapsOnly ? Promise.resolve([]) : checkClaims(row.sentence, out, cards, jevOpts),
        checkGaps(out, jevOpts),
      ]);
      return { row: row.row, sentence: row.sentence, restatement: out.restatement, gaps: out.gaps || [], checks, gapChecks,
        judged_bad: bad.has(row.row), judge_detail: detail.get(row.row) || '' };
    });
    const live = checked.filter((r) => !r.skipped);
    for (const r of live) for (const c of [...r.checks, ...r.gapChecks]) inputTokens += (c.usage && c.usage.input_tokens) || 0;
    all.push({ run, rows: checked });

    say(`## ${run}`);
    say(`Judge flagged rows: ${[...bad].join(', ') || 'none'}. Checked ${live.length} restatements (${checked.length - live.length} gate-skipped or empty).`);
    say();
    say('| threshold | invented rows caught | clean rows flagged |');
    say('|---|---|---|');
    for (const t of THRESHOLDS) {
      const caught = live.filter((r) => r.judged_bad && flagged(r.checks, t).length);
      const falseFlags = live.filter((r) => !r.judged_bad && flagged(r.checks, t).length);
      say(`| ${t} | ${pct(caught.length, live.filter((r) => r.judged_bad).length)}${caught.length ? ` (rows ${caught.map((r) => r.row).join(',')})` : ''} | ${pct(falseFlags.length, live.filter((r) => !r.judged_bad).length)}${falseFlags.length ? ` (rows ${falseFlags.map((r) => r.row).join(',')})` : ''} |`);
    }
    say();
    say('### Gap check: explanation defines a term it listed as a gap');
    say();
    say('| threshold | invented rows caught | clean rows flagged |');
    say('|---|---|---|');
    for (const t of [0.5, 0.6, 0.7, 0.8, 0.9]) {
      const hit = (r) => definedGaps(r.gapChecks, t).length > 0;
      const caught = live.filter((r) => r.judged_bad && hit(r));
      const ff = live.filter((r) => !r.judged_bad && hit(r));
      say(`| ${t} | ${pct(caught.length, live.filter((r) => r.judged_bad).length)}${caught.length ? ` (rows ${caught.map((r) => r.row).join(',')})` : ''} | ${pct(ff.length, live.filter((r) => !r.judged_bad).length)}${ff.length ? ` (rows ${ff.map((r) => r.row).join(',')})` : ''} |`);
    }
    say();
    for (const r of live.filter((x) => x.gapChecks.length)) {
      say(`- row ${r.row}${r.judged_bad ? ' **[judge: invented]**' : ''}: ${r.gapChecks.map((g) => `"${g.term}" ${g.p === null ? '?' : g.p.toFixed(2)}`).join(', ')}`);
    }
    say();
    if (opts.gapsOnly) continue;
    say('### Lowest-scoring claim per row (p = probability the claim is supported)');
    say();
    for (const r of live.sort((a, b) => Math.min(...a.checks.map((c) => c.p ?? 1)) - Math.min(...b.checks.map((c) => c.p ?? 1)))) {
      const low = r.checks.reduce((m, c) => ((c.p ?? 1) < (m.p ?? 1) ? c : m), r.checks[0]);
      say(`- row ${r.row}${r.judged_bad ? ' **[judge: invented]**' : ''}: p=${low.p === null ? '?' : low.p.toFixed(2)} "${low.claim}"`);
      if (r.judged_bad) say(`  judge: ${r.judge_detail}`);
    }
    say();
  }

  const callMs = all.flatMap((a) => a.rows.filter((r) => !r.skipped).map((r) => Math.max(0, ...[...r.checks, ...r.gapChecks].map((c) => c.ms))));
  callMs.sort((a, b) => a - b);
  say(`Jev input tokens ${inputTokens} → $${(inputTokens * PRICE_PER_INPUT_TOKEN).toFixed(5)}. Per-answer check latency (claims in parallel): p50 ${callMs[Math.floor(callMs.length / 2)] || 0} ms, p95 ${callMs[Math.floor(callMs.length * 0.95)] || 0} ms. Wall ${Date.now() - started} ms.`);

  const label = (opts.dryRun ? 'claims-jev-dry' : 'claims-jev') + (opts.gapsOnly ? '-gaps' : '');
  const dir = path.join(outBase, label);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'claims-results.json'), JSON.stringify({ dry_run: opts.dryRun, generated_at: new Date().toISOString(), runs: all }, null, 2));
  fs.writeFileSync(path.join(dir, 'report.md'), lines.join('\n') + '\n');
  console.log(`\nSaved ${path.relative(ROOT, dir)}/claims-results.json and report.md`);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
