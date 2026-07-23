#!/usr/bin/env node
// Decoder — generate static, SEO-indexable pages for every glossary term.
//
// WHY: the web app renders all terms client-side at a single URL, so Google can
// index exactly one page. A glossary is the ideal SEO product (people search
// exact term names), so this emits one crawlable, pre-rendered HTML page per
// term, a browsable hub, a sitemap, and robots.txt.
//
// ADDITIVE ONLY — this NEVER touches the live product. It writes:
//   web/term/<id>.html   (one per term)
//   web/term/index.html  (the glossary hub)
//   web/sitemap.xml
//   web/robots.txt
// It does NOT edit index.html, concepts.js, vercel.json, or anything in extension/.
//
// SOURCE: by default it pulls ALL published terms from Supabase, auto-reading the
// URL + publishable (anon) key straight out of web/index.html — no env setup.
// With no network it falls back to the local 33-term bundle (web/concepts.js) so
// the script is always testable.
//
// Usage:
//   node scripts/build-term-pages.js            # all published terms from the DB
//   node scripts/build-term-pages.js --local    # offline: local web/concepts.js only
//
// Re-run it after adding/reseeding terms (same idea as scripts/build-concepts.js).

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WEB = path.join(ROOT, 'web');
const TERM_DIR = path.join(WEB, 'term');

const SITE = 'https://aidecoder.app';
const STORE_URL =
  'https://chromewebstore.google.com/detail/decoder-%E2%80%94-ai-terms-explai/lmkalmchomfbhfjmbepnldbcpmknajbh';
const OG_IMAGE = SITE + '/apple-touch-icon.png';

const STATUS_SYM = { Core: '●', Rising: '▲', Fading: '▼', Historical: '†' };

