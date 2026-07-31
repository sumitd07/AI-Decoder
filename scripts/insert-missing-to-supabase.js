#!/usr/bin/env node
// Insert concepts that exist in concepts.js but are missing from the Supabase concepts table.
// Usage:  SUPABASE_SERVICE_KEY=your_key node scripts/insert-missing-to-supabase.js
//
// The script:
//  1. Loads concepts.js + lenses
//  2. Fetches all existing IDs from the DB
//  3. Inserts only the missing ones

const vm = require('vm');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://ivyfvwnxjkqyicbjzqoz.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SERVICE_KEY) { console.error('Set SUPABASE_SERVICE_KEY env var'); process.exit(1); }

// Load concepts.js
const src = fs.readFileSync(path.join(__dirname, '..', 'web', 'concepts.js'), 'utf8');
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(src, ctx);
const concepts = ctx.window.DECODER_CONCEPTS;
const lenses = ctx.window.DECODER_LENSES;

async function main() {
  // Fetch existing IDs from DB
  const res = await fetch(SUPABASE_URL + '/rest/v1/concepts?select=id&limit=10000', {
    headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY }
  });
  if (!res.ok) { console.error('Failed to fetch existing:', res.status, await res.text()); process.exit(1); }
  const existing = new Set((await res.json()).map(r => r.id));

  const missing = concepts.filter(c => !existing.has(c.id));
  if (!missing.length) { console.log('All concepts already in DB. Nothing to insert.'); return; }

  console.log(`Found ${missing.length} missing concepts: ${missing.map(c => c.id).join(', ')}`);

  // Build rows
  const rows = missing.map(c => {
    const lens = lenses[c.id] || {};
    return {
      id: c.id,
      term: c.term,
      aliases: c.aliases || '',
      said: c.said || '',
      alias_list: c.aliasList || [],
      status: c.status,
      one_liner: c.oneLiner,
      analogy: c.analogy,
      example: c.example,
      related: JSON.stringify(c.related || []),
      deeper: c.deeper || '',
      lens_pm: lens.pm || '',
      lens_eng: lens.eng || '',
      is_published: true,
      priority: 50
    };
  });

  // Insert in batches of 50
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    const ins = await fetch(SUPABASE_URL + '/rest/v1/concepts', {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: 'Bearer ' + SERVICE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(batch)
    });
    if (!ins.ok) {
      console.error('Insert failed:', ins.status, await ins.text());
      process.exit(1);
    }
    console.log(`Inserted batch ${Math.floor(i / 50) + 1} (${batch.length} rows)`);
  }
  console.log('Done. All missing concepts inserted.');
}

main().catch(e => { console.error(e); process.exit(1); });
