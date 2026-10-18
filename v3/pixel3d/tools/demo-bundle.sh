#!/usr/bin/env bash
# Build the SELF-CONTAINED static bundle of the Hollowmere demo (owner: deploy; docs/DEMO.md "How to open / publish").
# Run on the Mac:
#   tools/demo-bundle.sh                 # sync the tree, build on render-host, rsync back to ./dist/v3-art-demo/
#   tools/demo-bundle.sh verify          # serve the remote dist/ under /v3-art-demo/ on 127.0.0.1:8091 with EXACTLY the
#                                        # production CSP header and run the smoke test + its --tour against it (zero CSP
#                                        # violations, the same-prefix request check), then stop -> shots/bundle-final/
#   VERIFY_PLAY=1 tools/demo-bundle.sh verify   # + the scripted playtest (tools/demo-play.mjs) against the bundle
#   tools/demo-bundle.sh all             # build + verify
# Output: dist/v3-art-demo/
#   index.html                 demo.html WITHOUT the import map (CSP script-src 'self' forbids inline scripts): the
#                              last build step, tools/demo-bundle-csp.py, rewrites every bare three / three/addons/
#                              import in the bundle to a relative ./vendor/three/... path and removes the map
#   src/**                     the runtime modules / css / json (no .py / .sh / .md tooling; not src/main.js, the
#                              index.html scene runner, which imports scenes/). src/ui/** (the UI asset library: its
#                              bake / render helpers import scenes/) ships ONLY the modules the demo's import graph
#                              actually reaches (static + literal dynamic imports, followed from src/demo/**)
#   out/ui/<name>.{png,json,css}  exactly the baked UI files listed in src/demo/ui-assets.json (portrait atlases, the
#                              panel / notebook DOM skins); every other out/ file and every other .png is refused
#   characters/<id>.js         only the ids in src/demo/roster.json (the specs the demo can import)
#   vendor/three/...           only the three r170 files reached from the import map (three.module.js + the used addons
#                              and their relative imports) + three's LICENSE
# Never shipped: tools/ shots/ docs/ research/ refs/ (private third-party images) out/ (except the ui-assets.json list)
# scenes/ node_modules/ pipeline/.
# Every URL is RELATIVE: the bundle works served at any sub-path (e.g. https://host/v3-art-demo/ -- note the trailing
# slash; a host should redirect /v3-art-demo -> /v3-art-demo/ as python http.server and most static hosts do).
# The build fails on: inline scripts / bare three imports left after the CSP pass, eval / new Function / string timers /
# javascript: URLs / data: workers / inline on*= handlers (the host's CSP has no 'unsafe-eval' / 'unsafe-inline' script), a relative import that is not in the bundle, a bare import the import map does not cover, an
# absolute ('/x' or scheme) URL in index.html or in an import / new URL(..., import.meta.url), a forbidden path.
# Overrides: PIXEL3D_HOST / PIXEL3D_RDIR (as tools/remote.sh), BUNDLE_PORT (8091, bound to 127.0.0.1 only).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST=${PIXEL3D_HOST:-render-host}
RDIR=${PIXEL3D_RDIR:-pixel3d}
PORT=${BUNDLE_PORT:-8091}
OUTREL=dist/v3-art-demo

if [[ "${1:-}" != "--here" ]]; then
  # ------------------------------------------------------------------ on the Mac
  CMD=${1:-build}
  case "$CMD" in build|verify|all) ;; *) echo "usage: $0 [build|verify|all]" >&2; exit 2;; esac
  if [[ $CMD == build || $CMD == all ]]; then
    "$ROOT/tools/remote.sh" true
    "$ROOT/tools/remote.sh" --no-sync bash tools/demo-bundle.sh --here build
    mkdir -p "$ROOT/$OUTREL"
    rsync -az --delete "$HOST:$RDIR/$OUTREL/" "$ROOT/$OUTREL/"
    echo "pulled $HOST:$RDIR/$OUTREL/ -> $ROOT/$OUTREL/ ($(find "$ROOT/$OUTREL" -type f | wc -l | tr -d ' ') files, $(du -sk "$ROOT/$OUTREL" | cut -f1) KiB on disk)"
  fi
  if [[ $CMD == verify || $CMD == all ]]; then
    [[ $CMD == verify ]] && "$ROOT/tools/remote.sh" true   # demo-smoke.mjs may have changed
    "$ROOT/tools/remote.sh" --no-sync env BUNDLE_PORT="$PORT" VERIFY_PLAY="${VERIFY_PLAY:-0}" bash tools/demo-bundle.sh --here verify "${@:2}"
  fi
  exit 0
