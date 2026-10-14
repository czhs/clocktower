// OWNED BY voice. Compact voice panel: enable button, push-to-talk / open mic, mute, deafen,
// input device, per-participant volume + speaking indicators, ST announcement, debug overlay.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { AccountView } from '@ct/protocol';
import type { RoomConnection } from '../../net/room';
import { useStore } from '../../net/store';
import { keyLabel, VoiceClient, type VoiceClientState } from '../../voice/VoiceClient';
import './voice.css';

const ANNOUNCE_KEEPALIVE_MS = 30_000;

function zoneLabel(s: VoiceClientState): { title: string; hint: string } {
  if (!s.zone) return { title: 'No voice area', hint: 'Walk into town to talk.' };
  if (s.zone === 'square') return { title: 'Town square', hint: 'Everyone in the square hears you.' };
  if (s.zone === 'street') return { title: 'Streets', hint: 'Only people nearby hear you.' };
  if (s.zone.startsWith('bld:house-')) return { title: 'A cottage', hint: 'Private: only this room hears you.' };
  return { title: 'Indoors', hint: 'Private: only this room hears you.' };
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
  const [open, setOpen] = useState(true);
  const [debug, setDebug] = useState(false);
  const [binding, setBinding] = useState(false);
  const [announcing, setAnnouncing] = useState(false);

  const names = useMemo(() => new Map((lobby?.members ?? []).map((m) => [m.pid, m.displayName])), [lobby]);
  const me = lobby?.members.find((m) => m.pid === lobby.youPid);
  const isStoryteller = me?.role === 'storyteller';

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

  const z = zoneLabel(s);
  const unavailable = s.availability === 'not_configured' || s.availability === 'quota_exhausted' || s.availability === 'provider_error';
  const announceHeard = s.participants.some((p) => p.announce && p.speaking);

  if (!open) {
    return (
      <div class="ctv ctv-collapsed">
        <button class="ctv-pill" onClick={() => setOpen(true)} title="Open voice panel">
          <span class={`ctv-dot ctv-dot-${linkDot(s)}`} /> Voice
          {s.transmitting && <span class="ctv-live">● on air</span>}
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
        <button class="ctv-icon" onClick={() => setDebug((d) => !d)} title="Voice debug overlay" aria-pressed={debug}>
          ⚙
        </button>
        <button class="ctv-icon" onClick={() => setOpen(false)} title="Collapse">
          ▾
        </button>
      </div>

      {unavailable && <p class="ctv-note ctv-warn">{s.availabilityMessage ?? 'Voice is unavailable. Text chat continues.'}</p>}

      {!s.enabled ? (
        <div class="ctv-body">
          <button class="primary ctv-enable" onClick={() => void client.enable()} disabled={s.availability === 'not_configured'}>
            Enable voice
          </button>
          <p class="ctv-note">Your browser will ask for the microphone. You can play without it.</p>
        </div>
      ) : (
        <div class="ctv-body">
          {s.zone && <p class="ctv-note">{z.hint}</p>}
          {s.announce.room && !s.announce.canPublish && (
            <p class={`ctv-note ctv-announce ${announceHeard ? 'speaking' : ''}`}>The Storyteller is addressing the town.</p>
          )}
          {s.playbackBlocked && (
            <button class="ctv-wide" onClick={() => void client.allowAudio()}>
              Click to allow audio playback
            </button>
          )}
          {s.micError && (
            <div class="ctv-note ctv-warn">
              {s.micError}{' '}
              <button class="ctv-small" onClick={() => void client.retryMic()}>
                Retry
              </button>
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
          {s.link === 'reconnecting' && <p class="ctv-note">Reconnecting voice…</p>}

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
            {s.participants.length === 0 && s.link === 'connected' && <li class="ctv-note">Nobody else can hear you here.</li>}
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
        mic muted: {String(info.micMuted)} · audio ctx: {info.audioContext}
      </div>
      {info.gains.map((g) => (
        <div>
          {names.get(g.pid) ?? g.pid}: gain {g.gain.toFixed(2)} → vol {g.applied.toFixed(2)}
        </div>
      ))}
    </div>
  );
}
