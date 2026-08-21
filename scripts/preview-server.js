// Tiny static server for the Decoder web app preview.
// Also routes POST /api/explain to web/api/explain.js. There is no mock answer:
// it either runs the real pipeline or fails with a clear reason.
const http = require('http');
const fs = require('fs');
const path = require('path');

// Load .env ourselves. The launch config starts this with `node scripts/preview-server.js`
// and no shell wrapper, so without this the API key is simply absent and every
// Decode returns a 502 that looks like a broken pipeline rather than a missing key.
(function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const val = m[2].trim().replace(/^["']|["']$/g, '');
    if (!process.env[m[1]]) process.env[m[1]] = val;
  }
})();
// The endpoint defaults to the mock provider unless told otherwise; a preview with
// a key present should be talking to the real model.
if (process.env.GEMINI_API_KEY && !process.env.LLM_PROVIDER) process.env.LLM_PROVIDER = 'gemini';

const ROOT = '/Users/shibbypills/Documents/Mitsu/AI Dictionary/web';
const EXT = '/Users/shibbypills/Documents/Mitsu/AI Dictionary/extension';
// Surface 1b's harness. Tracked in the repo, not scratch/, so it survives a session.
const PREVIEW = '/Users/shibbypills/Documents/Mitsu/AI Dictionary/preview';
const EXPLAIN_HANDLER_PATH = path.join(ROOT, 'api', 'explain.js');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml' };
const MAX_BODY_BYTES = 200 * 1024; // generous cap for a one-sentence payload
const SENTENCE_CAP = 1000; // mirrors web/api/explain.js's documented cap (explain/CONTRACT.md)

// The mock payload that used to live here has been removed. It served a real
// purpose before the pipeline existed — the UI had to be verifiable with no key —
// but a canned answer that renders identically to a real one is a liability now
// that the backend works: invented terms show up on screen looking like model
// output. If the key is missing the endpoint fails honestly instead.

function vercelizeRes(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => { if (!res.headersSent) res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); return res; };
  res.send = (body) => {
    if (body && typeof body === 'object') return res.json(body);
    res.end(body == null ? '' : String(body));
    return res;
  };
  return res;
}

function readBody(req, cb) {
  let size = 0;
  const chunks = [];
  let aborted = false;
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      aborted = true;
      res_413(req._res);
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => { if (!aborted) cb(Buffer.concat(chunks).toString('utf8')); });
  req.on('error', () => {});
}
function res_413(res) { if (res && !res.headersSent) { res.writeHead(413, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Body too large' })); } }

// Fail honestly. Never invent an answer: a fabricated restatement and made-up gap
// terms render identically to real output, and a reader (or the person judging the
// UI) cannot tell them apart.
function serveUnavailable(res, reason) {
  console.warn(`\n[decoder-preview] /api/explain unavailable: ${reason}\n`);
  res.writeHead(503, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'explain_unavailable', message: "The decoder isn't running. Check GEMINI_API_KEY in .env and restart the preview." }));
}

async function handleExplain(req, res, searchParams) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json', Allow: 'POST' });
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }
  req._res = res;
  readBody(req, async (raw) => {
    let body;
    try { body = raw ? JSON.parse(raw) : {}; }
    catch (e) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'Invalid JSON body' })); }
    const sentence = typeof body.sentence === 'string' ? body.sentence : '';

    const mode = searchParams.get('mode'); // test hooks for failure states: 500 | malformed | network | 400

    // Error shape mirrors web/api/explain.js: { error: <machine code>, message: <human text> }.
    if (mode === 'network') { req.socket.destroy(); return; } // simulate a dropped connection (fetch throws)
    if (mode === '500') { res.writeHead(500, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'mock_internal_error', message: 'Something went wrong on this end. Try again in a moment.' })); }
    if (mode === 'malformed') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{not valid json'); }
    if (mode === '400') { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'missing_sentence', message: 'Paste a sentence to decode.' })); }

    // Same validation the real handler is contracted to do (explain/CONTRACT.md).
    if (!sentence.trim()) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'missing_sentence', message: 'Paste a sentence to decode.' })); }
    if (sentence.length > SENTENCE_CAP) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'sentence_too_long', message: `That's ${sentence.length} characters. Decode works on one sentence — keep it under ${SENTENCE_CAP}.` })); }

    if (!fs.existsSync(EXPLAIN_HANDLER_PATH)) return serveUnavailable(res, 'web/api/explain.js not present');
    {
      try {
        delete require.cache[require.resolve(EXPLAIN_HANDLER_PATH)];
        const mod = require(EXPLAIN_HANDLER_PATH);
        const handler = typeof mod === 'function' ? mod : mod.default;
        if (typeof handler !== 'function') throw new Error('web/api/explain.js did not export a handler function');
        req.body = body;
        vercelizeRes(res);
        await handler(req, res);
        return;
      } catch (e) {
        return serveUnavailable(res, `handler threw: ${e && e.message}`);
      }
    }
  });
}

http.createServer((req, res) => {
  const full = new URL(req.url, 'http://localhost');
  const pathname = full.pathname;

  if (pathname === '/api/explain') {
    handleExplain(req, res, full.searchParams);
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }

  let url = pathname;
  let base = ROOT;
  if (url.startsWith('/extension/')) { base = EXT; url = url.slice('/extension'.length); }
  if (url.startsWith('/preview/')) { base = PREVIEW; url = url.slice('/preview'.length); }
  if (url === '/') url = '/index.html';
  if (url === '/privacy') url = '/privacy.html';
  const file = path.join(base, decodeURIComponent(url));
  if (!file.startsWith(base)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    // Dev hook: extension/popup.html has no chrome.* in a normal tab. With
    // ?shim=1 a stand-in is injected so the real popup markup can be looked at.
    if (full.searchParams.get('shim') === '1' && path.extname(file) === '.html') {
      const html = data.toString('utf8').replace('<head>', '<head>\n<script src="/preview/chrome-shim.js"></script>');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(html);
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(8743, () => {
  const key = Boolean(process.env.GEMINI_API_KEY);
  console.log('decoder preview on http://localhost:8743');
  console.log(key
    ? `  /api/explain -> real pipeline (${process.env.LLM_PROVIDER || 'mock'}/${process.env.LLM_MODEL || 'gemini-flash-lite-latest'})`
    : '  /api/explain -> NO GEMINI_API_KEY in .env — every Decode will return 503');
});
