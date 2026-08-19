'use strict';
// Retrieval (CONTRACT.md ## explain/retrieve.js) — hybrid, semantic-primary (D11).
//
// Two legs over disjoint failure modes. Semantic owns concepts the sentence
// describes but never names; lexical owns proper nouns and exact terms. Semantic
// leads because most expected cards in the golden set are the unnamed kind (D15).
//
// The set can be EMPTY. That is the correct answer for a sentence whose terms
// aren't on the shelf, and for a false friend where the string is a shelf term
// but the sense isn't (D8). Emptiness is a feature of the cut-off, not a bug.

const { normalise, cardById } = require('./index');
const { embed, TASK_QUERY } = require('./providers/embeddings');

// A one- or two-character surface matches far too much prose to be evidence
// of anything ("AI" is the exception that proves it, and it costs less to miss
// than to fire on every "a i" in a normalised sentence).
const MIN_SURFACE_CHARS = 3;

// A three-word exact match is as much confidence as the lexical leg ever gets;
// beyond that, more words shouldn't keep inflating the score past semantic's.
const LEXICAL_SATURATION = 3;

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d ? dot / d : 0;
}

// Exact match of card titles and aliases against the sentence, on the normalised
// form, at word boundaries — matching on tokens rather than substrings is what
// stops "epoch" firing inside "epochal" and "gpt" inside "gpt4all".
function lexicalLeg(sentence, index) {
  const tokens = normalise(sentence).split(' ').filter(Boolean);
  if (!tokens.length) return [];

  const matches = [];
  for (const surface of Object.keys(index.alias_map)) {
    if (surface.replace(/\s/g, '').length < MIN_SURFACE_CHARS) continue;
    const parts = surface.split(' ');
    for (let i = 0; i + parts.length <= tokens.length; i++) {
      let hit = true;
      for (let j = 0; j < parts.length; j++) {
        if (tokens[i + j] !== parts[j]) { hit = false; break; }
      }
      if (hit) matches.push({ start: i, len: parts.length, surface, ids: index.alias_map[surface] });
    }
  }

  // Longer surface wins over a shorter one covering the same words: a sentence
  // about "vector database" should match that card, not "database" as well.
  matches.sort((a, b) => b.len - a.len || a.start - b.start || (a.surface < b.surface ? -1 : 1));
  const taken = [];
  const kept = [];
  for (const m of matches) {
    const overlaps = taken.some((t) => m.start < t.start + t.len && t.start < m.start + m.len);
    if (overlaps) continue;
    taken.push(m);
    kept.push(m);
  }

  const best = new Map();
  for (const m of kept) {
    const score = Math.min(m.len / LEXICAL_SATURATION, 1);
    for (const id of m.ids) {
      const prev = best.get(id);
      if (!prev || score > prev.score) best.set(id, { id, score, surface: m.surface });
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
}

async function semanticLeg(sentence, index, embedOpts) {
  if (!index.vectors || !index.vectors.length) return { hits: [], model: null };
  const { vectors, model } = await embed([sentence], { ...embedOpts, taskType: TASK_QUERY });
  const q = vectors[0];
  if (!q) return { hits: [], model };
  if (index.dims && q.length !== index.dims) {
    throw new Error(`retrieve: query is ${q.length}-dim but the index is ${index.dims}-dim — rebuild the index with the same embed model`);
  }
  const hits = index.cards.map((c, i) => ({
    id: c.id,
    // Cosine can go negative; a negative match is no match, so clamp rather than
    // let it drag a card below zero and reorder things underneath it.
    score: Math.max(0, cosine(q, index.vectors[i])),
  }));
  hits.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
  return { hits, model };
}

async function retrieve(sentence, {
  index,
  k = 5,                                        // D16 cap. Raising it to 8 was tested and reverted — see D29
  floor = 0,                                    // absolute floor on the fused score
  semanticFloor = 0,                            // D16 watch: extra gate on raw cosine
  weights = { semantic: 1.0, lexical: 0.5 },
  legs = 'both',                                // D15 attribution
  embedOpts = {},
} = {}) {
  if (!index) throw new Error('retrieve: an index is required');
  const wantSemantic = legs === 'both' || legs === 'semantic';
  const wantLexical = legs === 'both' || legs === 'lexical';

  const sem = wantSemantic ? await semanticLeg(sentence, index, embedOpts) : { hits: [], model: null };
  const lex = wantLexical ? lexicalLeg(sentence, index) : [];

  const semById = new Map(sem.hits.map((h) => [h.id, h.score]));
  const lexById = new Map(lex.map((h) => [h.id, h.score]));

  const fused = [];
  for (const id of new Set([...semById.keys(), ...lexById.keys()])) {
    const s = semById.get(id);
    const l = lexById.get(id);
    if (s !== undefined && s < semanticFloor && l === undefined) continue;
    const score = (s !== undefined ? weights.semantic * s : 0) + (l !== undefined ? weights.lexical * l : 0);
    const perLeg = {};
    if (s !== undefined) perLeg.semantic = s;
    if (l !== undefined) perLeg.lexical = l;
    fused.push({ id, score, legs: perLeg });
  }

  // Ties break on id so the same sentence always returns the same order —
  // attribution is worthless if a rerun reshuffles the set (D1).
  fused.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));

  const cards = fused
    .filter((f) => f.score >= floor)
    .slice(0, k)
    .map((f) => ({ ...cardById(index, f.id), score: f.score, legs: f.legs }));

  return {
    cards,
    legOutput: {
      semantic: sem.hits.slice(0, 20).map(({ id, score }) => ({ id, score })),
      lexical: lex.map(({ id, score, surface }) => ({ id, score, surface })),
    },
    meta: {
      embed_model: sem.model || index.embed_model || null,
      dims: index.dims || 0,
      floor,
      semanticFloor,
      weights,
      legs,
      k,
    },
  };
}

module.exports = { retrieve, lexicalLeg, cosine, MIN_SURFACE_CHARS, LEXICAL_SATURATION };
