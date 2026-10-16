// OWNED BY voice. Compact voice panel: enable button, push-to-talk / open mic, mute, deafen,
// input device, per-participant volume + speaking indicators, ST announcement, debug overlay.
// Statically imported by main.tsx: keep it (and ../../voice/VoiceClient) free of livekit-client —
// the LiveKit part (voice/VoiceEngine) is import()ed on "Enable voice".
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { AccountView } from '@ct/protocol';
import type { RoomConnection } from '../../net/room';
import { useStore } from '../../net/store';
import { browserKind, keyLabel, VoiceClient, type BrowserKind, type VoiceClientState, type VoiceParticipantView } from '../../voice/VoiceClient';
import { crowdLayout, noteActivity, roomCountLabel, type Activity } from '../../voice/speaking';
import { isPttMouseButton, mouseCode } from '../../voice/ptt';
import { announceBar, shouldClearAnnounce } from '../../voice/announce';
import { DeviceSettings } from './DeviceSettings';
import { registerVoiceClient } from '../../voice/active';
import { openSettings } from '../common/Settings';
import './voice.css';


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
  if (s.availability === 'not_configured' || s.availability === 'quota_exhausted' || s.availability === 'disabled' || s.availability === 'busy') return 'bad';
  if (s.link === 'connected') return s.transmitting ? 'live' : 'ok';
  if (s.link === 'connecting' || s.link === 'reconnecting') return 'wait';
  if (s.link === 'error') return 'bad';
  return 'off';
}

