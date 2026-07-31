#!/usr/bin/env node
// Converts web/concepts.js → web/concepts.json
// Run after editing concepts.js:  node scripts/build-concepts-json.js

const vm = require('vm');
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'web', 'concepts.js');
const dst = path.join(__dirname, '..', 'web', 'concepts.json');

const code = fs.readFileSync(src, 'utf8');
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(code, ctx);

const out = {
  v: ctx.window.DECODER_CONCEPTS.length,           // term count as a simple version marker
  concepts: ctx.window.DECODER_CONCEPTS,
  lenses:   ctx.window.DECODER_LENSES,
  status:   ctx.window.DECODER_STATUS,
};

fs.writeFileSync(dst, JSON.stringify(out));
const kb = (fs.statSync(dst).size / 1024).toFixed(1);
console.log(`wrote ${dst}  (${out.v} terms, ${kb} KB)`);
