# Security policy

Clocktower Town is a small hobby project: a browser game self-hosted by one person for friends.
Reports are welcome and read, but there is **no bug bounty** and no paid support.

## Reporting a vulnerability

Please report privately — **do not open a public issue or pull request** for a security problem.

- Use GitHub's private vulnerability reporting: the repository's **Security** tab →
  **Report a vulnerability** (this opens a private security advisory visible only to the
  maintainer). If that button is not available, open a public issue titled only "Security contact
  request" (no details) and the maintainer will reach out privately.
- Include what you found, how to reproduce it (steps, a minimal script or request sequence), the
  impact you think it has, and the commit you tested (the public deployment does not reveal its
  version; the maintainer will check it).
- Test only against your own local instance (`pnpm dev`; see `docs/HANDOFF.md`). Do not run load
  tests, fuzzers or scanners against the public deployment, do not access other players' accounts
  or data, and do not disrupt games in progress.

You can expect an acknowledgement within about a week. Fixes are released as normal commits;
with your permission you will be credited in the advisory.

## Supported versions

Only the latest commit on the default branch (what the public deployment runs) receives security
fixes. Older tags and branches are not maintained.

## Scope

In scope:

- Compromise of the host or its network through the game server, deploy scripts or tunnel setup.
- Access to another player's account, session or personal data (account ids, passphrases, tokens).
- Learning hidden game information you should not have (other players' characters, Grimoire,
  private chat or voice) with a modified client or crafted messages.
- Server-side authorisation bypasses (acting as host, Storyteller or another seat).
- Abuse that takes the server down or costs the operator money (e.g. unbounded voice minutes,
  resource exhaustion from a single client).
- Secrets accidentally committed to this repository.

Out of scope:

- **Botting / automation** of the game (scripted clients, auto-play, multi-accounting). There are
  deliberately no captchas or bot detection.
- Social engineering of players or the operator; physical attacks.
- Reports from automated scanners without a demonstrated impact; missing best-practice headers
  without an exploit.
- Denial of service that requires large traffic volumes (Cloudflare's job), or rate limits that
  only slow a single client down.
- Vulnerabilities in third-party services (Cloudflare, LiveKit, GitHub) themselves — report those
  to the vendor.
