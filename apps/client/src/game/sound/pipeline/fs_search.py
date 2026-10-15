# Parse a saved Freesound search HTML page (untrusted data) and print candidate rows.
import sys, re, html
for path in sys.argv[1:]:
    s = open(path, encoding='utf-8', errors='replace').read()
    print('##', path)
    for m in re.finditer(r'class="bw-player"(.*?)tabindex', s, re.S):
        b = m.group(1)
        g = lambda k: (re.search(k + r'="([^"]*)"', b) or [None, ''])[1]
        rest = s[m.end():m.end() + 4000]
        r = re.search(r'Average rating of ([0-9.]+)', rest)
        print(f"{g('data-sound-id'):>7} {float(g('data-duration') or 0):7.1f}s dl={g('data-num-downloads'):>6} r={r.group(1) if r else '-':>4} {g('data-username')[:18]:18} {html.unescape(g('data-title'))[:80]}")
