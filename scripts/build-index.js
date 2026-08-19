#!/usr/bin/env node
// Builds the retrieval index from the shelf export.
//   node scripts/build-index.js                    (real embeddings, needs GEMINI_API_KEY)
//   node scripts/build-index.js --allow-mock       (mock vectors, for wiring only)
//   node scripts/build-index.js --out /tmp/x.json
//
// The shelf grows, so this is a rebuild path. The index carries the shelf's
// version_id: a retrieval score is only comparable to another score from the
// same shelf version, and the stamp is what makes that checkable.

const fs = require('fs');
const path = require('path');
const { buildIndex, embedText } = require('../explain/index');
const { embed, providerInfo, TASK_DOCUMENT } = require('../explain/providers/embeddings');

const ROOT = path.join(__dirname, '..');
const DEFAULT_OUT = path.join(ROOT, 'shelf', 'shelf-index.json');

// Accepts both `--out=path` and `--out path`; a bare `--flag` returns true.
function arg(name) {
  const i = process.argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i < 0) return null;
  const hit = process.argv[i];
  if (hit.includes('=')) return hit.split('=').slice(1).join('=');
  const next = process.argv[i + 1];
  return next && !next.startsWith('--') ? next : true;
}

(async function main() {
  const allowMock = Boolean(arg('allow-mock'));
  const out = typeof arg('out') === 'string' ? arg('out') : DEFAULT_OUT;

  const cards = JSON.parse(fs.readFileSync(path.join(ROOT, 'shelf', 'shelf-export.json'), 'utf8'));
  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'shelf', 'shelf-export.meta.json'), 'utf8'));
  const info = providerInfo({});

  // A mock index is indistinguishable from a real one once it's on disk, and a
  // retrieval score read off mock vectors is meaningless. Refuse the default
  // path unless someone says out loud that they meant it.
  if (info.provider === 'mock' && !allowMock) {
    console.error('build-index: EMBED_PROVIDER is "mock". Mock vectors are not retrieval —');
    console.error('  set GEMINI_API_KEY for a real index, or pass --allow-mock to build one anyway.');
    process.exit(1);
  }
  if (info.provider === 'mock' && out === DEFAULT_OUT) {
    console.error('build-index: refusing to write a mock index to the default path.');
    console.error(`  pass --out /tmp/mock-index.json if you want one.`);
    process.exit(1);
  }
  if (!info.configured) {
    console.error(`build-index: provider "${info.provider}" has no API key set (GEMINI_API_KEY).`);
    process.exit(1);
  }
  if (info.provider === 'mock') {
    console.warn('!! MOCK EMBEDDINGS — this index exercises the wiring and nothing else.');
    console.warn('!! Any retrieval number taken from it is noise. Do not score against it.');
  }

  console.log(`embedding ${cards.length} cards with ${info.provider}/${info.model} @ ${info.dims} dims (${TASK_DOCUMENT})`);
  const texts = cards.map(embedText);          // title + definition, D14
  // The free tier allows 100 embed requests a minute, and batchEmbedContents
  // bills one request per card, not one per batch. So the batch size IS the
  // per-minute budget, and we wait out the window between batches rather than
  // leaning on the provider's retry — a 429 storm wastes quota that then isn't
  // there for the eval run.
  const rpm = Number(arg('rpm')) || 100;
  const paceMs = arg('pace') ? (Number(arg('pace')) || 62) * 1000 : 0;
  const batch = Math.min(rpm, 100);

  // 1010 cards at 100 requests a minute is eleven minutes of wall clock, and a
  // single 429 partway through used to throw all of it away. Vectors are
  // checkpointed after every batch and picked back up on the next run, so a
  // quota stall costs one batch, not the whole build.
  const ckptPath = out + '.partial.json';
  let vectors = [];
  if (fs.existsSync(ckptPath) && !arg('fresh')) {
    const ck = JSON.parse(fs.readFileSync(ckptPath, 'utf8'));
    if (ck.model === info.model && ck.count === cards.length && ck.dims === info.dims) {
      vectors = ck.vectors;
      console.log(`resuming: ${vectors.length}/${texts.length} already embedded`);
    } else {
      console.log('checkpoint is for a different model, dimension or shelf size — starting fresh');
    }
  }

  let model = info.model;
  while (vectors.length < texts.length) {
    const i = vectors.length;
    const slice = texts.slice(i, i + batch);
    try {
      const res = await embed(slice, { taskType: TASK_DOCUMENT });
      vectors.push(...res.vectors);
      model = res.model;
      fs.mkdirSync(path.dirname(ckptPath), { recursive: true });
      fs.writeFileSync(ckptPath, JSON.stringify({ model: info.model, dims: info.dims, count: cards.length, vectors }));
      console.log(`  ${vectors.length}/${texts.length}`);
    } catch (e) {
      // The provider tells us how long to wait; obey it rather than guessing.
      const m = /retry in ([\d.]+)s/i.exec(e.message || '');
      const wait = m ? Math.ceil(Number(m[1])) + 2 : 65;
      if (!/quota|rate|429/i.test(e.message || '')) throw e;
      console.log(`  quota hit at ${vectors.length}/${texts.length} — waiting ${wait}s`);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    // No pre-emptive waiting. The retry path below already backs off exactly as
    // long as the provider asks when a 429 actually arrives, so pacing every
    // batch on the off-chance just burns wall clock on a paid key that has no
    // per-minute problem. Free tier still works — it simply pays the 429 once
    // per window instead of guessing ahead of it.
    // Pass --pace to restore fixed spacing if a key ever needs it.
    if (paceMs && vectors.length < texts.length && info.provider !== 'mock') {
      console.log(`  pacing ${Math.round(paceMs / 1000)}s`);
      await new Promise((r) => setTimeout(r, paceMs));
    }
  }

  const index = buildIndex(cards, {
    vectors,
    version_id: meta.version_id,
    embed_model: model,
    embed_task_type: TASK_DOCUMENT,
  });
  index.built_at = new Date().toISOString();
  index.mock = info.provider === 'mock' || undefined;

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(index));
  if (fs.existsSync(ckptPath)) fs.unlinkSync(ckptPath);
  const mb = (fs.statSync(out).size / 1024 / 1024).toFixed(1);
  console.log(`wrote ${index.cards.length} cards, ${index.dims}-dim vectors, ${Object.keys(index.alias_map).length} lexical surfaces → ${out} (${mb} MB)`);
  console.log(`  shelf version ${index.version_id}${index.mock ? '  [MOCK VECTORS]' : ''}`);
})().catch((e) => { console.error(e.message || e); process.exit(1); });
