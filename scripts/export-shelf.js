#!/usr/bin/env node
// Exports the Decoder shelf as the card set "Explain This" retrieves over.
//   node scripts/export-shelf.js
//
// Writes to shelf/:
//   shelf-export.json       — the card contract from Explain-This-Technical.md, nothing else
//   shelf-export.full.json  — same cards + the Decoder fields the contract has no slot for
//   shelf-export.meta.json  — counts, version stamp, and every merge this run made
//
// This is a rebuild path, not a one-time dump: the shelf grows, so re-run it and
// re-stamp any eval score with the version_id it prints (scores across shelf
// versions aren't comparable).

const vm = require('vm');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'shelf');

// ---------------------------------------------------------------------------
// Source config. Read from web/index.html so there's one place keys live.
// ---------------------------------------------------------------------------
function readWebConfig() {
  const html = fs.readFileSync(path.join(ROOT, 'web', 'index.html'), 'utf8');
  const url = html.match(/SUPABASE_URL:\s*"([^"]+)"/);
  const key = html.match(/SUPABASE_ANON_KEY:\s*"([^"]+)"/);
  return { url: url && url[1], key: key && key[1] };
}
const web = readWebConfig();
const SUPABASE_URL = process.env.SUPABASE_URL || web.url;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || web.key;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('No Supabase URL/key. Set SUPABASE_URL and SUPABASE_ANON_KEY.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Curated merges.
//
// The shelf carries the same concept twice in a few places — a legacy of the
// hand-written concepts.js and the later DB seed being written independently.
// Two cards for one concept is a retrieval bug: both match, both eat one of the
// five slots, and the grounding for a single claim splits across two sources.
// So duplicates collapse here rather than in the retriever.
//
// The lists are explicit, not a similarity heuristic, because normalized-title
// matching gets one pair badly wrong: "Human Eval" (asking people to rate
// outputs) and "HumanEval" (the 164-problem coding benchmark) are different
// concepts that collide on the string. Anything not listed below is kept as-is
// and reported as a collision warning — new duplicates surface loudly instead
// of being merged on a guess.
// ---------------------------------------------------------------------------

// concepts.js id  →  the DB card that already covers the concept.
// The concepts.js card is dropped; its aliases fold into the survivor so the
// lexical leg doesn't lose the surface forms.
const JS_INTO_DB = {
  tooluse: 'tool-use',
  llmjudge: 'llm-as-judge',
  agentmemory: 'agent-memory',
  computeruse: 'computer-use',
  vectordb: 'vectordatabase',
  genai: 'generativeai',
  diffusion: 'diffusionmodel',
  texttoimage: 'texttoimagegeneration',
  supervised: 'supervisedlearning',
  unsupervised: 'unsupervisedlearning',
  backprop: 'backpropagation',
  contextengineering: 'context-management',
  multiagent: 'multi-agent',
  guardrails: 'agent-guardrails',
  reasoningmodels: 'reasoningmodel',
  trainingdata: 'trainingset',
  multimodal: 'multimodalinput',
};

// Duplicate pairs inside the DB itself. [survivor, dropped].
// Survivor is the higher-priority row; where priority ties, the fuller card.
const DB_MERGE = [
  ['ai-safety', 'aisafety'],
  ['incontextlearning', 'incontext'],
  ['mixtureofexperts', 'moe'],
  ['red-teaming', 'redteaming'],
  ['semantic-search', 'semanticsearch'],
];

// Normalized titles that collide but are genuinely different concepts.
const KEEP_DISTINCT = new Set(['humaneval']);

// The DB `aliases` column is a display string, not a matcher field. It mostly
// holds real expansions worth having on the lexical leg ("BERT" → "Bidirectional
// Encoder Representations from Transformers"), separated by either a comma or a
// slash — but a few rows use it as a label instead. Those are dropped by id, so
// a label never reaches the lexical leg and fires as a false match.
const ALIAS_STRING_DROP = { vibecoding: ['obituary'] };

const splitAliasString = (id, s) =>
  String(s || '')
    .split(/[,/]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => !(ALIAS_STRING_DROP[id] || []).some((bad) => bad.toLowerCase() === x.toLowerCase()));

const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Minimal RFC 4180 parser — the golden set's first three columns are prose with
// commas in them, so splitting on commas doesn't work.
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------
async function fetchConcepts() {
  const rows = [];
  const page = 500;
  for (let offset = 0; ; offset += page) {
    const url = `${SUPABASE_URL}/rest/v1/concepts` +
      `?select=*&is_published=eq.true&order=id.asc&limit=${page}&offset=${offset}`;
    const res = await fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    const batch = await res.json();
    rows.push(...batch);
    if (batch.length < page) break;
  }
  return rows;
}

function loadConceptsJs() {
  const code = fs.readFileSync(path.join(ROOT, 'web', 'concepts.js'), 'utf8');
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx.window.DECODER_CONCEPTS || [];
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------
function cleanAliases(title, list) {
  const seen = new Set([norm(title)]);
  const out = [];
  for (const a of list) {
    const v = (a || '').trim();
    if (!v) continue;
    const n = norm(v);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(v);
  }
  return out;
}

(async function main() {
  const notes = { db_merges: [], js_merged: [], js_added: [], collisions: [], alias_overlaps: [], dropped_related: 0 };

  const db = await fetchConcepts();
  const js = loadConceptsJs();
  const byId = new Map(db.map((r) => [r.id, r]));

  // Extra aliases picked up from dropped cards, keyed by survivor id.
  const extraAliases = new Map();
  const addAliases = (survivorId, aliases) => {
    if (!extraAliases.has(survivorId)) extraAliases.set(survivorId, []);
    extraAliases.get(survivorId).push(...aliases);
  };

  // Dropped id → survivor id, so `related` pointers survive the merge.
  const redirect = new Map();

  // 1. Collapse DB-internal duplicates.
  for (const [keep, drop] of DB_MERGE) {
    if (!byId.has(keep) || !byId.has(drop)) {
      console.warn(`  ! DB_MERGE pair [${keep}, ${drop}] no longer resolves — skipped`);
      continue;
    }
    const dropped = byId.get(drop);
    addAliases(keep, [dropped.term, ...(dropped.alias_list || [])]);
    redirect.set(drop, keep);
    byId.delete(drop);
    notes.db_merges.push({ kept: keep, dropped: drop });
  }

  // 2. Fold concepts.js cards into their DB equivalents; keep the ones the DB lacks.
  const jsAdded = [];
  for (const c of js) {
    if (byId.has(c.id)) continue;                      // same id, DB wins
    if (redirect.has(c.id)) {                          // DB row of this id was merged away above
      addAliases(redirect.get(c.id), [c.term, ...(c.aliasList || [])]);
      notes.js_merged.push({ js_id: c.id, into: redirect.get(c.id) });
      continue;
    }
    const target = JS_INTO_DB[c.id];
    if (target) {
      const dest = redirect.get(target) || target;
      if (!byId.has(dest)) {
        console.warn(`  ! JS_INTO_DB target "${target}" for "${c.id}" is missing — keeping ${c.id}`);
      } else {
        addAliases(dest, [c.term, ...(c.aliasList || [])]);
        redirect.set(c.id, dest);
        notes.js_merged.push({ js_id: c.id, into: dest });
        continue;
      }
    }
    jsAdded.push(c);
    notes.js_added.push({ id: c.id, term: c.term });
  }

  // 3. Map both sources onto the card contract.
  const cards = [];

  for (const r of byId.values()) {
    const aliases = cleanAliases(r.term, [
      ...(r.alias_list || []),
      ...splitAliasString(r.id, r.aliases),
      ...(extraAliases.get(r.id) || []),
    ]);
    cards.push({
      id: r.id,
      title: r.term,
      aliases,
      definition: (r.one_liner || '').trim(),
      examples: [r.example, r.analogy].map((s) => (s || '').trim()).filter(Boolean),
      related: (r.related || []).map((x) => x && x.id).filter(Boolean),
      _extra: {
        analogy: (r.analogy || '').trim(),
        deeper: (r.deeper || '').trim(),
        status: r.status || '',
        domain: r.domain || '',
        tags: r.tags || [],
        lens_pm: r.lens_pm || '',
        lens_eng: r.lens_eng || '',
        said: r.said || '',
        source: 'supabase.concepts',
        updated_at: r.updated_at || '',
      },
    });
  }

  for (const c of jsAdded) {
    const aliases = cleanAliases(c.term, [
      ...(c.aliasList || []),
      ...splitAliasString(c.id, c.aliases),
      ...(extraAliases.get(c.id) || []),
    ]);
    cards.push({
      id: c.id,
      title: c.term,
      aliases,
      definition: (c.oneLiner || '').trim(),
      examples: [c.example, c.analogy].map((s) => (s || '').trim()).filter(Boolean),
      related: (c.related || []).map((x) => x && x.id).filter(Boolean),
      _extra: {
        analogy: (c.analogy || '').trim(),
        deeper: (c.deeper || '').trim(),
        status: c.status || '',
        domain: '',
        tags: [],
        lens_pm: '',
        lens_eng: '',
        said: c.said || '',
        source: 'web/concepts.js',
        updated_at: '',
      },
    });
  }

  cards.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // 4. Resolve `related`: follow merges, drop self-references and dead pointers.
  const live = new Set(cards.map((c) => c.id));
  for (const card of cards) {
    const out = [];
    const seen = new Set();
    for (const raw of card.related) {
      const id = redirect.get(raw) || raw;
      if (id === card.id || seen.has(id)) continue;
      if (!live.has(id)) { notes.dropped_related++; continue; }
      seen.add(id);
      out.push(id);
    }
    card.related = out;
  }

  // 5. Report any duplicate concept the curated lists don't cover.
  const byTitle = new Map();
  for (const c of cards) {
    const n = norm(c.title);
    if (!byTitle.has(n)) byTitle.set(n, []);
    byTitle.get(n).push(c.id);
  }
  for (const [n, ids] of byTitle) {
    if (ids.length > 1 && !KEEP_DISTINCT.has(n)) notes.collisions.push({ title: n, ids });
  }

  // 6. Report cards that share a surface form. Title-normalization only catches
  //    duplicates filed under the same name; two cards for one concept usually
  //    show up as a shared alias instead ("HyDE" / "Hypothetical Document
  //    Embeddings"). Reported, never merged — which of these is a duplicate and
  //    which is a real distinction is an editorial call on the shelf.
  const surfaces = new Map();
  for (const c of cards) {
    for (const s of [c.title, ...c.aliases]) {
      const n = norm(s);
      if (!n) continue;
      if (!surfaces.has(n)) surfaces.set(n, new Set());
      surfaces.get(n).add(c.id);
    }
  }
  for (const [n, set] of surfaces) {
    if (set.size > 1) notes.alias_overlaps.push({ surface: n, ids: [...set] });
  }

  // 7. Validate the contract.
  const errors = [];
  const seenIds = new Set();
  for (const c of cards) {
    if (seenIds.has(c.id)) errors.push(`duplicate id: ${c.id}`);
    seenIds.add(c.id);
    if (!c.id || !c.title) errors.push(`missing id/title: ${c.id}`);
    if (!c.definition) errors.push(`empty definition: ${c.id}`);
  }

  // 8. Cross-check the golden set, if it's here. Every card ID the eval expects
  //    has to exist in the export, or the eval is scoring against a corpus that
  //    can't contain the right answer. Cheap, so it runs every time.
  const goldenPath = process.env.GOLDEN_CSV || path.join(ROOT, 'eval', 'golden-set.csv');
  let golden = null;
  if (fs.existsSync(goldenPath)) {
    const live = new Set(cards.map((c) => c.id));
    const text = fs.readFileSync(goldenPath, 'utf8');
    const table = parseCsv(text);
    const header = table[0] || [];
    const col = header.findIndex((h) => h.trim().toLowerCase() === 'card ids');
    const refs = [];
    const unresolved = [];
    let rowCount = 0;
    for (const row of table.slice(1)) {
      if (!row.length || row.every((c) => !c.trim())) continue;
      rowCount++;
      for (const id of String(row[col] || '').split(',')) {
        const v = id.trim();
        if (!v) continue;
        refs.push(v);
        if (!live.has(v)) unresolved.push(v);
      }
    }
    golden = { file: path.relative(ROOT, goldenPath), rows: rowCount, card_id_refs: refs.length, unresolved: [...new Set(unresolved)] };
  }

  // 9. Every card id is a link target: the output contract's terms[].card_id has to
  //    open a real card. Term pages are generated from the DB, so a card that came
  //    from concepts.js has none, and a card the merge collapsed leaves an orphan
  //    page behind. Neither breaks the export, but a front-end that links straight
  //    to /term/<id> would 404 on the first kind — so report both.
  const termDir = path.join(ROOT, 'web', 'term');
  let pages = null;
  if (fs.existsSync(termDir)) {
    const have = new Set(fs.readdirSync(termDir).filter((f) => f.endsWith('.html')).map((f) => f.slice(0, -5)));
    const live = new Set(cards.map((c) => c.id));
    pages = {
      term_pages: have.size,
      cards_without_page: [...live].filter((id) => !have.has(id)).sort(),
      pages_without_card: [...have].filter((id) => !live.has(id)).sort(),
    };
  }

  // 10. Write.
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const contract = cards.map(({ _extra, ...rest }) => rest);
  const contractJson = JSON.stringify(contract, null, 2);
  fs.writeFileSync(path.join(OUT_DIR, 'shelf-export.json'), contractJson);
  fs.writeFileSync(path.join(OUT_DIR, 'shelf-export.full.json'), JSON.stringify(cards, null, 2));

  const hash = crypto.createHash('sha256').update(contractJson).digest('hex').slice(0, 12);
  const maxUpdated = db.reduce((m, r) => (r.updated_at > m ? r.updated_at : m), '');
  const meta = {
    version_id: `shelf-${cards.length}-${hash}`,
    generated_at: new Date().toISOString(),
    source: { supabase_url: SUPABASE_URL, table: 'concepts', published_rows: db.length, concepts_js_rows: js.length },
    max_updated_at: maxUpdated,
    card_count: cards.length,
    contract_sha256_12: hash,
    merges: notes,
    term_pages: pages,
    golden_set: golden,
    validation_errors: errors,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'shelf-export.meta.json'), JSON.stringify(meta, null, 2));

  console.log(`shelf: ${db.length} published DB rows + ${js.length} concepts.js rows`);
  console.log(`  merged ${notes.db_merges.length} DB duplicate pairs, folded ${notes.js_merged.length} concepts.js cards into DB cards`);
  console.log(`  kept ${notes.js_added.length} concepts.js cards the DB lacks: ${notes.js_added.map((x) => x.id).join(', ') || '—'}`);
  console.log(`  dropped ${notes.dropped_related} unresolvable related pointers`);
  if (notes.alias_overlaps.length) {
    console.log(`  · ${notes.alias_overlaps.length} shared surface form(s) across cards — see meta.merges.alias_overlaps`);
  }
  if (notes.collisions.length) {
    console.log(`  ! ${notes.collisions.length} uncurated title collision(s) — same concept twice, or a false friend:`);
    for (const c of notes.collisions) console.log(`      ${c.title}: ${c.ids.join(', ')}`);
  }
  if (pages && pages.cards_without_page.length) {
    console.log(`  ! ${pages.cards_without_page.length} card(s) have no /term page — a chip linking straight there would 404: ${pages.cards_without_page.join(', ')}`);
  }
  if (golden) {
    const ok = golden.unresolved.length === 0;
    console.log(`  golden set: ${golden.rows} rows, ${golden.card_id_refs} card-ID refs — ${ok ? 'all resolve' : 'UNRESOLVED: ' + golden.unresolved.join(', ')}`);
    if (!ok) errors.push(`golden set references ${golden.unresolved.length} card id(s) not in the export`);
  } else {
    console.log(`  golden set: not found at ${path.relative(ROOT, goldenPath)} — skipped`);
  }
  console.log(`wrote ${cards.length} cards → shelf/  (version ${meta.version_id})`);
  if (errors.length) {
    console.error(`  ! ${errors.length} validation error(s):`);
    for (const e of errors.slice(0, 20)) console.error(`      ${e}`);
    process.exit(1);
  }
})().catch((e) => { console.error(e); process.exit(1); });
