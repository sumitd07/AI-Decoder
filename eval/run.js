#!/usr/bin/env node
'use strict';
// Runs the 39 golden-set sentences through the "Explain This" pipeline and
// saves raw outputs (CONTRACT.md / Explain-This-Technical.md wiring step 7).
// This file only calls the pipeline through explain/explain.js — the
// surface-agnostic wrapper — never retrieve.js/prompt.js/generate.js directly,
// so it stays correct regardless of how those modules are implemented inside.
//
//   node eval/run.js [--legs=semantic|lexical|both] [--label=NAME] [--dry-run]
//
// --dry-run forces the mock providers (no key, no network) so the harness is
// fully exercisable before any API key exists. shelf/shelf-index.json needs a
// real GEMINI_API_KEY to build (scripts/build-index.js, not this file's job),
// so --dry-run also skips it: it builds a throwaway in-memory index from
// shelf-export.json + mock embeddings instead of reading that file.
//
// If explain/explain.js is ever absent (it existed when this was last run,
// but the contract allows for a session where the orchestrator hasn't landed
// it yet), this file falls back to a local stub pipeline so the harness's own
// plumbing — CLI parsing, shelf version stamping, file layout — is still
// exercisable end to end. Every row and the run manifest is tagged
// `pipeline: 'stub'` so a stub run can never be mistaken for a scored one.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { loadGolden, assertCardIdsResolve } = require('./golden');
const { mapWithConcurrency, poolSize } = require('./pool');

function parseArgs(argv) {
  const opts = { legs: 'both', label: null, dryRun: false, indexPath: null };
  for (const arg of argv) {
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg.startsWith('--legs=')) opts.legs = arg.slice('--legs='.length);
    else if (arg.startsWith('--label=')) opts.label = arg.slice('--label='.length);
    else if (arg.startsWith('--index=')) opts.indexPath = arg.slice('--index='.length);
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else throw new Error(`run: unrecognised argument "${arg}"`);
  }
  if (!['semantic', 'lexical', 'both'].includes(opts.legs)) {
    throw new Error(`run: --legs must be semantic|lexical|both, got "${opts.legs}"`);
  }
  return opts;
}

function timestampLabel() {
  return `run-${new Date().toISOString().replace(/[:.]/g, '-')}`;
}

// require() that returns null on "module not found" instead of throwing, so a
// not-yet-landed file degrades this harness instead of crashing it. Any other
// error (a real bug in a file that DOES exist) still throws.
function tryRequire(absPath) {
  try {
    return require(absPath);
  } catch (err) {
    if (err && err.code === 'MODULE_NOT_FOUND') return null;
    throw err;
  }
}

// Record which shelf version produced any eval score (Explain-This-Technical.md
// is explicit: scores across shelf versions aren't comparable). Prefer the
// built index — it's the thing retrieval actually runs against — and fall back
// to the export's meta file, which exists earlier in the build and is all
// that's on disk before scripts/build-index.js has ever run with a real key.
function resolveShelfVersion() {
  const indexPath = path.join(ROOT, 'shelf', 'shelf-index.json');
  const metaPath = path.join(ROOT, 'shelf', 'shelf-export.meta.json');
  if (fs.existsSync(indexPath)) {
    const idx = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    if (idx.version_id) return { version_id: idx.version_id, source: 'shelf/shelf-index.json' };
  }
  if (fs.existsSync(metaPath)) {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    if (meta.version_id) return { version_id: meta.version_id, source: 'shelf/shelf-export.meta.json' };
  }
  throw new Error('run: no shelf version_id found in shelf-index.json or shelf-export.meta.json — run scripts/export-shelf.js first');
}

// Inert stand-in for explain/explain.js. Returns a structurally valid but
// empty output contract so run.js's file-writing and CLI plumbing can be
// exercised with nothing to grade. NOT a retrieval or generation strategy —
// every field here is a placeholder, never a score.
async function stubExplain(_sentence, _opts) {
  return {
    restatement: '',
    terms: [],
    gaps: [],
    _debug: {
      retrieved: [],
      legOutput: { semantic: [], lexical: [] },
      retrieval: {},
      model: 'stub',
      embed_model: 'stub',
      usage: { input_tokens: 0, output_tokens: 0 },
      notes: ['stub_pipeline'],
      error: null,
      shelf_version: null,
      ms: 0,
    },
  };
}

