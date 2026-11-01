// Local test server: serves out/ like Vercel (trailing slash, index.html) and runs the real api/live.js.
// Live data is off unless LIVE_ENABLED=1, DB_CLIENT_ID and DB_API_KEY are set (e.g. from a local .env file).
//   node tests/tools/serve.mjs              # :4599, live off
//   node --env-file=.env.local tests/tools/serve.mjs   # with LIVE_ENABLED=1 and DB keys: real live data
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const live = createRequire(import.meta.url)(path.join(ROOT, 'api/live.js'));
const PORT = Number(process.env.PORT || 4599);
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.woff2': 'font/woff2', '.xml': 'application/xml' };
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/api/live')) return live(req, res);
  if (u.pathname.startsWith('/api/')) { res.setHeader('content-type', 'application/json'); return res.end('{"ok":false}'); }
  let p = path.join(ROOT, 'out', decodeURIComponent(u.pathname));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { res.statusCode = 404; return res.end('not found'); }
  res.setHeader('content-type', T[path.extname(p)] || 'application/octet-stream');
  res.end(fs.readFileSync(p));
}).listen(PORT, '127.0.0.1', () => console.log(`serving out/ on http://127.0.0.1:${PORT} (live ${process.env.LIVE_ENABLED === '1' ? 'on' : 'off'})`));
