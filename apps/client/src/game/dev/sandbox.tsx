// DEV-ONLY sandbox (not part of the production build): drives the real GameScreen/TownScene with
// an in-browser fake RoomConnection backed by the real server WorldModule, plus wandering bots.
// Open with the Vite dev server at /src/game/dev/sandbox.html
import { render } from 'preact';
import { useState } from 'preact/hooks';
import {
  ACCESSORIES,
  DEFAULT_COSMETICS,
  GHOST_STYLES,
  HAIR_COLORS,
  HAIR_STYLES,
  OUTFIT_PALETTES,
  OUTFITS,
  SKIN_TONES,
  type Cosmetics,
  type GamePhase,
  type LobbyRoomView,
  type PlayerGameView,
  type S2CMessages,
  type StorytellerGameView,
} from '@ct/protocol';
import { createWorldModule } from '../../../../server/src/world/index';
import type { RoomEvent, RoomHost, RoomMember } from '../../../../server/src/rooms/modules';
import { createStore, Emitter } from '../../net/store';
import type { RoomConnection } from '../../net/room';
import { GameScreen } from '../GameScreen';
import { CosmeticPreview } from '../CosmeticPreview';
import { PLAYABLE, townLayout } from '@ct/assets';
import '../../ui/common/theme.css';

const params = new URLSearchParams(location.search);
const asST = params.get('st') === '1';
if (params.get('timeout') === '1') (window as unknown as { __ctForceTimeout: boolean }).__ctForceTimeout = true;
const N = Number(params.get('bots') ?? 6);

const pick = <T,>(a: readonly T[], i: number) => a[i % a.length]!;
const members: RoomMember[] = [];
const me: RoomMember = { pid: 'me', accountId: 'a', displayName: asST ? 'The Storyteller' : 'You', role: asST ? 'storyteller' : 'player', seat: asST ? null : 0, connected: true, cosmetics: { ...DEFAULT_COSMETICS, accessory: 'lantern', preset: 'frog' }, isHost: true };
members.push(me);
for (let i = 0; i < N; i++)
  members.push({
    pid: `bot${i}`,
    accountId: `b${i}`,
    displayName: ['Agnes', 'Bartholomew', 'Cordelia', 'Desmond', 'Eloise', 'Fennick', 'Griselda', 'Hob'][i % 8]!,
    role: !asST && i === N - 1 ? 'storyteller' : 'player',
    seat: !asST && i === N - 1 ? null : asST ? i : i + 1,
    connected: true,
    cosmetics: {
      skin: pick(SKIN_TONES, i + 1),
      hair: pick(HAIR_STYLES, i * 5 + 1),
      hairColor: pick(HAIR_COLORS, i * 7 + 2),
      outfit: pick(OUTFITS, i + 2),
      palette: pick(OUTFIT_PALETTES, i * 5),
      accessory: pick(ACCESSORIES, i + 3),
      ghost: pick(GHOST_STYLES, i),
      preset: PLAYABLE[(i + 1) % PLAYABLE.length]!.id,
    },
    isHost: false,
  });

const events = new Emitter<S2CMessages & { closed: { code: number } }>();
const lobbyView = createStore<LobbyRoomView | null>(null);
const gameView = createStore<PlayerGameView | StorytellerGameView | null>(null);
let phase: GamePhase | null = null;
const dead = new Set<string>();

const queue: RoomEvent[] = [];
const host: RoomHost = {
  lobbyId: 'sandbox',
  env: 'dev',
  log: console as unknown as RoomHost['log'],
  layout: () => townLayout, // (v3) the sandbox is a v2 lobby
  now: () => Date.now(),
  members: () => members,
  member: (pid) => members.find((m) => m.pid === pid),
  storytellerPid: () => members.find((m) => m.role === 'storyteller')?.pid ?? null,
  send(pid, type, payload) {
    if (pid === 'me') setTimeout(() => events.emit(type, JSON.parse(JSON.stringify(payload))), 40);
  },
  emit(e) {
    queue.push(e);
    queueMicrotask(() => {
      while (queue.length) world.onEvent(queue.shift()!);
    });
  },
  markGameDirty() {},
  markLobbyDirty() {},
  get game(): never {
    throw new Error('no game');
  },
  get world() {
    return world;
  },
  get voice(): never {
    throw new Error('no voice');
  },
};
const world = createWorldModule(host);
(window as unknown as { __world: unknown }).__world = world;
for (const m of members) world.onEvent({ type: 'member_joined', pid: m.pid });