// --dry-run builds a throwaway in-memory index so explain() never touches
// shelf/shelf-index.json (which needs a real key to exist) or the network.
// Mirrors exactly what scripts/build-index.js will do, minus persistence:
// embed each card's `embedText` and hand the vectors to buildIndex().
async function buildMockIndex(version_id) {
  const shelfExportPath = path.join(ROOT, 'shelf', 'shelf-export.json');
  const cards = JSON.parse(fs.readFileSync(shelfExportPath, 'utf8'));
  const { buildIndex, embedText } = require(path.join(ROOT, 'explain', 'index.js'));
  const { embed, TASK_DOCUMENT } = require(path.join(ROOT, 'explain', 'providers', 'embeddings.js'));
  const texts = cards.map((c) => embedText(c));
  const { vectors, model } = await embed(texts, { provider: 'mock', taskType: TASK_DOCUMENT });
  return buildIndex(cards, { vectors, version_id, embed_model: model, embed_task_type: TASK_DOCUMENT });
}

async function prepareRun(opts, version_id) {
  const explainPath = path.join(ROOT, 'explain', 'explain.js');
  const explainMod = tryRequire(explainPath);

  if (!explainMod || typeof explainMod.explain !== 'function') {
    return { explainFn: stubExplain, pipeline: 'stub', extraOpts: {} };
  }

  if (opts.dryRun) {
    const index = await buildMockIndex(version_id);
    return { explainFn: explainMod.explain, pipeline: 'explain.js', extraOpts: { index } };
  }

  // --index=<path> runs against an index other than the default. The reason it
  // exists: a vectors-free index makes a lexical-only run possible when no
  // embedding index has been built (or the day's embed quota is gone), which is
  // exactly the D15 attribution baseline. Anything scored this way is a lexical
  // number and must be labelled as one — the semantic leg simply cannot fire.
  if (opts.indexPath) {
    const { loadIndex } = require(path.join(ROOT, 'explain', 'index.js'));
    const index = loadIndex(opts.indexPath);
    if (!index.vectors || !index.vectors.length) {
      console.warn('run: index has NO vectors — the semantic leg cannot run. This is a lexical-only run.');
    }
    return { explainFn: explainMod.explain, pipeline: 'explain.js', extraOpts: { index } };
  }

  // Non-dry-run, no pre-loaded index: explain.js's own getIndex() loads and
  // caches shelf/shelf-index.json on first call. If that file doesn't exist
  // yet (no key has ever built it), every row will fail with a clear error
  // from inside retrieve() — caught per-row below, not fatal to the run.
  return { explainFn: explainMod.explain, pipeline: 'explain.js', extraOpts: {} };
}

async function runRow(explainFn, row, opts, extraOpts) {
  const started = Date.now();
  try {
    const result = await explainFn(row.sentence, { legs: opts.legs, ...extraOpts });
    const debug = result._debug || {};
    return {
      row: row.row,
      sentence: row.sentence,
      is_negative: row.is_negative,
      expected: {
        associated_cards: row.associated_cards,
        explanation: row.explanation,
        card_ids: row.card_ids,
      },
      retrieved: debug.retrieved || [],
      legOutput: debug.legOutput || { semantic: [], lexical: [] },
      retrieval_meta: debug.retrieval || {},
      output: {
        restatement: result.restatement || '',
        terms: result.terms || [],
        gaps: result.gaps || [],
      },
      model: debug.model || null,
      embed_model: debug.embed_model || null,
      usage: debug.usage || { input_tokens: 0, output_tokens: 0 },
      notes: debug.notes || [],
      raw: debug.raw || null,   // verbatim reply; a parse failure is undiagnosable without it
      shelf_version: debug.shelf_version || null,
      latency_ms: debug.ms != null ? debug.ms : Date.now() - started,
      error: debug.error || null,
    };
  } catch (err) {
    // A per-row failure (e.g. a missing index) shouldn't take down the other
    // 38 rows — record it and keep going, so a partial run is still useful.
    return {
      row: row.row,
      sentence: row.sentence,
      is_negative: row.is_negative,
      expected: {
        associated_cards: row.associated_cards,
        explanation: row.explanation,
        card_ids: row.card_ids,
      },
      retrieved: [],
      legOutput: { semantic: [], lexical: [] },
      retrieval_meta: {},
      output: { restatement: '', terms: [], gaps: [] },
      model: null,
      embed_model: null,
      usage: { input_tokens: 0, output_tokens: 0 },
      notes: [],
      shelf_version: null,
      latency_ms: Date.now() - started,
      error: String((err && err.message) || err),
    };
  }
}

