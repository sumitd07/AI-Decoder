'use strict';
// POST { answer_id, vote, reason?, comment?, kind, surface, sentence,
//        answer: { restatement, terms, gaps }, meta: { gate, prompt_version, shelf_version } }
// → 204. The thumbs up / down under a decoded answer (web Decode box and the
// extension's panel). Validation and storage in explain/feedback.js.

const { validateFeedback, saveFeedback } = require('../../explain/feedback');

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('cache-control', 'no-store');
  if (body === undefined) return res.end();
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res, opts = {}) {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return send(res, 405, { error: 'method_not_allowed' });
  }
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return send(res, 400, { error: 'invalid_json' }); }
  }
  const v = validateFeedback(body);
  if (v.error) return send(res, 400, { error: v.error });
  try {
    await (opts.save || saveFeedback)(v.row);
    return send(res, 204);
  } catch (e) {
    console.error('feedback: ' + String((e && e.message) || e));
    return send(res, 502, { error: 'feedback_failed' });
  }
};