export function VoicePanel({ conn }: { conn: RoomConnection; account: AccountView }) {
  const client = useMemo(() => new VoiceClient(conn), [conn]);
  useEffect(() => () => void client.dispose(), [client]);
  useEffect(() => registerVoiceClient(client), [client]); // (v2.3) ⚙ Settings → Audio & voice edits the same client
  // DEV only (stripped from builds): lets the town sandbox / visual checks fake voice state.
  if (import.meta.env.DEV) (window as unknown as { __voiceClient?: VoiceClient }).__voiceClient = client;
  const s = useStore(client.state);
  const lobby = useStore(conn.lobbyView);
  const game = useStore(conn.gameView);
  const night = game?.phase === 'first_night' || game?.phase === 'night' || game?.phase === 'dawn';
  // Collapsed by default on narrow / touch screens so the panel never covers vote cards or the endgame.
  const [open, setOpen] = useState(() => !compactScreen());
  const [debug, setDebug] = useState(false);
  const [binding, setBinding] = useState(false);
  const [announcing, setAnnouncing] = useState(false);
  const [showAll, setShowAll] = useState(false);
  /** Recent voice activity per pid (panel ordering); updated when the participant list changes. */
  const activity = useRef(new Map<string, Activity>()).current;
  /** Volume to restore when un-muting someone locally. */
  const lastVol = useRef(new Map<string, number>()).current;

  const names = useMemo(() => new Map((lobby?.members ?? []).map((m) => [m.pid, m.displayName])), [lobby]);
  const me = lobby?.members.find((m) => m.pid === lobby.youPid);
  const isStoryteller = me?.role === 'storyteller';
  const stPid = lobby?.members.find((m) => m.role === 'storyteller')?.pid ?? null;
  const browser = useMemo(() => browserKind(), []);

  // Rebind push-to-talk: capture the next key press or middle / side mouse button (Esc cancels;
  // a left or right click cancels too — those walk and point in town and can't be bound).
  useEffect(() => {
    if (!binding) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code !== 'Escape') client.setPttKey(e.code);
      setBinding(false);
    };
    const onMouse = (e: MouseEvent) => {
      if (isPttMouseButton(e.button)) {
        // the release (mouseup / auxclick / back-forward) is then swallowed by the new binding
        e.preventDefault();
        e.stopPropagation();
        client.setPttKey(mouseCode(e.button));
      }
      setBinding(false);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    window.addEventListener('mousedown', onMouse, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKey, { capture: true });
      window.removeEventListener('mousedown', onMouse, { capture: true });
    };
  }, [binding, client]);

  // Storyteller announcement: one request, no keep-alive (v2.3). The server ends it by itself (90 s
  // without talking, a few minutes at most, nightfall, a home visit); we then drop our request, and
  // switching it off tells the server the ST saw it end (it refuses a restart until then).
  useEffect(() => {
    if (!announcing || !isStoryteller) return;
    conn.send('voice:announce', { active: true });
    return () => {
      conn.send('voice:announce', { active: false });
    };
  }, [announcing, isStoryteller, conn]);
  const announceLive = isStoryteller && !!s.announce.room && s.announce.canPublish;
  const announceSeen = useRef({ wasLive: false, at: 0 });
  useEffect(() => {
    if (!announcing) {
      announceSeen.current = { wasLive: false, at: 0 };
      return;
    }
    if (!announceSeen.current.at) announceSeen.current.at = Date.now();
    const check = () => {
      const r = announceSeen.current;
      if (shouldClearAnnounce({ requested: true, wasLive: r.wasLive, live: announceLive, requestedAt: r.at, now: Date.now() })) setAnnouncing(false);
      else if (announceLive) r.wasLive = true;
    };
    check();
    const t = setInterval(check, 1000);
    return () => clearInterval(t);
  }, [announcing, announceLive]);
  const bar = announceBar({ isStoryteller, requested: announcing, room: s.announce.room, canPublish: s.announce.canPublish });
  const announceWarning =
    bar === 'off' ? null : (
      <div class={`ctv-announce-bar ctv-announce-${bar}`} role="alert">
        <span class="ctv-announce-dot" aria-hidden="true">●</span>
        <span>{bar === 'live' ? 'You are announcing to the whole town' : 'Starting the announcement…'}</span>
        <button
          class="ctv-announce-stop"
          onClick={() => {
            if (announcing) setAnnouncing(false);
            else conn.send('voice:announce', { active: false }); // live without a local request (re-mounted panel)
          }}
        >
          Stop
        </button>
      </div>
    );
  useEffect(() => {
    if (!isStoryteller) setAnnouncing(false);
  }, [isStoryteller]);

  // Voice not configured on this server: just a tiny "Voice off" pill unless opened on purpose.
  useEffect(() => {
    if (s.availability === 'not_configured') setOpen(false);
  }, [s.availability]);

  const z = zoneLabel(s, night);
  // (v2.3) 'disabled' = host kill switch, 'busy' = capacity cap (both reconnect by themselves), 'idle' = voice was switched off.
  const unavailable = ['not_configured', 'quota_exhausted', 'provider_error', 'disabled', 'busy', 'idle'].includes(s.availability);
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
  // Big rooms: talkers on top, recent speakers next, the rest as compact chips. Recomputed only when
  // the participant list object changes (the engine patches it change-only).
  const crowd = useMemo(() => {
    noteActivity(activity, s.participants, performance.now());
    return crowdLayout(s.participants, activity);
  }, [s.participants, activity]);
  const roomCount = s.participants.filter((p) => !p.announce).length + 1;
  const talkers = crowd.talking.map((p) => names.get(p.pid) ?? 'Someone');
  const toggleLocalMute = (p: VoiceParticipantView) => {
    if (p.volume > 0) {
      lastVol.set(p.pid, p.volume);
      client.setVolume(p.pid, 0);
    } else client.setVolume(p.pid, lastVol.get(p.pid) || 1);
  };
  const row = (p: VoiceParticipantView) => {
    const name = names.get(p.pid) ?? 'Someone';
    return (
      <li key={p.pid} class={`${p.speaking ? 'speaking' : ''} ${p.gain < 0.02 && s.mode === 'proximity' ? 'faint' : ''} ${p.volume === 0 ? 'silenced' : ''}`}>
        <span class="ctv-ring" />
        <span class="ctv-name" title={name}>
          {name}
          {p.announce && <span class="ctv-tag">herald</span>}
          {p.micMuted && !p.announce && <span class="ctv-tag">muted</span>}
        </span>
        <button class={`ctv-icon ctv-pmute ${p.volume === 0 ? 'on' : ''}`} onClick={() => toggleLocalMute(p)} aria-pressed={p.volume === 0} title={p.volume === 0 ? `Hear ${name} again` : `Silence ${name} (only for you)`} aria-label={p.volume === 0 ? `Restore ${name} for me` : `Silence ${name} for me`}>
          {p.volume === 0 ? '🔇' : '🔈'}
        </button>
        <input
          type="range"
          min={0}
          max={150}
          step={5}
          value={Math.round(p.volume * 100)}
          aria-label={`Volume for ${name}`}
          onInput={(e) => client.setVolume(p.pid, Number((e.currentTarget as HTMLInputElement).value) / 100)}
        />
      </li>
    );
  };
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
        {announceWarning}
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
          {talkers.length > 0 && (
            <span class="ctv-pill-talk" aria-label={`Talking: ${talkers.join(', ')}`}>
              <span class="ctv-wave" aria-hidden="true" /> {talkers[0]}
              {talkers.length > 1 ? ` +${talkers.length - 1}` : ''}
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

      {announceWarning}
      {notice}
      {privateLine && <div class="ctv-private">🕯 {privateLine}</div>}
      {unavailable && <p class="ctv-note ctv-warn">{s.availabilityMessage ?? 'Voice is unavailable. Text chat continues.'}</p>}

      {!s.enabled ? (
        <div class="ctv-body">
          <button class="primary ctv-enable" onClick={() => void client.enable()} disabled={s.availability === 'not_configured' || s.loading}>
            {s.loading ? 'Loading voice…' : 'Enable voice'}
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
                  Retry mic
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
              <button class={`ctv-key ${binding ? 'binding' : ''}`} onClick={() => setBinding(true)} title="Change push-to-talk: a key, or the middle / side mouse button">
                {binding ? 'Press a key or a mouse button (middle/side)… Esc cancels' : `Hold ${keyLabel(s.pttKey)}`}
              </button>
            )}
            <button class={s.muted ? 'on' : ''} onClick={() => client.setMuted(!s.muted)} aria-pressed={s.muted} disabled={s.mic !== 'ready'}>
              {s.muted ? 'Unmute' : 'Mute'}
            </button>
            <button class={s.deafened ? 'on' : ''} onClick={() => client.setDeafened(!s.deafened)} aria-pressed={s.deafened}>
              {s.deafened ? 'Undeafen' : 'Deafen'}
            </button>
          </div>
          {s.inputMode === 'ptt' && s.mic === 'ready' && (
            <button
              class={`ctv-wide ctv-hold ${s.pttHeld ? 'on' : ''}`}
              disabled={s.muted || s.deafened}
              onPointerDown={(e) => {
                e.preventDefault();
                (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
                client.holdPtt(true);
              }}
              onPointerUp={() => client.holdPtt(false)}
              onPointerCancel={() => client.holdPtt(false)}
              onLostPointerCapture={() => client.holdPtt(false)}
              onContextMenu={(e) => e.preventDefault()}
              aria-pressed={s.pttHeld}
            >
              {s.pttHeld ? 'Talking… release to stop' : 'Hold here to talk'}
            </button>
          )}
          {s.inputMode === 'open' && (
            <label class="ctv-check" title={`On an open mic, arriving in a room of 8 or more people mutes you once.`}>
              <input type="checkbox" checked={s.crowdMute} onChange={(e) => client.setCrowdMute((e.currentTarget as HTMLInputElement).checked)} /> Join busy rooms muted
            </label>
          )}
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
          <DeviceSettings client={client} s={s} />
          <button class="ctv-small ctv-more" onClick={() => openSettings('audio')} title="Push-to-talk key, busy-room mute, devices and sound volumes">
            Voice &amp; sound settings…
          </button>
          {isStoryteller && (
            <button
              class={`ctv-wide ${announcing || announceLive ? 'on' : ''}`}
              onClick={() => {
                if (announcing) setAnnouncing(false);
                else if (announceLive) conn.send('voice:announce', { active: false });
                else setAnnouncing(true);
              }}
              disabled={unavailable || (night && !announcing && !announceLive)}
              title={night ? 'Announcements are not available at night (they would follow you into home visits).' : 'Everyone hears you until you stop (ends by itself after 90 s of silence or a few minutes).'}
            >
              {announcing || announceLive ? 'End announcement' : 'Announce to the whole town'}
            </button>
          )}

          {s.link === 'connected' && s.zone && (
            <div class="ctv-count" aria-live="polite">
              {roomCountLabel(roomCount, s.zone)}
              {talkers.length > 0 && <span class="ctv-count-talk"> · {talkers.length} talking</span>}
            </div>
          )}
          <ul class="ctv-people" aria-label="People in voice">
            {crowd.talking.map(row)}
            {crowd.rows.map(row)}
            {showAll && crowd.overflow.map(row)}
          </ul>
          {crowd.overflow.length > 0 && !showAll && (
            <div class="ctv-chips">
              {crowd.overflow.map((p) => (
                <span key={p.pid} class={`ctv-chip ${p.gain < 0.02 && s.mode === 'proximity' ? 'faint' : ''} ${p.volume === 0 ? 'silenced' : ''}`} title={names.get(p.pid) ?? 'Someone'}>
                  {names.get(p.pid) ?? 'Someone'}
                </span>
              ))}
            </div>
          )}
          {crowd.overflow.length > 0 && (
            <button class="ctv-small ctv-more" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
              {showAll ? 'Show fewer' : `+${crowd.overflow.length} more — volume & mute`}
            </button>
          )}
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
        mic muted: {String(info.micMuted)} · audio ctx: {info.audioContext} · net: {info.quality} · red: {info.red ? 'on' : 'off'}
      </div>
      {info.gains.map((g) => (
        <div>
          {names.get(g.pid) ?? g.pid}: gain {g.gain.toFixed(2)} → vol {g.applied.toFixed(2)} · net {g.quality}
          {g.culled ? ' · not received (far)' : ''}
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