// ---------- tiny helpers ----------
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function truncate(s, n) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  if (s.length <= n) return s;
  return s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…';
}
function jsonld(obj) {
  // escape "<" so a value can never break out of the <script> tag
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ---------- data sources ----------
function readConfig() {
  const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
  const url = (html.match(/SUPABASE_URL:\s*"([^"]+)"/) || [])[1] || process.env.SUPABASE_URL;
  const key = (html.match(/SUPABASE_ANON_KEY:\s*"([^"]+)"/) || [])[1] || process.env.SUPABASE_ANON_KEY;
  return { url, key };
}

function rowToConcept(r) {
  return {
    id: r.id, term: r.term, aliases: r.aliases || '', said: r.said || '',
    aliasList: r.alias_list || [], status: r.status || 'Core',
    oneLiner: r.one_liner || '', analogy: r.analogy || '', example: r.example || '',
    related: r.related || [], deeper: r.deeper || '',
    lens: { pm: r.lens_pm || '', eng: r.lens_eng || '' },
  };
}

async function fetchFromDB() {
  const { url, key } = readConfig();
  if (!url || !key) throw new Error('Supabase URL/key not found in web/index.html or env');
  const cols = 'id,term,aliases,said,alias_list,status,one_liner,analogy,example,related,deeper,lens_pm,lens_eng,priority';
  const page = 1000;
  let offset = 0, out = [];
  for (;;) {
    const ep = `${url}/rest/v1/concepts?is_published=eq.true&select=${cols}` +
      `&order=priority.desc,term.asc&limit=${page}&offset=${offset}`;
    const res = await fetch(ep, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`REST ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const rows = await res.json();
    out = out.concat(rows);
    if (rows.length < page) break;
    offset += page;
  }
  return out.map(rowToConcept);
}

function readLocal() {
  const window = {};
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(WEB, 'concepts.js'), 'utf8'));
  const lenses = window.DECODER_LENSES || {};
  return (window.DECODER_CONCEPTS || []).map(c => ({
    ...c, lens: lenses[c.id] || { pm: '', eng: '' },
  }));
}

async function loadConcepts(useLocal) {
  if (useLocal) return { concepts: readLocal(), source: 'local (web/concepts.js, core bundle)' };
  try {
    return { concepts: await fetchFromDB(), source: 'Supabase (all published terms)' };
  } catch (e) {
    console.warn(`⚠  DB fetch failed (${e.message}).`);
    console.warn('   Falling back to local web/concepts.js (core bundle only).');
    console.warn('   Run without --local on a networked machine to build every term.\n');
    return { concepts: readLocal(), source: 'local fallback (core bundle only)' };
  }
}

// ---------- shared page chrome ----------
const CSS = `
:root{
  --bg:#fdfdfc;--surface:#ffffff;--surface-2:#f7f7f8;--text:#0e0f12;--text-2:#22252b;--text-3:#3f4249;--muted:#6a6e75;--faint:#9a9ea5;
  --border:rgba(20,24,33,.10);--border-2:rgba(20,24,33,.14);--hairline:rgba(20,24,33,.08);--accent:#4f77a6;--secondary:#f09637;
  --st-core-c:oklch(.5 .085 155);--st-core-bg:oklch(.955 .03 155);
  --st-rising-c:oklch(.56 .12 55);--st-rising-bg:oklch(.955 .05 72);
  --st-fading-c:oklch(.55 .05 250);--st-fading-bg:oklch(.955 .022 250);
  --st-historical-c:oklch(.5 0 0);--st-historical-bg:oklch(.925 0 0);
  --font-primary:"Inter",system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  --font-secondary:"Newsreader",Georgia,"Times New Roman",serif;
}
@media (prefers-color-scheme:dark){:root{
  --bg:#131519;--surface:#1c1f25;--surface-2:#23272e;--text:#f4f5f7;--text-2:#e6e8ec;--text-3:#c6cad1;--muted:#969ba3;--faint:#6d727a;
  --border:rgba(255,255,255,.12);--border-2:rgba(255,255,255,.17);--hairline:rgba(255,255,255,.10);
  --st-core-c:oklch(.82 .11 155);--st-core-bg:oklch(.33 .05 155);
  --st-rising-c:oklch(.83 .12 68);--st-rising-bg:oklch(.35 .06 60);
  --st-fading-c:oklch(.82 .07 250);--st-fading-bg:oklch(.33 .04 250);
  --st-historical-c:oklch(.78 0 0);--st-historical-bg:oklch(.34 0 0);
}}
*{box-sizing:border-box}html,body{margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:var(--font-primary);-webkit-font-smoothing:antialiased;letter-spacing:-.006em;line-height:1.62}
a{color:var(--accent);text-decoration:none}a:hover{opacity:.72}
.wrap{max-width:720px;margin:0 auto;padding:28px 20px 72px}
.site-h{display:flex;align-items:center;justify-content:space-between;padding-bottom:22px;border-bottom:1px solid var(--hairline);margin-bottom:24px}
.brand{font-family:var(--font-secondary);font-weight:600;font-size:20px;color:var(--text)}
.brand .dot{color:var(--secondary)}
.brand-sub{font-size:12.5px;color:var(--muted)}
.crumb{font-size:13px;color:var(--muted);margin-bottom:14px}.crumb a{color:var(--muted)}
h1{font-family:var(--font-secondary);font-weight:600;font-size:40px;line-height:1.08;letter-spacing:-.02em;margin:2px 0 12px;color:var(--text)}
.meta-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px}
.badge{display:inline-flex;align-items:center;gap:5px;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.03em;border-radius:20px;padding:4px 10px}
.said{color:var(--muted);font-style:italic;font-family:var(--font-secondary);font-size:16px}
.aka{color:var(--text-3);font-size:15px;margin:0 0 4px}
.lead{font-size:20px;line-height:1.5;color:var(--text);margin:16px 0 30px;font-weight:450}
.blk{margin:0 0 24px}
.blk h2{font-size:12.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:600;margin:0 0 7px}
.blk p{margin:0;font-size:16.5px;color:var(--text-2)}
.deeper{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:18px 20px}
.lenses{display:grid;gap:12px;grid-template-columns:1fr 1fr;margin:0 0 24px}
@media (max-width:560px){.lenses{grid-template-columns:1fr}}
.lens{background:var(--surface-2);border:1px solid var(--hairline);border-radius:12px;padding:14px 16px}
.lens h3{margin:0 0 6px;font-size:11.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);font-weight:600}
.lens p{margin:0;font-size:14.5px;color:var(--text-2)}
ul.rel{list-style:none;margin:0;padding:0;display:grid;gap:8px}
ul.rel li{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:11px 14px;font-size:15px;color:var(--text-2)}
ul.rel li a{font-weight:600}
.cta{margin-top:38px;background:var(--surface);border:1px solid var(--border-2);border-radius:16px;padding:24px;text-align:center}
.cta h2{color:var(--text-2);font-size:16px;margin:0 0 6px;font-weight:600}
.cta p{color:var(--muted);font-size:14px;margin:0 0 16px}
.btn{display:inline-block;background:var(--accent);color:#fff;font-weight:600;font-size:15px;padding:11px 20px;border-radius:10px}
.btn:hover{opacity:1;box-shadow:0 4px 16px rgba(79,119,166,.38)}
.btn.ghost{background:transparent;color:var(--accent);border:1px solid var(--border-2);margin-left:8px}
.site-f{margin-top:52px;padding-top:20px;border-top:1px solid var(--hairline);font-size:13px;color:var(--faint);display:flex;gap:16px;flex-wrap:wrap}
.site-f a{color:var(--muted)}
.idx-intro{font-size:17px;color:var(--text-2);margin:0 0 28px}
.idx-group{margin:0 0 26px}
.idx-group h2{font-family:var(--font-secondary);font-size:22px;color:var(--text);margin:0 0 10px;border-bottom:1px solid var(--hairline);padding-bottom:4px}
.idx-list{list-style:none;margin:0;padding:0;display:grid;gap:9px}
.idx-list li{font-size:15px;color:var(--muted)}
.idx-list li a{font-weight:600}
.jump{font-size:13px;color:var(--muted);margin:0 0 26px;line-height:2}.jump a{margin-right:8px}
`.trim();

const FONTS =
  '<link rel="preconnect" href="https://fonts.googleapis.com">' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&display=swap" rel="stylesheet">';

const ICONS =
  '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">' +
  '<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png">' +
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png">';

function head({ title, desc, canonical, ogType }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="Decoder">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${OG_IMAGE}">
<meta name="twitter:card" content="summary">
${ICONS}
${FONTS}
<style>${CSS}</style>
</head>`;
}

function siteHeader() {
  return `<header class="site-h">
<a class="brand" href="/">Decoder<span class="dot">.</span></a>
<span class="brand-sub">plain-English AI glossary</span>
</header>`;
}
function siteFooter() {
  return `<footer class="site-f">
<a href="/">Home</a>
<a href="/term/">All terms</a>
<a href="${STORE_URL}" rel="nofollow">Chrome extension</a>
<a href="/privacy">Privacy</a>
</footer>`;
}
function ctaBlock() {
  return `<div class="cta">
<h2>Read anything AI without the jargon</h2>
<p>Look up any term in plain English, or save terms as you read with the free Chrome extension.</p>
<a class="btn" href="/">Open Decoder</a><a class="btn ghost" href="${STORE_URL}" rel="nofollow">Add to Chrome</a>
</div>`;
}

// ---------- term page ----------
function renderTerm(c, idToTerm, validIds) {
  const canonical = `${SITE}/term/${c.id}`;
  const desc = truncate(c.oneLiner || c.analogy || c.example, 155);
  const title = `${c.term} — what it means in AI | Decoder`;
  const sym = STATUS_SYM[c.status] || '●';
  const stk = String(c.status || 'Core').toLowerCase();

  const parts = [];
  parts.push(head({ title, desc, canonical, ogType: 'article' }));
  parts.push('<body><main class="wrap">');
  parts.push(siteHeader());
  parts.push(`<nav class="crumb"><a href="/">Decoder</a> › <a href="/term/">AI glossary</a> › ${esc(c.term)}</nav>`);
  parts.push(`<h1>${esc(c.term)}</h1>`);

  const metaBits = [`<span class="badge" style="color:var(--st-${stk}-c);background:var(--st-${stk}-bg)">${sym} ${esc(c.status)}</span>`];
  if (c.said) metaBits.push(`<span class="said">${esc(c.said)}</span>`);
  parts.push(`<div class="meta-row">${metaBits.join('')}</div>`);
  if (c.aliases) parts.push(`<p class="aka">Also called <strong>${esc(c.aliases)}</strong></p>`);

  if (c.oneLiner) parts.push(`<p class="lead">${esc(c.oneLiner)}</p>`);
  if (c.analogy) parts.push(`<section class="blk"><h2>Think of it like</h2><p>${esc(c.analogy)}</p></section>`);
  if (c.example) parts.push(`<section class="blk"><h2>Example</h2><p>${esc(c.example)}</p></section>`);
  if (c.deeper) parts.push(`<section class="blk"><h2>How it actually works</h2><div class="deeper"><p>${esc(c.deeper)}</p></div></section>`);

  const lens = c.lens || {};
  if (lens.pm || lens.eng) {
    let l = '<div class="lenses">';
    if (lens.pm) l += `<div class="lens"><h3>For product teams</h3><p>${esc(lens.pm)}</p></div>`;
    if (lens.eng) l += `<div class="lens"><h3>For engineers</h3><p>${esc(lens.eng)}</p></div>`;
    l += '</div>';
    parts.push(l);
  }

  if (Array.isArray(c.related) && c.related.length) {
    const items = c.related.map(r => {
      const text = esc(r.text || '');
      if (r.id && validIds.has(r.id)) {
        const name = esc(idToTerm.get(r.id) || r.id);
        return `<li><a href="/term/${esc(r.id)}">${name}</a> — ${text}</li>`;
      }
      return `<li>${text}</li>`;
    }).join('');
    parts.push(`<section class="blk"><h2>Related</h2><ul class="rel">${items}</ul></section>`);
  }

  parts.push(ctaBlock());
  parts.push(siteFooter());

  const ld = [
    {
      '@context': 'https://schema.org', '@type': 'DefinedTerm',
      name: c.term, description: c.oneLiner || c.analogy || '', termCode: c.id, url: canonical,
      inDefinedTermSet: { '@type': 'DefinedTermSet', name: 'Decoder — AI glossary', url: `${SITE}/term/` },
    },
    {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Decoder', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: 'AI glossary', item: SITE + '/term/' },
        { '@type': 'ListItem', position: 3, name: c.term, item: canonical },
      ],
    },
  ];
  parts.push(`<script type="application/ld+json">${jsonld(ld)}</script>`);
  parts.push('</main></body></html>');
  return parts.join('\n');
}

// ---------- hub page ----------
function renderHub(concepts) {
  const canonical = `${SITE}/term/`;
  const title = `AI glossary — ${concepts.length} terms explained in plain English | Decoder`;
  const desc = 'A plain-English dictionary of AI terms — from RAG and tokens to agents and embeddings. Every term with a simple explanation, an analogy, and an example.';

  const sorted = concepts.slice().sort((a, b) =>
    a.term.localeCompare(b.term, 'en', { sensitivity: 'base' }));
  const groups = new Map();
  for (const c of sorted) {
    let letter = (c.term[0] || '#').toUpperCase();
    if (!/[A-Z]/.test(letter)) letter = '#';
    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter).push(c);
  }
  const letters = [...groups.keys()];

  const parts = [];
  parts.push(head({ title, desc, canonical, ogType: 'website' }));
  parts.push('<body><main class="wrap">');
  parts.push(siteHeader());
  parts.push(`<h1>The AI glossary, in plain English</h1>`);
  parts.push(`<p class="idx-intro">${esc(concepts.length)} AI terms, each with a one-line meaning, an analogy, and a real example. Click any term for the full explanation.</p>`);
  parts.push(`<p class="jump">${letters.map(l => `<a href="#l-${esc(l)}">${esc(l)}</a>`).join('')}</p>`);

  for (const letter of letters) {
    const items = groups.get(letter).map(c => {
      const line = c.oneLiner ? ` — ${esc(truncate(c.oneLiner, 90))}` : '';
      return `<li><a href="/term/${esc(c.id)}">${esc(c.term)}</a>${line}</li>`;
    }).join('');
    parts.push(`<section class="idx-group" id="l-${esc(letter)}"><h2>${esc(letter)}</h2><ul class="idx-list">${items}</ul></section>`);
  }

  parts.push(ctaBlock());
  parts.push(siteFooter());
  parts.push('</main></body></html>');
  return parts.join('\n');
}

