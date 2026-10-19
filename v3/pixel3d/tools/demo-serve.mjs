// STUB (owner: deploy; docs/DEMO.md §6). Static server for the demo: serves the repo root (incl. node_modules/three)
// on 127.0.0.1 so a desktop browser can open http://127.0.0.1:<port>/demo.html. No build step.
//   node tools/demo-serve.mjs [--port 8770] [--host 127.0.0.1]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.css': 'text/css', '.wasm': 'application/wasm', '.md': 'text/plain' };
const port = Number(opt('port', 8770)), host = opt('host', '127.0.0.1');
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = path.join(ROOT, decodeURIComponent(u.pathname === '/' ? '/demo.html' : u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(p).pipe(res);
}).listen(port, host, () => console.log(`demo: http://${host}:${port}/demo.html`));
