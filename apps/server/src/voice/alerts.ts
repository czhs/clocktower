// OWNED BY voice (v2.3 sec-voice, VOICE-8). Quota / capacity alerts: one log line per crossing and
// an optional JSON POST to VOICE_ALERT_WEBHOOK (ntfy, Discord-compatible relays, …). The webhook
// URL is configuration only (never from user input) and is never logged.
import type { QuotaLevel } from '@ct/voice';
import type { Logger } from '../rooms/modules.js';

export interface VoiceAlertInput {
  env: string;
  month: string;
  minutes: number;
  limit: number;
  liveParticipants: number | null;
  maxConcurrent: number;
}

export interface VoiceAlertPayload {
  app: 'clocktower';
  env: string;
  kind: 'quota' | 'capacity';
  level: QuotaLevel | 'cap';
  month: string;
  minutes: number;
  limit: number;
  liveParticipants: number | null;
  text: string;
}

const ORDER: QuotaLevel[] = ['ok', 'warn', 'critical', 'exhausted'];

export interface VoiceAlerts {
  check(input: VoiceAlertInput, now?: number): VoiceAlertPayload[];
  /** In-flight webhook posts (tests). */
  idle(): Promise<void>;
}

export function createVoiceAlerts(opts: {
  log: Logger;
  /** Webhook URL; a getter is read on every alert (live settings). */
  webhook: string | null | (() => string | null);
  /** Warn / critical thresholds in percent (exhausted is always 100 %); getter = live settings. */
  thresholds?: { warnPct: number; criticalPct: number } | (() => { warnPct: number; criticalPct: number });
  fetchImpl?: typeof fetch;
  /** Re-alert interval for the capacity alert. */
  capacityRepeatMs?: number;
}): VoiceAlerts {
  const sent = new Set<string>(); // `${month}:${level}`
  let lastCapAt = -Infinity;
  const inflight = new Set<Promise<unknown>>();
  const doFetch = opts.fetchImpl ?? fetch;

  const webhook = () => (typeof opts.webhook === 'function' ? opts.webhook() : opts.webhook);
  const thresholds = () => {
    const t = typeof opts.thresholds === 'function' ? opts.thresholds() : (opts.thresholds ?? { warnPct: 70, criticalPct: 90 });
    return t;
  };
  const levelOf = (minutes: number, limit: number): QuotaLevel => {
    if (!(limit > 0)) return 'exhausted';
    const pct = (minutes / limit) * 100;
    const t = thresholds();
    return pct >= 100 ? 'exhausted' : pct >= t.criticalPct ? 'critical' : pct >= t.warnPct ? 'warn' : 'ok';
  };
  const post = (p: VoiceAlertPayload) => {
    const url = webhook();
    if (!url) return;
    const pr = doFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p),
      signal: AbortSignal.timeout(5_000),
      redirect: 'error',
    })
      .then((r) => {
        if (!r.ok) opts.log.warn('voice: alert webhook rejected', { status: r.status });
      })
      .catch(() => opts.log.warn('voice: alert webhook failed'));
    inflight.add(pr);
    void pr.finally(() => inflight.delete(pr));
  };

  return {
    check(i, now = Date.now()) {
      const out: VoiceAlertPayload[] = [];
      const level = levelOf(i.minutes, i.limit);
      const t = thresholds();
      const pctOf: Record<QuotaLevel, string> = { ok: '', warn: `${t.warnPct} %`, critical: `${t.criticalPct} %`, exhausted: '100 %' };
      for (const l of ORDER.slice(1, ORDER.indexOf(level) + 1)) {
        const k = `${i.month}:${l}`;
        if (sent.has(k)) continue;
        sent.add(k);
        const text = `Clocktower voice (${i.env}) reached ${pctOf[l]} of the monthly allowance: ${Math.round(i.minutes)} / ${i.limit} participant-minutes in ${i.month}.${l === 'exhausted' ? ' Voice is now off until next month (or until the limit is raised).' : ''}`;
        const p: VoiceAlertPayload = { app: 'clocktower', env: i.env, kind: 'quota', level: l, month: i.month, minutes: Math.round(i.minutes), limit: i.limit, liveParticipants: i.liveParticipants, text };
        const fields = { level: l, minutes: p.minutes, limit: i.limit, month: i.month };
        if (l === 'exhausted') opts.log.error('voice quota level', fields);
        else opts.log.warn('voice quota level', fields);
        post(p);
        out.push(p);
      }
      if (i.maxConcurrent > 0 && i.liveParticipants !== null && i.liveParticipants >= i.maxConcurrent && now - lastCapAt >= (opts.capacityRepeatMs ?? 60 * 60_000)) {
        lastCapAt = now;
        const text = `Clocktower voice (${i.env}): ${i.liveParticipants} participants connected (cap ${i.maxConcurrent}).`;
        const p: VoiceAlertPayload = { app: 'clocktower', env: i.env, kind: 'capacity', level: 'cap', month: i.month, minutes: Math.round(i.minutes), limit: i.limit, liveParticipants: i.liveParticipants, text };
        opts.log.warn('voice concurrent cap reached', { live: i.liveParticipants, cap: i.maxConcurrent });
        post(p);
        out.push(p);
      }
      return out;
    },
    async idle() {
      while (inflight.size) await Promise.allSettled([...inflight]);
    },
  };
}
