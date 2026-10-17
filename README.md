# Clocktower Town

A browser-based pixel-art town for Trouble Brewing, with a human Storyteller, private cottages,
text/voice chat, and 5–15 players per game.

## Preview locally with Docker

Install and start Docker Desktop, then from this folder:

```sh
docker compose up --build -d
```

Open **http://localhost:3002**. Create a local account and a lobby. You can explore the town,
walk inside houses, and try chat before starting a game. Use a separate browser profile or private
window for a second account; two tabs in the same profile share an account and take over its seat.
Starting a game requires five ready players and a Storyteller.

After editing code, run the same command again and refresh the browser. This preview serves a
built client, so changes require a rebuild. To inspect logs or stop it:

```sh
docker compose logs -f app
docker compose down
```

Accounts, notebooks, and saved records live in the `local-data` Docker volume and survive rebuilds
and `down`. Login secrets are generated on first launch and kept in the same volume. Running games
are in memory and end on restart. This setup has its own database and listens only on your computer;
it does not deploy to or connect to the shared game server.

If port 3002 is occupied, run `CT_LOCAL_PORT=3003 docker compose up --build -d` and open
http://localhost:3003. Keep that variable when running subsequent Compose commands.

Text chat and all gameplay work without voice credentials. For optional LiveKit voice, provide
`CT_LOCAL_LIVEKIT_URL`, `CT_LOCAL_LIVEKIT_API_KEY`, and `CT_LOCAL_LIVEKIT_API_SECRET` to Compose,
using a development project. Rooms use the `local` prefix. Local HTTP on `localhost` supports mic
permission; opening the app on a phone over a LAN address requires separate networking/HTTPS setup.

## Without Docker

With **Node 24+** and **pnpm 10.34.7** installed:

```sh
pnpm install --frozen-lockfile
pnpm preview:local
```

Open http://localhost:3002. The local database and generated secrets are in ignored `data/local/`.
Stop with Ctrl-C and rerun `pnpm preview:local` after changes. On platforms without a prebuilt
`better-sqlite3` binary, installation also needs Python and a C++ build toolchain.

If you have npm but an older Node version or no pnpm, use an isolated toolchain without replacing
your installed Node:

```sh
npm exec --yes --package=node@24 --package=pnpm@10.34.7 -- pnpm install --frozen-lockfile
npm exec --yes --package=node@24 --package=pnpm@10.34.7 -- pnpm preview:local
```

## Development notes

- [Product vision](docs/vision.md), [architecture](docs/architecture.md), [v2 release notes](docs/RELEASE-v2.md).
- Chat shows as a speech bubble over the speaker (one per person: a new message replaces it; it
  fades after 5–7 s, scaled with its length). Existing chat and ping rate limits are unchanged.
- Voice and text stay within the current area in every phase, including the waiting room and
  after a game: the square, or the cottage you are in. There is no direct-message inbox.
- Walk indoors with WASD/arrows or tap the floor. Walk down through the doorway, use Leave, or press
  Escape to exit. Night locks and Storyteller movement controls still apply.
- Shared-host builds, tests, and deployments follow [CLAUDE.md](CLAUDE.md). The local preview above
  is a separate, explicitly requested workflow.
