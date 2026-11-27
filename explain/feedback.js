'use strict';
// Answer feedback (thumbs up / down under a decoded sentence). Scope:
// /mnt/project-files/feedback-feature/ANSWER-FEEDBACK-SCOPE.md; table and RLS in
// supabase/answer_feedback.sql.
//
// Writes go to the same Supabase project the web app uses, with the same public
// (publishable) key the web app ships in its page. The table is insert-only for
// that key, so no secret is needed in Vercel and nothing written can be read back.
//
// Privacy: a sentence is stored only when a reader votes on its answer. Nothing
// here records an IP, an account or a page address.

const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ivyfvwnxjkqyicbjzqoz.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_rP_Ds8F2cbEHkpFNIzyRIQ_YHGxQ5c9';

const SURFACES = ['web', 'extension'];
const KINDS = ['answer', 'declined'];
const REASONS = {
  answer: ['wrong', 'confusing', 'wrong_term', 'missed_term', 'other'],
  declined: ['is_ai', 'other'],
};
const MAX_SENTENCE = 1000;
const MAX_COMMENT = 1000;
const MAX_RESTATEMENT = 4000;
const MAX_TERMS = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function newAnswerId() { return crypto.randomUUID(); }

function surfaceOf(v) { return SURFACES.includes(v) ? v : 'unknown'; }

// "declined" = nothing was decoded: the Jev gate skipped it, or the model said
// the words weren't used in their AI sense (prompt rule 7) and named nothing.
function kindOf(result) {
  if (result.gateStatus === 'skip') return 'declined';
  const t = Array.isArray(result.terms) ? result.terms.length : 0;
  const g = Array.isArray(result.gaps) ? result.gaps.length : 0;
  return t === 0 && g === 0 ? 'declined' : 'answer';
}

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// Body → row, or { error }. Strict on shape, forgiving on optional fields: an
// unknown reason is a client bug, so it's refused rather than silently dropped.
function validateFeedback(body) {
  if (!body || typeof body !== 'object') return { error: 'invalid_body' };
  const answerId = typeof body.answer_id === 'string' ? body.answer_id : '';
  if (!UUID.test(answerId)) return { error: 'invalid_answer_id' };
  if (body.vote !== 'up' && body.vote !== 'down') return { error: 'invalid_vote' };
  const kind = KINDS.includes(body.kind) ? body.kind : null;
  if (!kind) return { error: 'invalid_kind' };
  let reason = null;
  if (body.reason != null && body.reason !== '') {
    if (body.vote !== 'down' || !REASONS[kind].includes(body.reason)) return { error: 'invalid_reason' };
    reason = body.reason;
  }
  const sentence = str(body.sentence, MAX_SENTENCE + 1);
  if (!sentence || sentence.length > MAX_SENTENCE) return { error: 'invalid_sentence' };
  const a = body.answer && typeof body.answer === 'object' ? body.answer : {};
  if (typeof a.restatement !== 'string') return { error: 'invalid_answer' };
  const terms = (Array.isArray(a.terms) ? a.terms : [])
    .filter((t) => t && typeof t.card_id === 'string' && typeof t.surface === 'string')
    .slice(0, MAX_TERMS)
    .map((t) => ({ card_id: t.card_id.slice(0, 80), surface: t.surface.slice(0, 120) }));
  const gaps = (Array.isArray(a.gaps) ? a.gaps : [])
    .filter((g) => typeof g === 'string')
    .slice(0, MAX_TERMS)
    .map((g) => g.slice(0, 120));
  const meta = body.meta && typeof body.meta === 'object' ? body.meta : {};
  const comment = body.vote === 'down' ? str(body.comment, MAX_COMMENT) : '';
  return {
    row: {
      answer_id: answerId,
      surface: surfaceOf(body.surface),
      vote: body.vote,
      reason,
      comment: comment || null,
      kind,
      sentence,
      restatement: a.restatement.slice(0, MAX_RESTATEMENT),
      terms,
      gaps,
      gate: str(meta.gate, 40) || null,
      prompt_version: str(meta.prompt_version, 20) || null,
      shelf_version: str(meta.shelf_version, 80) || null,
    },
  };
}

async function supa(pathname, body, { fetchImpl = fetch, timeoutMs = 4000 } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(SUPABASE_URL + pathname, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        authorization: 'Bearer ' + SUPABASE_KEY,
        'content-type': 'application/json',
        prefer: 'return=minimal',   // no select policy: asking for the row back would fail
      },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.text()).slice(0, 200); } catch (e) {}
      throw new Error('supabase HTTP ' + res.status + ' ' + detail);
    }
  } finally { clearTimeout(timer); }
}

function saveFeedback(row, opts) { return supa('/rest/v1/answer_feedback', row, opts); }

// Counts one answer shown. Never throws and never waits long: a counter must
// not slow down or break a decode.
async function countAnswer({ surface, kind, gate }, opts = {}) {
  try {
    await supa('/rest/v1/rpc/bump_answer_count', { p_surface: surface, p_kind: kind, p_gate: gate || 'off' }, { timeoutMs: 800, ...opts });
  } catch (e) {
    console.error('explain: answer count failed: ' + String((e && e.message) || e));
  }
}

module.exports = { validateFeedback, saveFeedback, countAnswer, newAnswerId, kindOf, surfaceOf, REASONS };
