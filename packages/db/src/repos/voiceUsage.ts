import { eq, sql } from 'drizzle-orm';
import type { Database } from '../database.js';
import { voiceUsage } from '../schema.js';

/** Consumed by the voice teammate via `getServices().voiceUsage`. month = 'YYYY-MM' (UTC). */
export interface VoiceUsageStore {
  add(env: string, month: string, ms: number): void;
  get(month: string): { byEnv: Record<string, number>; totalMs: number };
}

export function createVoiceUsageRepo({ db }: Database): VoiceUsageStore {
  return {
    add(env, month, ms) {
      const inc = Math.max(0, Math.round(ms));
      if (!inc) return;
      db.insert(voiceUsage)
        .values({ env, month, participantMs: inc })
        .onConflictDoUpdate({
          target: [voiceUsage.env, voiceUsage.month],
          set: { participantMs: sql`${voiceUsage.participantMs} + ${inc}` },
        })
        .run();
    },
    get(month) {
      const rows = db.select().from(voiceUsage).where(eq(voiceUsage.month, month)).all();
      const byEnv: Record<string, number> = {};
      let totalMs = 0;
      for (const r of rows) {
        byEnv[r.env] = r.participantMs;
        totalMs += r.participantMs;
      }
      return { byEnv, totalMs };
    },
  };
}

/** 'YYYY-MM' in UTC for the given epoch ms. */
export function usageMonth(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 7);
}