async function main(argv) {
  const opts = parseArgs(argv);
  if (opts.help) {
    console.log('node eval/run.js [--legs=semantic|lexical|both] [--label=NAME] [--dry-run]');
    return;
  }

  if (opts.dryRun) {
    // Force mock, no matter what the environment already has set — --dry-run
    // is the "definitely no network" promise.
    process.env.LLM_PROVIDER = 'mock';
    process.env.EMBED_PROVIDER = 'mock';
  }

  const rows = loadGolden();
  assertCardIdsResolve(rows);

  const { version_id, source: version_source } = resolveShelfVersion();
  const { explainFn, pipeline, extraOpts } = await prepareRun(opts, version_id);
  const label = opts.label || timestampLabel();

  if (pipeline === 'stub') {
    console.warn('run: explain/explain.js not found or not exporting explain() — running the STUB pipeline.');
    console.warn('run: every row will carry pipeline: "stub" and empty output. This exercises the harness, not the product.');
  }

  // Providers are already written (explain/providers/*.js); report what they're
  // configured to even when the pipeline itself is stubbed, since that's still
  // useful to know ahead of a real run.
  const llmMod = tryRequire(path.join(ROOT, 'explain', 'providers', 'llm.js'));
  const embedMod = tryRequire(path.join(ROOT, 'explain', 'providers', 'embeddings.js'));
  const llmInfo = llmMod ? llmMod.providerInfo() : null;
  const embedInfo = embedMod ? embedMod.providerInfo() : null;

  console.log(`run: shelf ${version_id} (from ${version_source})`);
  console.log(`run: pipeline=${pipeline} legs=${opts.legs} dry_run=${opts.dryRun} label=${label}`);
  if (llmInfo) console.log(`run: llm provider=${llmInfo.provider} model=${llmInfo.model} configured=${llmInfo.configured}`);
  if (embedInfo) console.log(`run: embed provider=${embedInfo.provider} model=${embedInfo.model} configured=${embedInfo.configured}`);

  const started = Date.now();
  // Rows are independent. Running them concurrently and reordering on return keeps
  // the saved file byte-comparable between runs while cutting wall clock ~6x.
  let versionMismatchWarned = false;
  const pool = poolSize('EVAL_CONCURRENCY');
  let done = 0;
  const results = await mapWithConcurrency(rows, pool, async (row) => {
    const r = await runRow(explainFn, row, opts, extraOpts);
    if (!versionMismatchWarned && r.shelf_version && r.shelf_version !== version_id) {
      console.warn(`\nrun: WARNING — explain()'s index reports shelf_version "${r.shelf_version}" but this run is stamped "${version_id}" (from ${version_source}). The two disagree; scores will be stamped with the resolved version, but check which index is actually loaded.`);
      versionMismatchWarned = true;
    }
    process.stdout.write(`\r  ${++done}/${rows.length}`);
    return r;
  });
  process.stdout.write('\r');
  const elapsed_ms = Date.now() - started;

  const errored = results.filter((r) => r.error).length;
  console.log(`run: ${results.length} rows in ${elapsed_ms}ms (${errored} errored)`);

  const outDir = path.join(ROOT, 'eval', 'out', version_id, label);
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'results.json');

  const manifest = {
    shelf_version_id: version_id,
    shelf_version_source: version_source,
    run_label: label,
    legs: opts.legs,
    dry_run: opts.dryRun,
    pipeline,
    generated_at: new Date().toISOString(),
    llm: llmInfo,
    embed: embedInfo,
    row_count: results.length,
    errored_count: errored,
    elapsed_ms,
    rows: results,
  };

  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2));
  console.log(`run: wrote ${path.relative(ROOT, outPath)}`);
  return manifest;
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err.stack || String(err));
    process.exit(1);
  });
}

module.exports = { main, parseArgs, resolveShelfVersion, prepareRun, stubExplain, runRow, buildMockIndex };
