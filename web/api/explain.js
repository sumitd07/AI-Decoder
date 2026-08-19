'use strict';
// The endpoint (CONTRACT.md ## web/api/explain.js). One backend, surface-agnostic:
// POST { sentence } → the output contract. The Decode box calls it today; the
// extension highlighter will call the same thing unchanged once 1a's eval passes
// (D19).
//
// No auth (D5): auth friction lands exactly at the moment of confusion, which is
// the moment that sells the product. The spend ceiling and per-IP rate limit are
// Phase 3 — the seam for them is marked below, deliberately unbuilt.

const { explain } = require('../../explain/explain');

const MAX_SENTENCE = 1000;

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return send(res, 405, { error: 'method_not_allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return send(res, 400, { error: 'invalid_json' }); }
  }
  const sentence = body && typeof body.sentence === 'string' ? body.sentence.trim() : '';

  if (!sentence) return send(res, 400, { error: 'missing_sentence', message: 'Paste a sentence to decode.' });
  if (sentence.length > MAX_SENTENCE) {
    return send(res, 400, {
      error: 'sentence_too_long',
      message: `That's ${sentence.length} characters. Decode works on one sentence — keep it under ${MAX_SENTENCE}.`,
      max: MAX_SENTENCE,
    });
  }

  // ---- Phase 3 seam: spend ceiling + per-IP rate limit go here, before the
  // model call, so a refusal costs nothing. Deliberately not built (D5) — the
  // decision is "when abuse actually appears in the logs".

  try {
    const result = await explain(sentence);
    const payload = {
      restatement: result.restatement,
      terms: result.terms,
      gaps: result.gaps,
    };
    // Debug carries model ids, scores and token counts. Off unless asked for —
    // it is for the eval and for local work, not for readers.
    if (process.env.EXPLAIN_DEBUG === '1') payload._debug = result._debug;
    return send(res, 200, payload);
  } catch (e) {
    // Never let a provider error reach the client: it can carry the key, the
    // endpoint, or quota details. Log it, return something plain.
    console.error('explain: ' + (e && e.message ? e.message : e));
    return send(res, 502, { error: 'explain_failed', message: "Couldn't decode that one. Try again in a moment." });
  }
};

module.exports.MAX_SENTENCE = MAX_SENTENCE;
