# Parse a saved Freesound sound page (untrusted data): license, author, title, HQ previews, date.
import sys, re, html
for path in sys.argv[1:]:
    s = open(path, encoding='utf-8', errors='replace').read()
    lic = sorted(set(re.findall(r'https?://creativecommons\.org/[a-z/.0-9-]+', s)))
    lname = sorted(set(re.findall(r'(Creative Commons 0|Attribution NonCommercial[^<"]{0,10}|Attribution[^<"]{0,12}|Sampling\+)', s)))
    og = lambda p: (re.search(r'<meta property="og:' + p + r'" content="([^"]*)"', s) or [None, ''])[1]
    hq = sorted(set(re.findall(r'https://cdn\.freesound\.org/previews/[0-9]+/[0-9_]+-hq\.(?:mp3|ogg)', s)))
    date = (re.search(r'(\w+ \d{1,2}(?:st|nd|rd|th)?, \d{4})', s) or [None, ''])[1]
    user = (re.search(r'data-username="([^"]+)"', s) or [None, ''])[1]
    print(path, '|', html.unescape(og('title')), '| user=', user, '| lic=', lic, lname, '| date=', date, '| hq=', hq)
