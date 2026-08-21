'use strict';
// Generation (CONTRACT.md ## explain/generate.js).
//
// Calls the model, gets the output contract back out of whatever it actually
// returned, and guarantees the shape. This function NEVER throws on a bad
// reply: a reader who highlighted a sentence gets a degraded answer, not a
// spinner that ends in nothing (PRD). What went wrong is recorded in `raw` so
// the eval can see it instead of it being smoothed away.

const { complete } = require('./providers/llm');

const EMPTY = () => ({ restatement: '', terms: [], gaps: [] });

// Models wrap JSON in prose or a fence even when asked not to. Try the whole
// string, then a fenced block, then the outermost braces — cheapest first.
function extractJson(text) {
  const s = String(text || '').trim();
  if (!s) return null;

  const attempts = [s];

  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) attempts.push(fence[1].trim());

  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first >= 0 && last > first) attempts.push(s.slice(first, last + 1));

  for (const a of attempts) {
    try {
      const parsed = JSON.parse(a);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch { /* try the next shape */ }
  }
  return null;
}

function asStringArray(v) {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean);
}

async function generate({ system, user }, opts = {}) {
  // allowedCardIds is what retrieval actually supplied. A card_id outside it is
  // a link the model invented, and a chip that goes nowhere is worse than no
  // chip — so those entries are dropped rather than rendered.
  const allowed = new Set(opts.allowedCardIds || []);
  const notes = [];

  let res;
  try {
    // 8000. Reasoning-tier models spend this budget on thinking BEFORE they emit
    // text, and the thinking scales with prompt size: gemini-3.1-pro burned ~780 of
    // 800 on a 5-card prompt and returned 22 tokens of truncated JSON, blanking 34
    // of 39 eval rows. Flash-Lite uses ~110 output tokens, so a high ceiling changes
    // nothing for it. An unused ceiling is free; a breached one costs the whole run.
    res = await complete({ system, user, maxTokens: opts.maxTokens || 8000, temperature: opts.temperature ?? 0 }, opts);
  } catch (e) {
    // The provider itself failed. Surface it as a note; the caller decides
    // whether that becomes a 5xx or a fallback.
    return { output: EMPTY(), raw: null, model: null, usage: null, error: e.message, notes: ['provider_error'] };
  }

  const parsed = extractJson(res.text);
  if (!parsed) {
    notes.push('unparseable_json');
    return { output: EMPTY(), raw: res.text, model: res.model, usage: res.usage, notes };
  }

  const output = EMPTY();
  output.restatement = typeof parsed.restatement === 'string' ? parsed.restatement.trim() : '';
  if (!output.restatement) notes.push('missing_restatement');

  const terms = Array.isArray(parsed.terms) ? parsed.terms : [];
  if (!Array.isArray(parsed.terms) && parsed.terms !== undefined) notes.push('terms_not_array');
  for (const t of terms) {
    if (!t || typeof t !== 'object') continue;
    const card_id = typeof t.card_id === 'string' ? t.card_id.trim() : '';
    const surface = typeof t.surface === 'string' ? t.surface.trim() : '';
    if (!card_id) continue;
    if (allowed.size && !allowed.has(card_id)) { notes.push(`dropped_unretrieved_card:${card_id}`); continue; }
    if (output.terms.some((x) => x.card_id === card_id)) continue;
    output.terms.push({ card_id, surface });
  }

  output.gaps = asStringArray(parsed.gaps);
  if (parsed.gaps !== undefined && !Array.isArray(parsed.gaps)) notes.push('gaps_not_array');

  return { output, raw: res.text, model: res.model, usage: res.usage, notes };
}

module.exports = { generate, extractJson };
