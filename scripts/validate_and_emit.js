#!/usr/bin/env node
// Decoder — validate a content batch and emit runnable SQL. The engine of the 1k-term pipeline.
//
// Usage:  node scripts/validate_and_emit.js <batch.js>
//   <batch.js> defines window.BATCH_CONCEPTS = [ {id, term, aliasList, status, oneLiner,
//   analogy, example, deeper, lens_pm, lens_eng, domain, aliases?, said?, related?}, ... ]
//
// On success: writes supabase/batches/seed_NNN.sql, updates content/registry.json,
// marks content/backlog.json items done, regenerates supabase/seed_all.sql, updates PROGRESS.md.
// On any validation failure: writes NOTHING and exits 1 (so a bad scheduled run is a no-op).
// Never touches extension/.

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const P = (...p) => path.join(ROOT, ...p);

const STATUSES = ['Core','Rising','Fading','Historical'];
const PRIORITY = { Core:80, Rising:60, Fading:30, Historical:10 };
const REQUIRED = ['id','term','status','oneLiner','analogy','example','deeper','lens_pm','lens_eng','domain'];

function load(file){ const w={}; (function(window){ eval(fs.readFileSync(file,'utf8')); })(w); return w; }

function main(){
  const batchPath = process.argv[2];
  if(!batchPath){ console.error('usage: validate_and_emit.js <batch.js>'); process.exit(1); }

  const registry = JSON.parse(fs.readFileSync(P('content','registry.json'),'utf8'));
  const batch = load(batchPath).BATCH_CONCEPTS;
  if(!Array.isArray(batch) || !batch.length){ console.error('batch empty or missing BATCH_CONCEPTS'); process.exit(1); }

  // ids available for related-link resolution = existing registry + this batch
  const batchIds = new Set(batch.map(c=>c.id));
  const knownIds = new Set([...Object.keys(registry.ids), ...batchIds]);
  const problems = [];
  const seenId = new Set(), seenAlias = new Map();

  for(const c of batch){
    for(const f of REQUIRED) if(!c[f] || !String(c[f]).trim()) problems.push(`${c.id||'?'}: missing ${f}`);
    if(c.status && !STATUSES.includes(c.status)) problems.push(`${c.id}: bad status "${c.status}"`);
    if(registry.ids[c.id]) problems.push(`${c.id}: id already in registry`);
    if(seenId.has(c.id)) problems.push(`${c.id}: duplicate id in batch`);
    seenId.add(c.id);
    for(const r of (c.related||[])) if(r.id && !knownIds.has(r.id)) problems.push(`${c.id}: related -> unknown id "${r.id}"`);
    for(const a of (c.aliasList||[])){
      const k=a.toLowerCase();
      if(registry.aliases[k]) problems.push(`${c.id}: alias "${a}" collides with existing ${registry.aliases[k]}`);
      if(seenAlias.has(k) && seenAlias.get(k)!==c.id) problems.push(`alias "${a}" shared by ${seenAlias.get(k)} and ${c.id}`);
      seenAlias.set(k,c.id);
    }
  }
  if(problems.length){ console.error('VALIDATION FAILED — nothing written:\n'+problems.join('\n')); process.exit(1); }

  // --- emit SQL ---
  const q = s => "'" + String(s==null?'':s).replace(/'/g,"''") + "'";
  const arr = a => "ARRAY[" + (a||[]).map(q).join(",") + "]::text[]";
  const jsonb = o => q(JSON.stringify(o||[])) + "::jsonb";
  const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

  const rows = batch.map(c => "  (" + [
    q(c.id), q(c.term), q(c.aliases||''), q(c.said||''), arr(c.aliasList), q(c.status),
    q(c.oneLiner), q(c.analogy), q(c.example), jsonb(c.related), q(c.deeper),
    q(c.lens_pm), q(c.lens_eng), q(c.domain), String(PRIORITY[c.status]||0),
    arr(['seed', slug(c.domain)])   // rollback tag: delete from concepts where tags @> '{seed}'
  ].join(", ") + ")").join(",\n");

  const batchesDir = P('supabase','batches');
  fs.mkdirSync(batchesDir,{recursive:true});
  const n = fs.readdirSync(batchesDir).filter(f=>/^seed_\d+\.sql$/.test(f)).length + 1;
  const nnn = String(n).padStart(3,'0');
  const sql = `-- Decoder — content batch ${nnn} (${batch.length} terms). Generated; idempotent upsert.
insert into public.concepts
  (id, term, aliases, said, alias_list, status, one_liner, analogy, example, related, deeper, lens_pm, lens_eng, domain, priority, tags)
values
${rows}
on conflict (id) do update set
  term=excluded.term, aliases=excluded.aliases, said=excluded.said, alias_list=excluded.alias_list,
  status=excluded.status, one_liner=excluded.one_liner, analogy=excluded.analogy, example=excluded.example,
  related=excluded.related, deeper=excluded.deeper, lens_pm=excluded.lens_pm, lens_eng=excluded.lens_eng,
  domain=excluded.domain, priority=excluded.priority, tags=excluded.tags, updated_at=now();
`;
  fs.writeFileSync(path.join(batchesDir,`seed_${nnn}.sql`), sql);

  // --- update registry ---
  for(const c of batch){
    registry.ids[c.id] = { term:c.term, status:c.status };
    for(const a of (c.aliasList||[])) registry.aliases[a.toLowerCase()] = c.id;
  }
  fs.writeFileSync(P('content','registry.json'), JSON.stringify(registry,null,1));

  // --- mark backlog done ---
  const backlog = JSON.parse(fs.readFileSync(P('content','backlog.json'),'utf8'));
  const producedNames = new Set();
  for(const c of batch){ producedNames.add(c.term.toLowerCase()); for(const a of (c.aliasList||[])) producedNames.add(a.toLowerCase()); }
  let marked=0;
  for(const b of backlog) if(!b.done && producedNames.has(b.term.toLowerCase())){ b.done=true; marked++; }
  fs.writeFileSync(P('content','backlog.json'), JSON.stringify(backlog,null,1));

  // --- regenerate seed_all.sql (schema files are run separately) ---
  const parts = [
    '-- Decoder — seed_all.sql: run AFTER concepts.sql + concepts_search.sql.\n' +
    '-- Contains every glossary term (original 15 + all generated batches). Idempotent.\n',
    fs.readFileSync(P('supabase','concepts_seed.sql'),'utf8'),
    fs.readFileSync(P('supabase','seed_foundations.sql'),'utf8'),
  ];
  for(const f of fs.readdirSync(batchesDir).filter(f=>/^seed_\d+\.sql$/.test(f)).sort())
    parts.push(fs.readFileSync(path.join(batchesDir,f),'utf8'));
  fs.writeFileSync(P('supabase','seed_all.sql'), parts.join('\n'));

  // --- progress ---
  const total = Object.keys(registry.ids).length;
  const todo = backlog.filter(b=>!b.done).length;
  const progress = `# Glossary population progress

**Terms generated:** ${total}
**Backlog remaining:** ${todo}
**Target:** 1000
**Status:** ${total>=1000 ? 'TARGET REACHED ✅' : 'in progress'}

Batches emitted: ${n}. Latest: seed_${nnn}.sql (${batch.length} terms).
Run \`supabase/seed_all.sql\` in the Supabase SQL Editor to load everything (after the schema files).

_Updated: ${new Date().toISOString()}_
`;
  fs.writeFileSync(P('PROGRESS.md'), progress);

  console.log(`batch ${nnn}: +${batch.length} terms (marked ${marked} backlog items done)`);
  console.log(`total generated: ${total} | backlog remaining: ${todo} | target 1000`);
  console.log(total>=1000 ? 'TARGET REACHED' : 'more batches needed');
}
main();
