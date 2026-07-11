// Tiny static server for the Decoder web app preview.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = '/Users/shibbypills/Documents/Mitsu/AI Dictionary/web';
const EXT = '/Users/shibbypills/Documents/Mitsu/AI Dictionary/extension';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml' };

http.createServer((req, res) => {
  let url = req.url.split('?')[0];
  let base = ROOT;
  if (url.startsWith('/extension/')) { base = EXT; url = url.slice('/extension'.length); }
  if (url === '/') url = '/index.html';
  if (url === '/privacy') url = '/privacy.html';
  const file = path.join(base, decodeURIComponent(url));
  if (!file.startsWith(base)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(8743, () => console.log('decoder preview on http://localhost:8743'));
