#!/usr/bin/env python3
"""Make a demo bundle CSP-safe (script-src 'self'): no inline scripts.

The import map in index.html is an inline <script>, which the hosting CSP blocks. This rewrites every bare
`three` / `three/addons/...` specifier in the bundle's .js files to a relative path into ./vendor/three/ and
removes the import map. Idempotent. Usage: python3 tools/demo-bundle-csp.py dist/v3-art-demo
"""
import os, re, sys

root = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else 'dist/v3-art-demo')
three = os.path.join(root, 'vendor/three/build/three.module.js')
addons = os.path.join(root, 'vendor/three/examples/jsm')
assert os.path.isfile(three), three

SPEC = re.compile(r"""(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(three(?:/addons/[^'"]+)?)\2""")

def target(spec):
    return three if spec == 'three' else os.path.join(addons, spec[len('three/addons/'):])

changed = files = 0
for d, _, names in os.walk(root):
    for n in names:
        if not n.endswith('.js'):
            continue
        p = os.path.join(d, n)
        s = open(p, encoding='utf-8').read()
        def rep(m):
            t = target(m.group(3))
            if not os.path.isfile(t):
                sys.exit(f'missing {t} (imported by {p})')
            rel = os.path.relpath(t, d).replace(os.sep, '/')
            if not rel.startswith('.'):
                rel = './' + rel
            return f'{m.group(1)}{m.group(2)}{rel}{m.group(2)}'
        s2 = SPEC.sub(rep, s)
        if s2 != s:
            open(p, 'w', encoding='utf-8').write(s2)
            changed += 1
        files += 1

idx = os.path.join(root, 'index.html')
h = open(idx, encoding='utf-8').read()
h2 = re.sub(r'\s*<script type="importmap">.*?</script>', '', h, flags=re.S)
open(idx, 'w', encoding='utf-8').write(h2)
inline = [m for m in re.finditer(r'<script(?![^>]*\bsrc=)[^>]*>', h2)]
left = sum(1 for d, _, ns in os.walk(root) for n in ns if n.endswith('.js')
           and re.search(r"""(from|import)\s*\(?\s*['"]three""", open(os.path.join(d, n), encoding='utf-8').read()))
print(f'rewrote {changed}/{files} js files; import map removed: {h != h2}; inline scripts left: {len(inline)}; bare three imports left: {left}')
sys.exit(1 if inline or left else 0)
