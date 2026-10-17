#!/usr/bin/env python3
"""Static file server for the Hollowmere demo (owner: deploy; docs/DEMO.md §6). Runs ON render-host.

Python's http.server, plus:
  * Cache-Control: no-store on every response, so a browser always sees the tree tools/demo-serve.sh just synced
    (plain `python3 -m http.server` sends Last-Modified only and browsers then reuse stale ES modules heuristically);
  * correct JavaScript MIME types for .js / .mjs (module scripts are rejected with a wrong type);
  * refuses wildcard binds (0.0.0.0 / :: / empty): the demo is only for the tailnet (or 127.0.0.1).

  python3 tools/demo-serve.py --bind <tailnet-ip> --port 8090 [--dir ~/pixel3d]
Normally started / stopped by tools/demo-serve.sh (pid file + log); run directly only for debugging.
"""
import argparse, functools, http.server, os, sys

ap = argparse.ArgumentParser()
ap.add_argument('--bind', required=True)
ap.add_argument('--port', type=int, default=8090)
ap.add_argument('--dir', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
a = ap.parse_args()
if a.bind in ('', '0.0.0.0', '::', '[::]', '*'):
    sys.exit('demo-serve.py: refusing a wildcard bind; pass a specific address (the Tailscale IP or 127.0.0.1)')


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
                      '.wasm': 'application/wasm', '.md': 'text/plain; charset=utf-8'}

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def send_head(self):
        # never answer 304 from If-Modified-Since: always a fresh 200 (no-store semantics)
        if 'If-Modified-Since' in self.headers:
            del self.headers['If-Modified-Since']
        if self.path in ('', '/'):
            self.path = '/demo.html'
        return super().send_head()

    def log_message(self, fmt, *args):
        sys.stderr.write('%s %s\n' % (self.log_date_time_string(), fmt % args))


http.server.ThreadingHTTPServer.allow_reuse_address = True
srv = http.server.ThreadingHTTPServer((a.bind, a.port), functools.partial(Handler, directory=os.path.abspath(a.dir)))
print(f'demo-serve: http://{a.bind}:{a.port}/demo.html  (dir {os.path.abspath(a.dir)}, pid {os.getpid()})', flush=True)
try:
    srv.serve_forever()
except KeyboardInterrupt:
    pass