function publishViews() {
  lobbyView.set({
    lobby: { id: 'sandbox', name: 'Sandbox', description: '', script: 'trouble-brewing', maxPlayers: 15, playerCount: N, storytellerName: null, storytellerSeatOpen: false, phase: phase ? 'day' : 'waiting', joinable: false, hostName: 'You', createdAt: 0, updatedAt: 0 },
    members: members.map((m) => ({ pid: m.pid, displayName: m.displayName, role: m.role, seat: m.seat, ready: true, connected: true, isHost: m.isHost, cosmetics: m.cosmetics })),
    youPid: 'me',
    canStart: false,
    startBlockers: [],
  });
  if (!phase) return gameView.set(null);
  const players = members
    .filter((m) => m.role === 'player')
    .map((m) => ({ pid: m.pid, seat: m.seat!, name: m.displayName, alive: !dead.has(m.pid), ghostVoteAvailable: true, nominatedToday: false, wasNominatedToday: false, connected: true }));
  if (asST)
    gameView.set({ kind: 'storyteller', phase, dayNumber: 1, phaseEndsAt: null, players, grimoire: [], demonBluffs: [], nightQueue: [], day: null, announcements: [], visitingSeat: null, travelSpeedMult: speed, alerts: [], log: [], result: null });
  else
    gameView.set({ kind: 'player', phase, dayNumber: 1, phaseEndsAt: null, players, you: { pid: 'me', seat: 0, alive: !dead.has('me'), ghostVoteAvailable: true, canNominate: true, role: null }, day: null, prompts: [], info: [], announcements: [], storytellerVisitingYou: false, result: null });
}
let speed = 1;
publishViews();
// ?phase=day|night|… starts a game in that phase; ?fill=1 puts the bots inside a few houses
// (door boards: 1, 2, 3, 4 and 4+N occupants) and marks one of them dead (a ghost token).
const startPhase = params.get('phase') as GamePhase | null;
if (startPhase || params.get('fill'))
  setTimeout(() => {
    if (startPhase) setPhase(startPhase === 'night' || startPhase === 'first_night' ? 'day' : startPhase);
    if (params.get('fill')) {
      const bots = members.filter((m) => m.pid !== 'me' && m.role === 'player');
      // ?fill=all: every one of the 15 houses gets 1..6 (cycling) occupants, as far as the bots go
      const plan: (readonly [string, number])[] =
        params.get('fill') === 'all'
          ? Array.from({ length: 15 }, (_, h) => [`house-${h}`, [1, 2, 3, 4, 6][h % 5]!] as const)
          : [['house-0', 1], ['house-1', 2], ['house-2', 3], ['house-4', 6], ['house-3', 4]];
      let k = 0;
      for (const [id, n] of plan) for (let j = 0; j < n && k < bots.length; j++) world.teleportToBuilding(bots[k++]!.pid, id, 'storyteller');
      for (const b of [bots[1], bots[4]]) if (b) (dead.add(b.pid), world.onEvent({ type: 'alive_changed', pid: b.pid, alive: false } as RoomEvent));
      publishViews();
    }
    if (startPhase === 'night' || startPhase === 'first_night') setTimeout(() => setPhase(startPhase), 300);
  }, 600);

