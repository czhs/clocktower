// OWNED BY voice. Compact voice panel: enable button, push-to-talk / open mic, mute, deafen,
// input device, per-participant volume + speaking indicators, ST announcement, debug overlay.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { AccountView } from '@ct/protocol';
import type { RoomConnection } from '../../net/room';
import { useStore } from '../../net/store';
import { browserKind, keyLabel, VoiceClient, type BrowserKind, type VoiceClientState } from '../../voice/VoiceClient';
import './voice.css';

const ANNOUNCE_KEEPALIVE_MS = 30_000;

function zoneLabel(s: VoiceClientState, night: boolean): { title: string; hint: string } {
  if (!s.zone) return { title: 'No voice area', hint: 'Walk into town to talk.' };
  if (s.zone === 'square') return { title: 'Town square', hint: 'Square — everyone here hears you.' };
  if (s.zone === 'street') return { title: 'Streets', hint: 'Street — only people near you hear you.' };
  if (s.zone.startsWith('bld:house-') && night) return { title: 'Your home', hint: 'Home at night — private. Only the Storyteller can visit.' };
  if (s.zone.startsWith('bld:house-')) return { title: 'A cottage', hint: 'Inside — private: only people in this room hear you.' };
  return { title: 'Indoors', hint: 'Inside — private: only people in this room hear you.' };
}

/** One short line: who hears me right now. */
function heardByLine(s: VoiceClientState, names: Map<string, string>): string {
  if (s.link !== 'connected') return '';
  const n = s.heardBy.map((p) => names.get(p) ?? 'someone');
  if (n.length === 0) return s.mode === 'proximity' ? 'Nobody is close enough to hear you.' : 'Nobody else is here.';
  const shown = n.slice(0, 3).join(', ');
  return `Heard by: ${shown}${n.length > 3 ? ` (+${n.length - 3})` : ''}`;
}

const RECOVERY: Record<BrowserKind, string> = {
  chrome: 'Click the microphone (or lock) icon at the left of the address bar, set Microphone to Allow, then press Retry.',
  edge: 'Click the lock icon at the left of the address bar, set Microphone to Allow, then press Retry.',
  firefox: 'Click the crossed-out microphone icon in the address bar, remove the block, then press Retry.',
  safari: 'In the Safari menu choose Settings for This Website…, set Microphone to Allow, then press Retry.',
  other: "Allow the microphone for this site in your browser's site settings, then press Retry.",
};

