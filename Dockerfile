FROM node:24-bookworm-slim

# better-sqlite3 needs a compiler when a prebuilt binary is unavailable for the host architecture.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global pnpm@10.34.7
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/client/package.json apps/client/package.json
COPY apps/server/package.json apps/server/package.json
COPY packages/assets/package.json packages/assets/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/protocol/package.json packages/protocol/package.json
COPY packages/rules/package.json packages/rules/package.json
COPY packages/voice/package.json packages/voice/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && mkdir -p data/local && chown -R node:node data
USER node
ENV HOST=0.0.0.0 PORT=3000
EXPOSE 3000
CMD ["node", "scripts/local-server.mjs"]