const conn = {
  lobbyId: 'sandbox',
  events,
  lobbyView,
  gameView,
  chat: createStore([]),
  status: createStore('open'),
  send(type: string, payload: never) {
    setTimeout(() => {
      if (type === 'move') world.handleMove('me', payload);
      if (type === 'world:useDoor') world.handleUseDoor('me', payload);
    }, 40);
  },
  leave: async () => undefined,
} as unknown as RoomConnection;

// snapshots at 12 Hz + wandering bots
setInterval(() => events.emit('world:snapshot', JSON.parse(JSON.stringify(world.snapshotFor('me')))), 1000 / 12);
const botState = new Map<string, { vx: number; vy: number; seq: number; until: number }>();
setInterval(() => {
  const now = Date.now();
  for (const m of members) {
    if (m.pid === 'me') continue;
    const p = world.positionOf(m.pid);
    if (!p) continue;
    let s = botState.get(m.pid);
    if (!s || now > s.until) {
      const a = Math.random() * Math.PI * 2;
      const still = Math.random() < 0.35;
      s = { vx: still ? 0 : Math.cos(a), vy: still ? 0 : Math.sin(a), seq: s?.seq ?? 0, until: now + 800 + Math.random() * 2500 };
      botState.set(m.pid, s);
    }
    const step = 72 * 0.066;
    const facing = Math.abs(s.vx) > Math.abs(s.vy) ? (s.vx < 0 ? 'left' : 'right') : s.vy < 0 ? 'up' : 'down';
    world.handleMove(m.pid, { seq: ++s.seq, x: p.x + s.vx * step, y: p.y + s.vy * step, facing, moving: s.vx !== 0 || s.vy !== 0 });
    const q = world.positionOf(m.pid)!;
    if (q.x === p.x && q.y === p.y && (s.vx || s.vy)) s.until = 0;
  }
}, 66);

function setPhase(p: GamePhase | null) {
  const prev = phase;
  phase = p;
  if (p && !prev) world.onEvent({ type: 'game_started', seats: members.filter((m) => m.seat !== null).map((m) => ({ pid: m.pid, seat: m.seat! })), storytellerPid: host.storytellerPid()! });
  if (p) world.onEvent({ type: 'phase_changed', phase: p, prev, phaseEndsAt: null });
  publishViews();
  if (p === 'bedtime') events.emit('sound', { cue: 'bell' });
  if (p === 'dawn') events.emit('sound', { cue: 'dawn' });
}

function Panel() {
  const [cos, setCos] = useState<Cosmetics>(members[2]!.cosmetics);
  return (
    <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 50, display: 'flex', gap: 6, flexWrap: 'wrap', maxWidth: 560 }}>
      {(['setup', 'day', 'bedtime', 'night', 'dawn'] as const).map((p) => (
        <button key={p} onClick={() => setPhase(p)}>
          {p}
        </button>
      ))}
      <button onClick={() => (dead.has('me') ? dead.delete('me') : dead.add('me'), dead.add('bot1'), publishViews())}>toggle ghost</button>
      {asST && (
        <button
          onClick={() => {
            speed = speed === 1 ? 4 : 1;
            world.onEvent({ type: 'travel_speed', pid: 'me', mult: speed });
            publishViews();
          }}
        >
          speed x{speed}
        </button>
      )}
      {asST && <button onClick={() => world.teleportToBuilding('me', 'house-1', 'storyteller')}>visit house-1</button>}
      <input placeholder="typing test" style={{ width: 90 }} />
      <div class="panel" style={{ padding: 4, display: 'flex', gap: 4, alignItems: 'center' }}>
        <CosmeticPreview cosmetics={cos} scale={3} />
        <button onClick={() => setCos({ ...cos, hair: pick(HAIR_STYLES, HAIR_STYLES.indexOf(cos.hair) + 1) })}>hair</button>
      </div>
    </div>
  );
}

render(
  <div class="screen">
    <GameScreen conn={conn} account={{ id: 'a', displayName: 'You' } as never}>
      <Panel />
    </GameScreen>
  </div>,
  document.getElementById('app')!,
);
