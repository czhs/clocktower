// (v2.3 AUTH-5 / AUTH-6) Self-service account data: export and deletion.
//
//   GET  /api/me/export   -> JSON download of what the server stores about the signed-in account,
//                            limited to the account's OWN data: profile, sessions (times only),
//                            stats, its match rows, its private notebooks, and for each saved game
//                            it sat in: the header, its own seat, its own info / prompts, and what
//                            the whole town heard (announcements, released pamphlets). Never another
//                            player's character, notebook, night info or account id.
//   POST /api/me/delete   { passphrase, confirm: 'delete' } -> re-authenticates with the passphrase
//                            (a stolen cookie alone cannot delete), refuses while the account holds
//                            a seat in a live lobby, then revokes every session and live connection,
//                            deletes the account, its sessions and notebooks, and anonymises its game
//                            history (match rows + saved game records; see packages/db repos/scrub.ts).
import express from 'express';
import { z } from 'zod';
import { createAdminRepo, createNotebooksRepo } from '@ct/db';
import type { Services } from '../services.js';
import { randomId } from './crypto.js';
import { clientRange, currentAccount, handler, HttpError, parseBody, rateLimit, requireAccount, sessionCookie } from './http.js';
import { RateLimiter } from './rateLimit.js';

const DeleteMeBody = z.object({ passphrase: z.string().min(10).max(256), confirm: z.literal('delete') }).strict();

type Rec = Record<string, unknown>;
const arr = (v: unknown): Rec[] => (Array.isArray(v) ? (v as Rec[]) : []);

/** One saved game reduced to what this account may see (see header comment). */
export function ownGameView(record: Rec, accountId: string): Rec | null {
  const seat = arr(record.seats).find((s) => s.accountId === accountId) ?? null;
  const st = record.storyteller as Rec | null | undefined;
  const asStoryteller = st?.accountId === accountId;
  if (!seat && !asStoryteller) return null;
  const mySeat = typeof seat?.seat === 'number' ? (seat.seat as number) : null;
  const result = record.result as Rec | null | undefined;
  return {
    matchId: record.matchId,
    lobbyName: (record.lobby as Rec | undefined)?.name ?? null,
    status: record.status,
    script: record.script,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    as: asStoryteller ? 'storyteller' : 'player',
    winner: result?.winner ?? null,
    you: seat
      ? {
          seat: seat.seat,
          displayName: seat.displayName,
          label: seat.label,
          avatarId: seat.avatarId ?? null,
          // finished games end with a public reveal; abandoned ones never revealed anything
          startingCharacter: record.status === 'finished' ? (seat.startingCharacter ?? null) : null,
        }
      : null,
    yourInfo: mySeat === null ? [] : arr(record.info).filter((i) => i.seat === mySeat && !i.undone).map((i) => ({ at: i.at, day: i.day, night: i.night, text: i.text })),
    yourPrompts:
      mySeat === null ? [] : arr(record.prompts).filter((p) => p.seat === mySeat && !p.undone).map((p) => ({ at: p.at, kind: p.kind, title: p.title, response: p.response ?? null })),
    announcements: arr(record.announcements).filter((a) => !a.undone).map((a) => ({ at: a.at, day: a.day, kind: a.kind, text: a.text })),
    pamphlets: arr(record.pamphlets),
  };
}

export function accountRouter(services: Services): express.Router {
  const r = express.Router();
  const auth = requireAccount(services);
  const exportLimit = new RateLimiter({ capacity: 3, refillPerSec: 1 / 30 });
  const deleteLimit = new RateLimiter({ capacity: 5, refillPerSec: 1 / 60 });
  const notebooks = createNotebooksRepo(services.database);
  const admin = createAdminRepo(services.database);

  r.get(
    '/me/export',
    auth,
    rateLimit(exportLimit, (_req, res) => currentAccount(res).id),
    handler((_req, res) => {
      const me = currentAccount(res);
      const { sqlite } = services.database;
      const matches = sqlite
        .prepare(
          `SELECT mp.match_id AS matchId, m.script, m.started_at AS startedAt, m.ended_at AS endedAt, m.winner, mp.seat,
                  mp.starting_character AS startingCharacter, mp.final_character AS finalCharacter, mp.alignment, mp.won,
                  mp.alive, mp.executed, mp.died, mp.nominations, mp.ghost_vote_used AS ghostVoteUsed, mp.avatar_id AS avatarId
           FROM match_players mp JOIN matches m ON m.id = mp.match_id
           WHERE mp.account_id = ? AND m.ended_at IS NOT NULL ORDER BY m.started_at DESC`,
        )
        .all(me.id);
      const games = (
        sqlite
          .prepare('SELECT record_json AS json FROM match_records WHERE storyteller_account_id = ? OR instr(record_json, ?) > 0 ORDER BY ended_at DESC LIMIT 500')
          .all(me.id, JSON.stringify(me.id)) as { json: string }[]
      )
        .map((g) => {
          try {
            return ownGameView(JSON.parse(g.json) as Rec, me.id);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      const body = {
        exportedAt: new Date().toISOString(),
        format: 'clocktower-account-export/1',
        account: {
          id: me.id,
          displayName: me.displayName,
          cosmetics: me.cosmetics,
          createdAt: new Date(me.createdAt).toISOString(),
          lastSeenAt: new Date(me.lastSeenAt).toISOString(),
        },
        sessions: services.sessions.listForAccount(me.id).map((s) => ({
          createdAt: new Date(s.createdAt).toISOString(),
          lastUsedAt: new Date(s.lastUsedAt).toISOString(),
          expiresAt: new Date(s.expiresAt).toISOString(),
        })),
        stats: services.stats.statsFor(me.id),
        // the network key moderation keeps for this account (v2.3 OPS-1), if any
        network: sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'account_ips'").get()
          ? ((sqlite.prepare('SELECT ip_key AS networkKey, at FROM account_ips WHERE account_id = ?').get(me.id) as { networkKey: string; at: number } | undefined) ?? null)
          : null,
        matches,
        notebooks: notebooks.listForAccount(me.id, 500),
        games,
        notes: [
          'Your passphrase is not stored (only a salted hash), so it cannot be exported.',
          'Chat and voice are never stored.',
        ],
      };
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Disposition', `attachment; filename="clocktower-account-${me.id}.json"`);
      res.json(body);
    }),
  );

  r.post(
    '/me/delete',
    auth,
    rateLimit(deleteLimit, (_req, res) => currentAccount(res).id),
    handler(async (req, res) => {
      const body = parseBody(DeleteMeBody, req.body);
      const me = currentAccount(res);
      const ok = await services.scryptGate.run(clientRange(req), () => services.auth.verifyPassphrase(me.id, body.passphrase));
      if (!ok) throw new HttpError(401, 'unauthenticated', 'That passphrase does not match this account');
      if (services.auth.isAdmin(me.id)) throw new HttpError(403, 'forbidden', 'Admin accounts cannot be deleted (remove the id from ADMIN_ACCOUNT_IDS first)');
      const lobby = services.directory.lobbyOfAccount(me.id);
      if (lobby) throw new HttpError(409, 'conflict', `You still have a seat in the lobby “${lobby.name}”. Leave it (or wait for the game to end) first.`);
      services.auth.revokeAll(me.id, 'account_deleted');
      if (!admin.deleteAccountAnonymised(me.id, `deleted-${randomId(12)}`)) throw new HttpError(404, 'not_found', 'Account not found');
      services.log.info('account deleted by its owner', { accountId: me.id });
      res.append('Set-Cookie', sessionCookie(services, '', 0));
      res.json({ ok: true });
    }),
  );

  return r;
}
