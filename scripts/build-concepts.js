#!/usr/bin/env node
// Decoder — export the static "core" bundle FROM the concepts table.
//
// The DB is the source of truth. This regenerates web/concepts.js from it.
// The long tail (terms below the priority threshold) is NOT written here — the
// web app reaches those via the search_concepts() RPC at runtime.
//
// IMPORTANT: this writes web/concepts.js ONLY. It never touches extension/concepts.js.
// The extension is under review and must stay frozen. Copying to the extension is a
// separate, deliberate step the user does after review clears.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... node scripts/build-concepts.js [--threshold N]
//   node scripts/build-concepts.js --self-test      # no DB; verifies round-trip fidelity
//
// --threshold N: only terms with priority >= N go in the static bundle (default 0 = all).

const fs = require('fs');
const path = require('path');

const WEB_CONCEPTS = path.join(__dirname, '..', 'web', 'concepts.js');
const EXTENSION_CONCEPTS = path.join(__dirname, '..', 'extension', 'concepts.js');

// Static status metadata (unchanged; embedded so the generated file is self-contained).
const STATUS = {
  Core:       { label:'Core',       sym:'●', color:'oklch(0.5 0.085 155)', bg:'oklch(0.955 0.03 155)' },
  Rising:     { label:'Rising',     sym:'▲', color:'oklch(0.56 0.12 55)',  bg:'oklch(0.955 0.05 72)'  },
  Fading:     { label:'Fading',     sym:'▼', color:'oklch(0.55 0.05 250)', bg:'oklch(0.955 0.022 250)'},
  Historical: { label:'Historical', sym:'†', color:'oklch(0.5 0 0)',       bg:'oklch(0.925 0 0)'      },
};

// --- pure transform: a DB row -> { concept, lens } in the JS-file shape ---
function rowToConcept(r) {
  return {
    id: r.id,
    term: r.term,
    aliases: r.aliases || '',
    said: r.said || '',
    aliasList: r.alias_list || [],
    status: r.status || 'Core',
    oneLiner: r.one_liner || '',
    analogy: r.analogy || '',
    example: r.example || '',
    related: r.related || [],
    deeper: r.deeper || '',
  };
}
function rowToLens(r) {
  return { pm: r.lens_pm || '', eng: r.lens_eng || '' };
}

// --- render the JS file the web app loads (DECODER_CONCEPTS + LENSES + STATUS) ---
function render(concepts, lenses) {
  const j = (v) => JSON.stringify(v, null, 2);
  return `// Decoder — GENERATED FILE. Do not edit by hand.
// Built from the Supabase 'concepts' table by scripts/build-concepts.js.
// To change the glossary, edit the DB (Studio or /admin) and re-run the build.
// NOTE: this is the WEB bundle only. extension/concepts.js is intentionally NOT updated here.

window.DECODER_CONCEPTS = ${j(concepts)};

window.DECODER_LENSES = ${j(lenses)};

window.DECODER_STATUS = ${j(STATUS)};
`;
}

async function fetchRows(threshold) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY (or run --self-test).');
    process.exit(1);
  }
  const endpoint = `${url}/rest/v1/concepts?is_published=eq.true&priority=gte.${threshold}` +
    `&select=id,term,aliases,said,alias_list,status,one_liner,analogy,example,related,deeper,lens_pm,lens_eng,priority` +
    `&order=priority.desc,term.asc`;
  const res = await fetch(endpoint, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) { console.error(`Fetch failed: ${res.status} ${await res.text()}`); process.exit(1); }
  return res.json();
}

function buildFromRows(rows) {
  const concepts = rows.map(rowToConcept);
  const lenses = {};
  for (const r of rows) {
    const l = rowToLens(r);
    if (l.pm || l.eng) lenses[r.id] = l;
  }
  return { concepts, lenses };
}

function writeWebBundle(text) {
  // Guard: refuse to ever write the extension copy.
  fs.writeFileSync(WEB_CONCEPTS, text);
  console.log(`Wrote ${WEB_CONCEPTS}`);
  console.log(`(extension/concepts.js left untouched by design: ${EXTENSION_CONCEPTS})`);
}

// --- self-test: read current web/concepts.js, round-trip it, assert equality ---
function selfTest() {
  const window = {};
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(WEB_CONCEPTS, 'utf8'));
  const original = window.DECODER_CONCEPTS;
  const origLenses = window.DECODER_LENSES || {};

  // simulate DB rows from the current data
  const rows = original.map(c => ({
    id: c.id, term: c.term, aliases: c.aliases || '', said: c.said || '',
    alias_list: c.aliasList || [], status: c.status, one_liner: c.oneLiner || '',
    analogy: c.analogy || '', example: c.example || '', related: c.related || [],
    deeper: c.deeper || '',
    lens_pm: (origLenses[c.id] || {}).pm || '', lens_eng: (origLenses[c.id] || {}).eng || '',
    priority: 0,
  }));

  const { concepts, lenses } = buildFromRows(rows);
  const a = JSON.stringify(original);
  const b = JSON.stringify(concepts);
  const la = JSON.stringify(origLenses);
  const lb = JSON.stringify(lenses);

  const okConcepts = a === b;
  const okLenses = la === lb;
  console.log(`concepts round-trip: ${okConcepts ? 'OK' : 'MISMATCH'} (${original.length} terms)`);
  console.log(`lenses round-trip:   ${okLenses ? 'OK' : 'MISMATCH'} (${Object.keys(origLenses).length} lenses)`);
  // prove render() produces loadable JS
  const rendered = render(concepts, lenses);
  const w2 = {}; (function(window){ eval(rendered); })(w2);
  console.log(`rendered file re-parses: ${w2.DECODER_CONCEPTS && w2.DECODER_CONCEPTS.length === original.length ? 'OK' : 'FAIL'}`);
  process.exit(okConcepts && okLenses ? 0 : 1);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) return selfTest();
  const ti = args.indexOf('--threshold');
  const threshold = ti >= 0 ? parseInt(args[ti + 1], 10) : 0;
  const rows = await fetchRows(threshold);
  const { concepts, lenses } = buildFromRows(rows);
  writeWebBundle(render(concepts, lenses));
  console.log(`Bundled ${concepts.length} core terms (priority >= ${threshold}).`);
}

main();