function MicIcon({ off }: { off: boolean }) {
  return (
    <svg class="ctv-micicon" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <rect x="5.5" y="1.5" width="5" height="8.5" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.4" />
      <path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
      {off && <path d="M2.5 2.5l11 11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />}
    </svg>
  );
}

/** Own mic state, unmistakable: ON AIR / MUTED / HOLD V / LISTENING. */
function micBadge(s: VoiceClientState): { cls: string; text: string; off: boolean } {
  if (!s.enabled) return { cls: 'off', text: 'Voice off', off: true };
  if (s.mic !== 'ready') return { cls: 'listen', text: 'Listening only', off: true };
  if (s.deafened) return { cls: 'muted', text: 'Deafened', off: true };
  if (s.muted) return { cls: 'muted', text: 'Muted', off: true };
  if (s.transmitting) return { cls: 'live', text: 'On air', off: false };
  if (s.inputMode === 'ptt') return { cls: 'idle', text: `Hold ${keyLabel(s.pttKey)}`, off: true };
  return { cls: 'idle', text: 'Mic idle', off: true };
}

function linkDot(s: VoiceClientState): string {
  if (!s.enabled) return 'off';
  if (s.availability === 'not_configured' || s.availability === 'quota_exhausted') return 'bad';
  if (s.link === 'connected') return s.transmitting ? 'live' : 'ok';
  if (s.link === 'connecting' || s.link === 'reconnecting') return 'wait';
  if (s.link === 'error') return 'bad';
  return 'off';
}

export function VoicePanel({ conn }: { conn: RoomConnection; account: AccountView }) {
  const client = useMemo(() => new VoiceClient(conn), [conn]);
  useEffect(() => () => void client.dispose(), [client]);
  const s = useStore(client.state);
  const lobby = useStore(conn.lobbyView);
  const game = useStore(conn.gameView);
  const night = game?.phase === 'first_night' || game?.phase === 'night' || game?.phase === 'dawn';
  // Collapsed by default on narrow / touch screens so the panel never covers vote cards or the endgame.
  const [open, setOpen] = useState(() => !compactScreen());
  const [debug, setDebug] = useState(false);
  const [binding, setBinding] = useState(false);
  const [announcing, setAnnouncing] = useState(false);

  const names = useMemo(() => new Map((lobby?.members ?? []).map((m) => [m.pid, m.displayName])), [lobby]);
  const me = lobby?.members.find((m) => m.pid === lobby.youPid);
  const isStoryteller = me?.role === 'storyteller';
  const stPid = lobby?.members.find((m) => m.role === 'storyteller')?.pid ?? null;
  const browser = useMemo(() => browserKind(), []);

  // Rebind push-to-talk: capture the next key press.
  useEffect(() => {
    if (!binding) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code !== 'Escape') client.setPttKey(e.code);
      setBinding(false);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [binding, client]);

  // Storyteller announcement keep-alive (server auto-ends it after ~90 s of silence).
  useEffect(() => {
    if (!announcing || !isStoryteller) return;
    conn.send('voice:announce', { active: true });
    const t = setInterval(() => conn.send('voice:announce', { active: true }), ANNOUNCE_KEEPALIVE_MS);
    return () => {
      clearInterval(t);
      conn.send('voice:announce', { active: false });
    };
  }, [announcing, isStoryteller, conn]);
  useEffect(() => {
    if (!isStoryteller) setAnnouncing(false);
  }, [isStoryteller]);

  // Voice not configured on this server: just a tiny "Voice off" pill unless opened on purpose.
  useEffect(() => {
    if (s.availability === 'not_configured') setOpen(false);
  }, [s.availability]);

  const z = zoneLabel(s, night);
  const unavailable = s.availability === 'not_configured' || s.availability === 'quota_exhausted' || s.availability === 'provider_error';
  const announceHeard = s.participants.some((p) => p.announce && p.speaking);
  const badge = micBadge(s);
  const inHouse = !!s.zone?.startsWith('bld:house-') && s.link === 'connected';
  // Night/house visit: an unmistakable "private with the Storyteller" banner.
  const privateWith = !inHouse
    ? null
    : isStoryteller
      ? s.participants.filter((p) => !p.announce).map((p) => names.get(p.pid) ?? 'a player')
      : stPid && s.participants.some((p) => p.pid === stPid && !p.announce)
        ? ['the Storyteller']
        : null;
  const privateLine = privateWith && privateWith.length ? `Private conversation with ${privateWith.join(', ')}` : null;
  const heard = heardByLine(s, names);
  const notice = s.notice && (
    <div class={`ctv-notice ctv-notice-${s.notice.kind}`} role="status" aria-live="polite">
      <span>{s.notice.text}</span>
      <button class="ctv-icon" onClick={() => client.dismissNotice()} title="Dismiss" aria-label="Dismiss">
        ×
      </button>
    </div>
  );

  if (!open) {
    return (
      <div class="ctv ctv-collapsed">
        {notice}
        {privateLine && <div class="ctv-private ctv-private-small">🕯 {privateLine}</div>}
        <button class="ctv-pill" onClick={() => setOpen(true)} title={s.availability === 'not_configured' ? 'Voice is not set up on this server; text chat works.' : heard || 'Open voice panel'}>
          {s.availability === 'not_configured' ? (
            '🔇 Voice off'
          ) : (
            <>
              <span class={`ctv-dot ctv-dot-${linkDot(s)}`} /> Voice
            </>
          )}
          {s.enabled && (
            <span class={`ctv-mic ctv-mic-${badge.cls}`}>
              <MicIcon off={badge.off} /> {badge.text}
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div class="ctv" role="region" aria-label="Voice">
      <div class="ctv-head">
        <span class={`ctv-dot ctv-dot-${linkDot(s)}`} />
        <span class="ctv-title">Voice</span>
        {s.enabled && s.zone && <span class={`ctv-zone ctv-zone-${s.mode ?? 'none'}`}>{z.title}</span>}
        <span class="ctv-spacer" />
        {s.enabled && (
          <span class={`ctv-mic ctv-mic-${badge.cls}`} aria-label={`Microphone: ${badge.text}`}>
            <MicIcon off={badge.off} /> {badge.text}
          </span>
        )}
        <button class="ctv-icon" onClick={() => setDebug((d) => !d)} title="Voice debug overlay" aria-pressed={debug}>
          ⚙
        </button>
        <button class="ctv-icon" onClick={() => setOpen(false)} title="Collapse">
          ▾
        </button>
      </div>

      {notice}
      {privateLine && <div class="ctv-private">🕯 {privateLine}</div>}
      {unavailable && <p class="ctv-note ctv-warn">{s.availabilityMessage ?? 'Voice is unavailable. Text chat continues.'}</p>}

      {!s.enabled ? (
        <div class="ctv-body">
          <button class="primary ctv-enable" onClick={() => void client.enable()} disabled={s.availability === 'not_configured'}>
            Enable voice
          </button>
          <p class="ctv-note">
            Talk to whoever is near you in town. Your browser will ask to use the microphone — you can also play without
            one and just listen.
          </p>
        </div>
      ) : (
        <div class="ctv-body">
          {s.zone && <p class="ctv-note ctv-where">{z.hint}</p>}
          {heard && <p class={`ctv-note ctv-heard ${s.heardBy.length ? '' : 'ctv-heard-none'}`}>{heard}</p>}
          {s.announce.room && !s.announce.canPublish && (
            <p class={`ctv-note ctv-announce ${announceHeard ? 'speaking' : ''}`}>The Storyteller is addressing the town.</p>
          )}
          {s.playbackBlocked && (
            <button class="ctv-wide ctv-attention" onClick={() => void client.allowAudio()}>
              Your browser paused voice audio — click here (or anywhere) to hear others
            </button>
          )}
          {s.micError && (
            <div class="ctv-note ctv-warn">
              {s.micError}
              {s.micFailure === 'denied' && <span class="ctv-steps"> {RECOVERY[browser]}</span>}{' '}
              {s.micFailure !== 'notfound' && s.micFailure !== 'insecure' && (
                <button class="ctv-small" onClick={() => void client.retryMic()}>
                  Retry
                </button>
              )}
            </div>
          )}
          {s.link === 'error' && (
            <div class="ctv-note ctv-warn">
              {s.lastError ?? 'Voice disconnected.'}{' '}
              <button class="ctv-small" onClick={() => client.reconnect()}>
                Reconnect
              </button>
            </div>
          )}
          {s.link === 'reconnecting' && <p class="ctv-note">{s.lastError ?? 'Reconnecting voice… (no need to reload)'}</p>}

          <div class="ctv-row">
            <div class="ctv-seg" role="group" aria-label="Microphone mode">
              <button class={s.inputMode === 'ptt' ? 'on' : ''} onClick={() => client.setInputMode('ptt')}>
                Push-to-talk
              </button>
              <button class={s.inputMode === 'open' ? 'on' : ''} onClick={() => client.setInputMode('open')}>
                Open mic
              </button>
            </div>
          </div>
          <div class="ctv-row">
            {s.inputMode === 'ptt' && (
              <button class={`ctv-key ${binding ? 'binding' : ''}`} onClick={() => setBinding(true)} title="Change push-to-talk key">
                {binding ? 'Press a key…' : `Hold ${keyLabel(s.pttKey)}`}
              </button>
            )}
            <button class={s.muted ? 'on' : ''} onClick={() => client.setMuted(!s.muted)} aria-pressed={s.muted} disabled={s.mic !== 'ready'}>
              {s.muted ? 'Unmute' : 'Mute'}
            </button>
            <button class={s.deafened ? 'on' : ''} onClick={() => client.setDeafened(!s.deafened)} aria-pressed={s.deafened}>
              {s.deafened ? 'Undeafen' : 'Deafen'}
            </button>
          </div>
          <div class={`ctv-tx ${s.transmitting ? 'live' : ''} ${s.localSpeaking ? 'speaking' : ''}`}>
            {s.mic !== 'ready'
              ? s.mic === 'requesting'
                ? 'Waiting for microphone…'
                : 'Listening only'
              : !s.canPublish && !s.announce.canPublish
                ? 'Not in a voice area'
                : s.transmitting
                  ? 'Transmitting'
                  : s.muted
                    ? 'Muted'
                    : s.inputMode === 'ptt'
                      ? `Hold ${keyLabel(s.pttKey)} to talk`
                      : 'Mic idle'}
          </div>
          {s.devices.length > 0 && (
            <select class="ctv-device" value={s.deviceId ?? ''} onChange={(e) => void client.setDevice((e.currentTarget as HTMLSelectElement).value)} aria-label="Microphone">
              <option value="">Default microphone</option>
              {s.devices.map((d) => (
                <option value={d.deviceId}>{d.label}</option>
              ))}
            </select>
          )}
          {isStoryteller && (
            <button class={`ctv-wide ${announcing ? 'on' : ''}`} onClick={() => setAnnouncing((a) => !a)} disabled={unavailable}>
              {announcing ? 'End announcement' : 'Announce to the whole town'}
            </button>
          )}

          <ul class="ctv-people">
            {s.participants.map((p) => (
              <li class={`${p.speaking ? 'speaking' : ''} ${p.gain < 0.02 && s.mode === 'proximity' ? 'faint' : ''}`}>
                <span class="ctv-ring" />
                <span class="ctv-name" title={p.pid}>
                  {names.get(p.pid) ?? 'Someone'}
                  {p.announce && <span class="ctv-tag">herald</span>}
                  {p.micMuted && !p.announce && <span class="ctv-tag">muted</span>}
                </span>
                <input
                  type="range"
                  min={0}
                  max={150}
                  step={5}
                  value={Math.round(p.volume * 100)}
                  aria-label={`Volume for ${names.get(p.pid) ?? 'participant'}`}
                  onInput={(e) => client.setVolume(p.pid, Number((e.currentTarget as HTMLInputElement).value) / 100)}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
      {debug && <VoiceDebug client={client} names={names} />}
    </div>
  );
}

function VoiceDebug({ client, names }: { client: VoiceClient; names: Map<string, string> }) {
  const [info, setInfo] = useState(() => client.debugInfo());
  const ref = useRef(client);
  ref.current = client;
  useEffect(() => {
    const t = setInterval(() => setInfo(ref.current.debugInfo()), 250);
    return () => clearInterval(t);
  }, []);
  return (
    <div class="ctv-debug" aria-label="Voice debug">
      <div>zone: {info.zone ?? '—'} · mode: {info.mode ?? '—'}</div>
      <div>room: {info.room ?? '—'}</div>
      <div>
        link: {info.link} ({info.zoneRoomState}) · token {info.tokenExpiresIn ?? '—'}s
      </div>
      <div>
        announce: {info.announceRoom ?? '—'} ({info.announceState})
      </div>
      <div>
        mic muted: {String(info.micMuted)} · audio ctx: {info.audioContext} · net: {info.quality}
      </div>
      {info.gains.map((g) => (
        <div>
          {names.get(g.pid) ?? g.pid}: gain {g.gain.toFixed(2)} → vol {g.applied.toFixed(2)} · net {g.quality}
        </div>
      ))}
    </div>
  );
}

/** Narrow (≤ 720 px) or touch-first screens start with the voice panel collapsed. */
function compactScreen(): boolean {
  try {
    return window.matchMedia('(max-width: 720px), (pointer: coarse)').matches;
  } catch {
    return false;
  }
}