// ---------- sitemap + robots ----------
function renderSitemap(concepts) {
  const today = todayISO();
  const urls = [
    { loc: `${SITE}/`, pri: '1.0' },
    { loc: `${SITE}/term/`, pri: '0.9' },
    ...concepts.map(c => ({ loc: `${SITE}/term/${c.id}`, pri: '0.7' })),
  ];
  const body = urls.map(u =>
    `  <url><loc>${esc(u.loc)}</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>${u.pri}</priority></url>`
  ).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}
function renderRobots() {
  return `User-agent: *
Allow: /

Sitemap: ${SITE}/sitemap.xml
`;
}

// ---------- main ----------
async function main() {
  const useLocal = process.argv.includes('--local');
  const { concepts, source } = await loadConcepts(useLocal);
  if (!concepts.length) { console.error('No concepts loaded — aborting.'); process.exit(1); }

  const idToTerm = new Map(concepts.map(c => [c.id, c.term]));
  const validIds = new Set(concepts.map(c => c.id));

  fs.mkdirSync(TERM_DIR, { recursive: true });

  // clear stale term pages so removed/renamed ids don't linger
  for (const f of fs.readdirSync(TERM_DIR)) {
    if (f.endsWith('.html') && f !== 'index.html') fs.unlinkSync(path.join(TERM_DIR, f));
  }

  let n = 0;
  for (const c of concepts) {
    if (!c.id || !c.term) continue;
    fs.writeFileSync(path.join(TERM_DIR, `${c.id}.html`), renderTerm(c, idToTerm, validIds));
    n++;
  }
  fs.writeFileSync(path.join(TERM_DIR, 'index.html'), renderHub(concepts));
  fs.writeFileSync(path.join(WEB, 'sitemap.xml'), renderSitemap(concepts));
  fs.writeFileSync(path.join(WEB, 'robots.txt'), renderRobots());

  console.log(`Source: ${source}`);
  console.log(`Wrote ${n} term pages -> web/term/`);
  console.log(`Wrote web/term/index.html (hub), web/sitemap.xml, web/robots.txt`);
  console.log(`Canonical base: ${SITE}/term/<id>`);
  if (source.startsWith('local')) {
    console.log('\nNOTE: this was the core bundle only. Re-run without --local on a');
    console.log('networked machine to generate a page for every published term.');
  }
}

main();
