#!/usr/bin/env bash
# Publish dist/v3-art-demo to the live demo folder with CACHE-BUSTED paths (owner: main session).
#   tools/demo-publish.sh            # needs ssh access to the game host (CT_DEMO_HOST, default from ~/.ssh/config alias)
# Why: Cloudflare overrides the origin's no-cache with a 4 h browser TTL for .js/.css, so visitors kept old modules after
# a release. Every release now lives under v/<content-hash>/ (new URLs = never stale); only index.html sits at the root
# (served no-cache) and points at the current version. The 3 newest versions are kept for tabs opened before a release.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/dist/v3-art-demo"
HOST=${CT_DEMO_HOST:-game-host}
DEST=${CT_DEMO_DIR:-/srv/clocktower/demos/v3-art-demo}
[[ -f $SRC/index.html ]] || { echo "no bundle at $SRC (run tools/demo-bundle.sh)" >&2; exit 1; }

HASH=$(cd "$SRC" && find . -type f ! -name index.html -print0 | LC_ALL=C sort -z | xargs -0 shasum | shasum | cut -c1-10)
STAGE=$(mktemp -d)
mkdir -p "$STAGE/v/$HASH"
(cd "$SRC" && find . -mindepth 1 -maxdepth 1 ! -name index.html -exec cp -R {} "$STAGE/v/$HASH/" \;)
sed -E "s#(href|src)=\"\./#\1=\"./v/$HASH/#g" "$SRC/index.html" > "$STAGE/index.html"
grep -q "./v/$HASH/src/demo/main.js" "$STAGE/index.html" || { echo "index.html rewrite failed" >&2; exit 1; }

rsync -a "$STAGE/v/" "$HOST:$DEST/v/"
rsync -a "$STAGE/index.html" "$HOST:$DEST/index.html"
# drop the pre-versioning flat layout and keep only the 3 newest versions
ssh "$HOST" "cd '$DEST' && rm -rf src vendor characters && cd v && ls -1t | tail -n +4 | xargs -r rm -rf && chmod -R a+rX '$DEST'"
rm -rf "$STAGE"
echo "published version $HASH"
