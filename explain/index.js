'use strict';
// The retrieval index (CONTRACT.md ## explain/index.js).
//
// Two structures over the same cards, one per retrieval leg (D11):
//   vectors[]   — the semantic leg. Built from `title + "\n" + definition` and
//                 nothing else (D14): title alone is one to three words, too thin
//                 a signal; the definition gives a described-but-unnamed concept
//                 enough surface to match. Deliberately NOT the `deeper` field —
//                 see shelf/README.md for why that costs precision.
//   alias_map   — the lexical leg. Normalised surface form → card ids.
//
// One surface can map to several cards: the shelf carries ~36 pairs sharing a
// surface (shelf/README.md), so this is a list, never a single id.

const fs = require('fs');
const path = require('path');

const DEFAULT_INDEX_PATH = path.join(__dirname, '..', 'shelf', 'shelf-index.json');

// Lowercase, strip punctuation, collapse whitespace. Used on both sides of every
// lexical comparison — the card surface and the sentence — so they must agree.
function normalise(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

// What the semantic leg embeds. Exported so build-index.js and any re-embed use
// exactly one definition of it — a drift here silently invalidates the index.
function embedText(card) {
  return `${card.title}\n${card.definition}`;
}

function buildAliasMap(cards) {
  const map = Object.create(null);
  for (const card of cards) {
    for (const surface of [card.title, ...(card.aliases || [])]) {
      const key = normalise(surface);
      if (!key) continue;
      if (!map[key]) map[key] = [];
      if (!map[key].includes(card.id)) map[key].push(card.id);
    }
  }
  return map;
}

function buildIndex(cards, { vectors, version_id, embed_model, embed_task_type } = {}) {
  if (!Array.isArray(cards)) throw new TypeError('buildIndex: cards must be an array');
  if (vectors && vectors.length !== cards.length) {
    throw new Error(`buildIndex: ${vectors.length} vectors for ${cards.length} cards — they must align by position`);
  }
  const dims = vectors && vectors.length ? vectors[0].length : 0;
  return {
    version_id: version_id || null,
    embed_model: embed_model || null,
    embed_task_type: embed_task_type || null,
    dims,
    cards,
    vectors: vectors || [],
    alias_map: buildAliasMap(cards),
  };
}

function loadIndex(indexPath) {
  const p = indexPath || DEFAULT_INDEX_PATH;
  if (!fs.existsSync(p)) {
    throw new Error(`loadIndex: no index at ${p} — run: node scripts/build-index.js`);
  }
  const index = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!Array.isArray(index.cards)) throw new Error(`loadIndex: ${p} has no cards`);
  if (index.vectors && index.vectors.length && index.vectors.length !== index.cards.length) {
    throw new Error(`loadIndex: ${p} has ${index.vectors.length} vectors for ${index.cards.length} cards`);
  }
  // An older index may predate alias_map; rebuilding it is cheap and keeps the
  // lexical leg working rather than silently returning nothing.
  if (!index.alias_map) index.alias_map = buildAliasMap(index.cards);
  return index;
}

function cardById(index, id) {
  if (!index._byId) {
    Object.defineProperty(index, '_byId', {
      value: new Map(index.cards.map((c) => [c.id, c])),
      enumerable: false,
    });
  }
  return index._byId.get(id);
}

module.exports = { buildIndex, loadIndex, buildAliasMap, normalise, embedText, cardById, DEFAULT_INDEX_PATH };