fi

# -------------------------------------------------------------------- on render-host (cwd = ~/pixel3d via tools/remote.sh)
shift
CMD=${1:-build}; shift || true
cd "$ROOT"

build() {
  rm -rf "$OUTREL"
  node --input-type=module - "$OUTREL" <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
const OUT = process.argv[2];
const ROOT = process.cwd();
const FORBIDDEN = /^(tools|shots|docs|research|refs|out|scenes|pipeline|node_modules)\//;
const files = new Map();   // bundle path -> source path
const die = (m) => { console.error('demo-bundle: ' + m); process.exit(1); };
const add = (dst, src, { asset = false } = {}) => {
  if (FORBIDDEN.test(dst) && !asset) die(`refusing to ship ${dst}`);
  if (!fs.existsSync(src)) die(`missing ${src}`);
  files.set(dst, src);
};
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);

// 1. src/** runtime files; src/ui/** (the UI asset library) only as the import graph reaches it (step 4)
for (const f of walk('src')) {
  if (!/\.(js|css|json)$/.test(f) || f === 'src/main.js') continue;
  if (f.startsWith('src/ui/')) continue;
  add(f, f);
}
// 1b. the baked UI files the demo fetches at runtime (src/demo/ui-assets.json): exactly out/ui/<name>.{png,json,css}
const UI_ASSETS = JSON.parse(fs.readFileSync('src/demo/ui-assets.json', 'utf8')).files ?? [];
for (const f of UI_ASSETS) {
  if (!/^out\/ui\/[a-z0-9][a-z0-9-]*\.(png|json|css)$/.test(f)) die(`ui-assets.json: not a baked UI file: ${f}`);
  add(f, f, { asset: true });
}
const uiReached = [];
// 2. character specs offered by the roster
const roster = JSON.parse(fs.readFileSync('src/demo/roster.json', 'utf8'));
const ids = new Set([...(roster.characters ?? []).map((c) => c.id), ...(roster.complete ?? []), ...(roster.shipped ?? [])]);
// never ship a cast member the user asked to skip (pipeline/skip.txt), even if a stale roster lists it
const skipped = new Set((fs.existsSync('pipeline/skip.txt') ? fs.readFileSync('pipeline/skip.txt', 'utf8') : '')
  .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')));
for (const id of ids) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) die(`bad roster id ${id}`);
  if (skipped.has(id)) die(`roster lists skipped id ${id} (pipeline/skip.txt): re-run tools/demo-roster.mjs`);
  add(`characters/${id}.js`, `characters/${id}.js`);
}
// 3. the page: demo.html -> index.html, import map -> ./vendor/three/
let html = fs.readFileSync('demo.html', 'utf8');
const MAP_FROM = { three: './node_modules/three/build/three.module.js', 'three/addons/': './node_modules/three/examples/jsm/' };
const MAP_TO = { three: './vendor/three/build/three.module.js', 'three/addons/': './vendor/three/examples/jsm/' };
const m = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
if (!m) die('demo.html has no import map');
const map = JSON.parse(m[1]);
for (const [k, v] of Object.entries(MAP_FROM)) if (map.imports?.[k] !== v) die(`import map entry ${k} is ${map.imports?.[k]}, expected ${v}`);
if (Object.keys(map.imports).length !== 2 || map.scopes) die('import map changed shape: update tools/demo-bundle.sh');
html = html.replace(m[0], `<script type="importmap">\n${JSON.stringify({ imports: MAP_TO }, null, 1)}\n</script>`);
for (const [, attr, url] of html.matchAll(/\b(src|href)\s*=\s*["']([^"']*)["']/g)) {
  if (/^([a-z]+:|\/)/i.test(url)) die(`index.html: absolute ${attr}="${url}"`);
  const p = path.normalize(url.split(/[?#]/)[0]);
  if (!files.has(p)) die(`index.html: ${attr}="${url}" is not in the bundle`);
}

// 4. three: the closure of the import map targets that the shipped modules actually use
const T = 'node_modules/three/';
const bare = new Set();
const vend = (rel) => add(`vendor/three/${rel}`, T + rel);
const specsOf = (src) => {
  // comments mention example imports: drop block comments that start a line and whole-line // comments, and a
  // trailing ' // ...' (preceded by whitespace; URLs inside strings have no space before '//')
  const s = fs.readFileSync(src, 'utf8').replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '')
    .split('\n').filter((l) => !/^\s*\/\//.test(l)).map((l) => l.replace(/\s\/\/\s.*$/, '')).join('\n');
  const out = [];
  for (const r of [/\b(?:import|export)\s[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g, /\bimport\s*['"]([^'"]+)['"]/g,
                   /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, /\bnew URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url/g])
    for (const x of s.matchAll(r)) out.push({ spec: x[1], kind: 'lit' });
  for (const x of s.matchAll(/\b(?:import\s*\(|new URL\()\s*`([^`]+)`/g)) out.push({ spec: x[1], kind: 'tpl' });
  return out;
};
const queue = [...files.keys()].filter((f) => f.endsWith('.js'));
const seen = new Set();
let tplChecked = 0;
const extraChars = [];
while (queue.length) {
  const dst = queue.shift();
  if (seen.has(dst)) continue;
  seen.add(dst);
  for (const { spec, kind } of specsOf(files.get(dst))) {
    if (/^[a-z]+:/i.test(spec) || spec.startsWith('/')) die(`${dst}: absolute URL '${spec}'`);
    if (kind === 'tpl') {   // import(`./house-${i}.js`): at least one bundled file must match
      const rx = new RegExp('^' + path.normalize(path.join(path.dirname(dst), spec)).split(/\$\{[^}]*\}/).map((p) => p.replace(/[.*+?^()|[\]\\]/g, '\\$&')).join('[^/]*') + '$');
      if (!/^\.\.?\//.test(spec)) continue;
      if (![...files.keys()].some((f) => rx.test(f))) die(`${dst}: template import \`${spec}\` matches nothing in the bundle`);
      tplChecked++;
      continue;
    }
    if (spec === 'three' || spec.startsWith('three/addons/')) {
      const rel = spec === 'three' ? 'build/three.module.js' : 'examples/jsm/' + spec.slice('three/addons/'.length);
      if (!files.has('vendor/three/' + rel)) { vend(rel); queue.push('vendor/three/' + rel); }
      bare.add(spec);
      continue;
    }
    if (!/^\.\.?\//.test(spec)) die(`${dst}: bare import '${spec}' not covered by the import map`);
    const tgt = path.normalize(path.join(path.dirname(dst), spec.split(/[?#]/)[0]));
    if (tgt.startsWith('..')) die(`${dst}: '${spec}' leaves the bundle`);
    if (!files.has(tgt)) {
      if (tgt.startsWith('vendor/three/')) { vend(tgt.slice('vendor/three/'.length)); queue.push(tgt); }
      else if (/^characters\/[a-z0-9-]+\.js$/.test(tgt) && fs.existsSync(tgt)) { add(tgt, tgt); queue.push(tgt); extraChars.push(tgt); }   // e.g. life's mannequin
      else if (/^src\/ui\/[a-z0-9/_-]+\.js$/i.test(tgt) && fs.existsSync(tgt)) { add(tgt, tgt); queue.push(tgt); uiReached.push(tgt); }   // the UI library, as reached
      else die(`${dst}: imports '${spec}' -> ${tgt}, not in the bundle`);
    }
  }
}
add('vendor/three/LICENSE', T + 'LICENSE');

// 5. write
for (const [dst, src] of files) {
  fs.mkdirSync(path.join(OUT, path.dirname(dst)), { recursive: true });
  fs.copyFileSync(src, path.join(OUT, dst));
}
fs.writeFileSync(path.join(OUT, 'index.html'), html);
let bytes = fs.statSync(path.join(OUT, 'index.html')).size;
for (const dst of files.keys()) bytes += fs.statSync(path.join(OUT, dst)).size;
const n = files.size + 1;
const byTop = {};
for (const dst of [...files.keys(), 'index.html']) { const k = dst.split('/').slice(0, dst.startsWith('src/') || dst.startsWith('vendor/') || dst.startsWith('out/') ? 2 : 1).join('/'); byTop[k] = (byTop[k] ?? 0) + fs.statSync(path.join(OUT, dst)).size; }
console.log(`bundle ${OUT}: ${n} files, ${bytes} bytes (${(bytes / 1048576).toFixed(2)} MiB); three: ${[...files.keys()].filter((f) => f.startsWith('vendor/')).join(', ')}`);
console.log('  bare imports: ' + [...bare].sort().join(', ') + `; template imports checked: ${tplChecked}; characters: ${ids.size} roster + ${extraChars.length} imported (${extraChars.join(', ')})`);
console.log(`  src/ui reached: ${uiReached.length} modules (${uiReached.map((f) => f.slice(7)).sort().join(', ')}); ui assets: ${UI_ASSETS.join(', ')}`);
for (const [k, v] of Object.entries(byTop).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(9)}  ${k}`);
NODE
  # belt and braces: nothing forbidden, no private images at all; the only images (and the only files under out/)
  # are the baked UI files listed in src/demo/ui-assets.json
  local allowed bad
  allowed=$(python3 -c "import json; print('\n'.join('$OUTREL/' + f for f in json.load(open('src/demo/ui-assets.json'))['files']))")
  bad=$(find "$OUTREL" -type f \( -path '*/refs/*' -o -path '*/tools/*' -o -path '*/shots/*' -o -path '*/docs/*' -o -path '*/research/*' -o -path "$OUTREL/out/*" -o -name '*.png' -o -name '*.jpg' -o -name '*.md' -o -name '*.py' -o -name '*.sh' \) | grep -vxF -f <(printf '%s\n' "$allowed") || true)
  if [[ -n "$bad" ]]; then
    echo "demo-bundle: forbidden files in the bundle:" >&2
    echo "$bad" >&2
    exit 1
  fi
  # no bundled module may reach scenes/ (the UI library's bake / render helpers do; the demo must not import them)
  if grep -rlE "(from|import)[[:space:]]*\(?[[:space:]]*['\"][./]*scenes/" --include='*.js' "$OUTREL" | grep -q .; then
    echo "demo-bundle: a bundled module imports scenes/:" >&2; grep -rlE "(from|import)[[:space:]]*\(?[[:space:]]*['\"][./]*scenes/" --include='*.js' "$OUTREL" >&2; exit 1
  fi
  # LAST step: make it CSP-safe (the host sends script-src 'self': no inline scripts, so no inline import map). Bare
  # `three` / `three/addons/...` specifiers -> relative paths into ./vendor/three/, the import map removed.
  python3 tools/demo-bundle-csp.py "$OUTREL"
  # and nothing that needs 'unsafe-eval' / 'unsafe-inline' script / a non-'self' fetch: eval, new Function, string
  # timers, javascript: URLs, inline on*= handlers in the page, workers from data: URLs
  local csp_bad
  csp_bad=$(grep -rnoE '(^|[^A-Za-z0-9_$.])eval[[:space:]]*\(|new[[:space:]]+Function[[:space:]]*\(|set(Timeout|Interval)[[:space:]]*\([[:space:]]*["'"'"'`]|javascript:|new[[:space:]]+(Shared)?Worker[[:space:]]*\([[:space:]]*["'"'"'`]data:' \
    --include='*.js' --include='*.html' "$OUTREL" | cut -c1-160 || true)
  csp_bad+=$(grep -noE '<[a-zA-Z][^>]*[[:space:]]on[a-z]+[[:space:]]*=' "$OUTREL/index.html" | cut -c1-160 || true)
  if [[ -n "$csp_bad" ]]; then echo "demo-bundle: CSP-unsafe code in the bundle (script-src 'self' only):" >&2; echo "$csp_bad" >&2; exit 1; fi
  echo "built $OUTREL ($(find "$OUTREL" -type f | wc -l) files, $(du -sb "$OUTREL" | cut -f1) bytes); CSP-safe (no inline script, no eval)"
}

verify() {   # serve <tmp>/v3-art-demo -> dist/v3-art-demo on 127.0.0.1:$PORT and smoke-test it under the prefix
  [[ -f "$OUTREL/index.html" ]] || { echo "no $OUTREL/index.html: build first" >&2; exit 1; }
  if [[ -n "$(ss -Htln "sport = :$PORT" 2>/dev/null)" ]]; then echo "port $PORT busy; set BUNDLE_PORT" >&2; exit 5; fi
  SITE=$(mktemp -d)
  # the served prefix holds the bundle in the LIVE (published) layout of tools/demo-publish.sh (critic P1-1: a
  # document-relative asset URL 404'd only there): every entry under v/<hash>/, only index.html at the root, its
  # href / src rewritten to ./v/<hash>/ exactly as demo-publish.sh does. Plus (only here, never in the bundle)
  # demo.html = that same rewritten page, so tools/demo-play.mjs (which opens <base>/demo.html) runs on it: VERIFY_PLAY=1.
  # VERIFY_FLAT=1 serves the old flat layout instead.
  mkdir "$SITE/v3-art-demo"
  if [[ "${VERIFY_FLAT:-0}" == 1 ]]; then
    for e in "$ROOT/$OUTREL"/*; do ln -s "$e" "$SITE/v3-art-demo/$(basename "$e")"; done
    ln -s "$ROOT/$OUTREL/index.html" "$SITE/v3-art-demo/demo.html"
  else
    local VH; VH=$(cd "$ROOT/$OUTREL" && find . -type f ! -name index.html -print0 | LC_ALL=C sort -z | xargs -0 sha1sum | sha1sum | cut -c1-10)
    mkdir -p "$SITE/v3-art-demo/v/$VH"
    for e in "$ROOT/$OUTREL"/*; do [[ "$(basename "$e")" == index.html ]] || ln -s "$e" "$SITE/v3-art-demo/v/$VH/$(basename "$e")"; done
    sed -E "s#(href|src)=\"\./#\1=\"./v/$VH/#g" "$ROOT/$OUTREL/index.html" > "$SITE/v3-art-demo/index.html"
    grep -q "./v/$VH/src/demo/main.js" "$SITE/v3-art-demo/index.html" || { echo "verify: the staged index.html rewrite failed" >&2; return 1; }
    cp "$SITE/v3-art-demo/index.html" "$SITE/v3-art-demo/demo.html"
    echo "staged layout: index.html + v/$VH/ (as tools/demo-publish.sh)"
  fi
  # the production host's CSP, sent EXACTLY (keep in sync with the clocktower server's demo route)
  local CSP="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'"
  cat > "$SITE/csp-serve.py" <<'PY'
# tiny static server for the bundle check: every response carries the host's CSP header (argv[3]), no-store, JS MIME,
# /v3-art-demo -> /v3-art-demo/ redirect (python's directory redirect), 127.0.0.1 only
import functools, http.server, sys
port, root, csp = int(sys.argv[1]), sys.argv[2], sys.argv[3]
class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json'}
    def end_headers(self):
        self.send_header('Content-Security-Policy', csp)
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def send_head(self):
        if 'If-Modified-Since' in self.headers: del self.headers['If-Modified-Since']   # always a fresh 200
        return super().send_head()
    def log_message(self, fmt, *a): sys.stderr.write('%s %s\n' % (self.log_date_time_string(), fmt % a))
http.server.ThreadingHTTPServer.allow_reuse_address = True
print(f'csp-serve http://127.0.0.1:{port}/ root {root}', flush=True)
http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(H, directory=root)).serve_forever()
PY
  python3 -u "$SITE/csp-serve.py" "$PORT" "$SITE" "$CSP" > "$SITE/serve.log" 2>&1 &
  SPID=$!
  trap 'kill $SPID 2>/dev/null || true; rm -rf "$SITE"' EXIT
  for _ in $(seq 1 50); do [[ -n "$(ss -Htln "sport = :$PORT" 2>/dev/null)" ]] && break; sleep 0.1; done
  echo "redirect check: $(curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}' "http://127.0.0.1:$PORT/v3-art-demo")"
  local got; got=$(curl -sI "http://127.0.0.1:$PORT/v3-art-demo/" | tr -d '\r' | sed -n 's/^Content-Security-Policy: //Ip')
  [[ "$got" == "$CSP" ]] && echo "CSP header check: exact" || { echo "CSP header check: got '$got'" >&2; return 1; }
  local rc=0
  node tools/demo-smoke.mjs --base "http://127.0.0.1:$PORT/v3-art-demo" --page '' --out "${VERIFY_OUT:-shots/bundle-final/smoke}" \
    --expect-csp "$CSP" --tour "$@" || rc=$?
  if [[ "${VERIFY_PLAY:-0}" == 1 ]]; then
    node tools/demo-play.mjs --base "http://127.0.0.1:$PORT/v3-art-demo" --out "${VERIFY_PLAY_OUT:-shots/bundle-final/play}" || rc=$?
  fi
  echo "server requests: $(grep -c '"GET ' "$SITE/serve.log" || true), non-200: $(grep '"GET ' "$SITE/serve.log" | grep -vc '" 200 ' || true)"
  grep '"GET ' "$SITE/serve.log" | grep -v '" 200 ' | head -5 || true
  # (critic P1-1) any 404 in the staged layout fails the verify (the smoke / play checks count them too)
  local n404; n404=$(grep '"GET ' "$SITE/serve.log" | grep -c '" 404 ' || true)
  echo "404s in the staged layout: $n404"
  [[ "$n404" == 0 ]] || rc=1
  return $rc
}

case "$CMD" in
  build) build ;;
  verify) verify "$@" ;;
  *) echo "unknown $CMD" >&2; exit 2 ;;
esac
