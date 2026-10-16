// OWNED BY social-server. Emotes + pins (apps/server/src/social) with the REAL WorldModule on the
// in-memory RoomHost: authorisation, limits, colours, eviction, cleanup and — above all — secrecy:
// pins and emotes never tell anyone who is where beyond what their own world snapshot already shows.
import { describe, expect, it } from 'vitest';
import { townLayout as L } from '@ct/assets';
import {
  C2S,
  DEFAULT_COSMETICS,
  homeBuilding,
  MAX_PINS_PER_MEMBER,
  NICK_FACE_CHARACTER,
  PIN_COLORS,
  type EmoteEvent,
  type GamePhase,
  type PinView,
  type ServerErrorMsg,
} from '@ct/protocol';
import { createSocialModule } from '../src/social/index.js';
import { createWorldModule } from '../src/world/index.js';
import type { VoiceModule } from '../src/rooms/modules.js';
import { createFakeHost, type FakeHost } from './helpers/fakeHost.js';

const H = (seat: number) => homeBuilding(L, seat)!.id;
const TOWN_RIGHT_PX = (L.townBounds.x + L.townBounds.w) * L.tileSize;

function rig(n = 4) {
  const host = createFakeHost('lobbySocial');
  const world = createWorldModule(host);
  const social = createSocialModule(host);
  // The fake host dispatches events to game/world/voice only: relay them to the social module.
  const relay = { onEvent: (e: Parameters<VoiceModule['onEvent']>[0]) => social.onEvent(e) } as unknown as VoiceModule;
  host.setModules({ world, voice: relay });
  const pids: string[] = [];
  for (let i = 0; i < n; i++) {
    host.addMember({ pid: `p${i}`, seat: i, displayName: `P${i}`, cosmetics: { ...DEFAULT_COSMETICS, preset: `hero-${i}` } });
    pids.push(`p${i}`);
  }
  host.addMember({ pid: 'st', role: 'storyteller', displayName: 'Teller', cosmetics: { ...DEFAULT_COSMETICS, preset: 'hero-st' } });
  for (const m of host.members()) host.emit({ type: 'member_joined', pid: m.pid });
  host.emit({ type: 'role_changed', pid: 'st', role: 'storyteller' });
  let phase: GamePhase | null = null;
  const r = {
    host,
    world,
    social,
    pids,
    start() {
      host.emit({ type: 'game_started', seats: pids.map((pid, seat) => ({ pid, seat })), storytellerPid: 'st' });
    },
    phase(p: GamePhase) {
      host.emit({ type: 'phase_changed', phase: p, prev: phase, phaseEndsAt: null });
      phase = p;
    },
    pos: (pid: string) => world.positionOf(pid)!,
    /** Place pin right where `pid` stands. */
    pinHere(pid: string, color: (typeof PIN_COLORS)[number] = 'gold') {
      const p = world.positionOf(pid)!;
      social.handle(pid, 'social:pin', { target: { kind: 'place', x: p.x, y: p.y }, color });
    },
    pinPerson(pid: string, target: string, color: (typeof PIN_COLORS)[number] = 'crimson') {
      social.handle(pid, 'social:pin', { target: { kind: 'person', pid: target }, color });
    },
    point(pid: string, x: number, y: number, target?: string) {
      social.handle(pid, 'social:emote', { kind: 'point', x, y, ...(target ? { pid: target } : {}) });
    },
    errors: (pid: string) => (host.sent.get(pid) ?? []).filter((m) => m.type === 'error').map((m) => m.payload as ServerErrorMsg),
    emotes: (pid: string) => (host.sent.get(pid) ?? []).filter((m) => m.type === 'social:emote').map((m) => m.payload as EmoteEvent),
    pins: (pid: string): PinView[] => social.pinsFor(pid),
    enter(pid: string, seat: number) {
      world.teleportToBuilding(pid, H(seat), pid === 'st' ? 'storyteller' : 'door');
      expect(world.locationOf(pid)).toBe(`bld:${H(seat)}`);
    },
    exit(pid: string) {
      world.exitBuilding(pid, 'door');
      expect(world.locationOf(pid)).toBe('outdoors');
    },
    tick(ms: number) {
      host.clock.now += ms;
    },
  };
  return r;
}
type Rig = ReturnType<typeof rig>;

/** Everything social a viewer can observe (pins in snapshots + emote events), as a string. */
const observed = (r: Rig, pid: string) => JSON.stringify({ pins: r.pins(pid), emotes: r.emotes(pid) });

describe('social: pins basics', () => {
  it('a place pin carries the dropper character, colour, a random id and the server time', () => {
    const r = rig();
    r.pinHere('p0', 'violet');
    const [pin] = r.pins('p0');
    expect(pin).toBeDefined();
    expect(pin!.by).toBe('p0');
    expect(pin!.character).toBe('hero-0');
    expect(pin!.color).toBe('violet');
    expect(pin!.at).toBe(r.host.clock.now);
    expect(pin!.id).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(pin!.target).toEqual({ kind: 'place', x: Math.round(r.pos('p0').x * 10) / 10, y: Math.round(r.pos('p0').y * 10) / 10 });
    // Pin views never carry the location (or anything else beyond the contract).
    expect(Object.keys(pin!).sort()).toEqual(['at', 'by', 'character', 'color', 'id', 'target']);
    // Everyone outdoors sees it.
    for (const pid of ['p1', 'p2', 'st']) expect(r.pins(pid).map((p) => p.id)).toEqual([pin!.id]);
  });

  it("the Storyteller's pins show the 'storyteller' icon, not their account preset", () => {
    const r = rig();
    r.pinHere('st');
    expect(r.pins('p0')[0]!.character).toBe('storyteller');
  });

  it('every protocol colour is accepted; anything else fails the C2S schema', () => {
    const r = rig();
    const p = r.pos('p0');
    for (const color of PIN_COLORS) {
      expect(C2S['social:pin'].safeParse({ target: { kind: 'place', x: p.x, y: p.y }, color }).success).toBe(true);
      r.social.handle('p1', 'social:pin', { target: { kind: 'place', x: p.x, y: p.y }, color });
      r.tick(1000);
    }
    expect(new Set(r.social.allPins().map((x) => x.color)).size).toBe(Math.min(PIN_COLORS.length, MAX_PINS_PER_MEMBER));
    expect(C2S['social:pin'].safeParse({ target: { kind: 'place', x: p.x, y: p.y }, color: 'pink' }).success).toBe(false);
    expect(C2S['social:pin'].safeParse({ target: { kind: 'place', x: 1e6, y: p.y }, color: 'gold' }).success).toBe(false);
  });

  it(`keeps at most ${MAX_PINS_PER_MEMBER} pins per member: dropping one more evicts that member's oldest`, () => {
    const r = rig();
    r.pinHere('p1', 'teal');
    const ids: string[] = [];
    for (let i = 0; i < MAX_PINS_PER_MEMBER + 2; i++) {
      r.tick(400);
      r.pinHere('p0');
      ids.push(r.social.allPins().at(-1)!.id);
    }
    const mine = r.social.allPins().filter((p) => p.by === 'p0');
    expect(mine.map((p) => p.id)).toEqual(ids.slice(2));
    expect(r.social.allPins().filter((p) => p.by === 'p1')).toHaveLength(1); // others untouched
    expect(r.errors('p0')).toEqual([]);
  });

  it('outdoor points must be in town (small overshoot is clamped), interiors accept room coords', () => {
    const r = rig();
    r.social.handle('p0', 'social:pin', { target: { kind: 'place', x: TOWN_RIGHT_PX + 100, y: 50 }, color: 'gold' });
    expect(r.errors('p0').at(-1)).toMatchObject({ code: 'invalid', for: 'social:pin' });
    expect(r.social.allPins()).toHaveLength(0);
    r.social.handle('p0', 'social:pin', { target: { kind: 'place', x: -10, y: 40 }, color: 'gold' });
    expect(r.pins('p0')[0]!.target).toEqual({ kind: 'place', x: 0, y: 40 });
    r.enter('p1', 1);
    r.social.handle('p1', 'social:pin', { target: { kind: 'place', x: 12, y: 30 }, color: 'green' });
    expect(r.social.allPins().find((p) => p.by === 'p1')).toMatchObject({ location: `bld:${H(1)}`, target: { kind: 'place', x: 12, y: 30 } });
  });
});

describe('social: unpin / clear authorisation', () => {
  it('players remove only their own pins; "not yours" and "no such pin" look identical; the ST may remove any', () => {
    const r = rig();
    r.pinHere('p0');
    const id = r.social.allPins()[0]!.id;
    r.social.handle('p1', 'social:unpin', { id });
    r.social.handle('p1', 'social:unpin', { id: 'doesnotexist' });
    const [a, b] = r.errors('p1');
    expect(a).toEqual(b);
    expect(a).toMatchObject({ code: 'not_found', for: 'social:unpin' });
    expect(r.social.allPins()).toHaveLength(1);
    r.social.handle('p0', 'social:unpin', { id });
    expect(r.social.allPins()).toHaveLength(0);
    r.pinHere('p2');
    r.social.handle('st', 'social:unpin', { id: r.social.allPins()[0]!.id });
    expect(r.social.allPins()).toHaveLength(0);
    expect(r.errors('st')).toEqual([]);
  });

  it("clearPins 'mine' clears only yours; 'all' is Storyteller-only", () => {
    const r = rig();
    r.pinHere('p0');
    r.pinHere('p0');
    r.pinHere('p1');
    r.social.handle('p0', 'social:clearPins', { scope: 'mine' });
    expect(r.social.allPins().map((p) => p.by)).toEqual(['p1']);
    r.social.handle('p0', 'social:clearPins', { scope: 'all' });
    expect(r.errors('p0').at(-1)).toMatchObject({ code: 'forbidden', for: 'social:clearPins' });
    expect(r.social.allPins()).toHaveLength(1);
    r.pinHere('st');
    r.social.handle('st', 'social:clearPins', { scope: 'all' });
    expect(r.social.allPins()).toHaveLength(0);
  });
});

describe('social: pin visibility (secrecy)', () => {
  it('pins belong to the location they were dropped in', () => {
    const r = rig();
    r.enter('p1', 1);
    r.pinHere('p0'); // outdoors
    r.pinHere('p1'); // inside cottage 1
    expect(r.pins('p0').map((p) => p.by)).toEqual(['p0']);
    expect(r.pins('p1').map((p) => p.by)).toEqual(['p1']);
    // The Storyteller sees the pins of the Storyteller's own location only.
    expect(r.pins('st').map((p) => p.by)).toEqual(['p0']);
    r.enter('st', 1);
    expect(r.pins('st').map((p) => p.by)).toEqual(['p1']);
    // Your own pins elsewhere are not in your snapshot either (they would say nothing new, but the
    // rule stays simple: snapshot = this place).
    r.exit('p1');
    expect(r.pins('p1').map((p) => p.by)).toEqual(['p0']);
  });

  it('person pins: only on someone you can see here; shown only while the viewer sees the target in that place', () => {
    const r = rig();
    r.enter('p2', 2);
    r.pinPerson('p0', 'p2'); // p2 is inside a cottage: p0 cannot see them
    expect(r.errors('p0').at(-1)).toMatchObject({ code: 'not_found', for: 'social:pin' });
    r.pinPerson('p0', 'ghost-pid');
    expect(r.errors('p0').at(-1)).toMatchObject({ code: 'not_found' });
    expect(r.social.allPins()).toHaveLength(0);

    r.pinPerson('p0', 'p1'); // both outdoors
    expect(r.pins('p3').map((p) => p.target)).toEqual([{ kind: 'person', pid: 'p1' }]);
    // p1 walks into cottage 3: outdoor viewers must not learn anything (pin disappears like p1 did),
    // and the people inside cottage 3 must not see an outdoor pin follow p1 in.
    r.enter('p1', 3);
    r.enter('p3', 3);
    for (const v of ['p0', 'p1', 'p3', 'st']) expect(r.pins(v), v).toEqual([]);
    // The Storyteller sees everyone, but outdoors only gets person-pins whose target is outdoors.
    r.exit('p1');
    expect(r.pins('p0')).toHaveLength(1);
    expect(r.pins('st')).toHaveLength(1);
    expect(r.pins('p3')).toEqual([]);
  });

  it('the Storyteller cannot pin (or point at) someone in another location', () => {
    const r = rig();
    r.enter('p2', 2);
    r.pinPerson('st', 'p2');
    expect(r.errors('st').at(-1)).toMatchObject({ code: 'not_found', for: 'social:pin' });
    r.point('st', 10, 10, 'p2');
    expect(r.errors('st').at(-1)).toMatchObject({ code: 'not_found', for: 'social:emote' });
    expect(r.emotes('p2')).toEqual([]);
  });

  it('night: a player sees only pins in their own home; a Storyteller visit leaves no trace for anyone else, and night pins vanish at dawn', () => {
    const r = rig();
    r.start();
    r.phase('day');
    r.enter('p1', 1);
    r.pinHere('p1', 'green'); // a daytime pin inside home 1
    r.exit('p1');
    r.pinHere('p0', 'gold'); // a daytime pin outdoors
    r.phase('bedtime');
    r.phase('night');
    for (const pid of r.pids) expect(r.world.locationOf(pid)).toBe(`bld:${H(Number(pid.slice(1)))}`);
    expect(r.pins('p1').map((p) => p.color)).toEqual(['green']);
    expect(r.pins('p0')).toEqual([]); // outdoors pins are not "here" at night
    const before = new Map(r.pids.map((p) => [p, observed(r, p)]));

    // The Storyteller visits home 0 and gestures there.
    r.enter('st', 0);
    r.pinHere('st', 'black');
    r.pinPerson('st', 'p0', 'white');
    r.pinPerson('p0', 'st', 'crimson');
    r.point('st', 10, 10, 'p0');
    r.point('p0', 10, 10, 'st');
    expect(r.errors('st')).toEqual([]);
    expect(r.errors('p0')).toEqual([]);
    expect(r.pins('p0').map((p) => p.color).sort()).toEqual(['black', 'crimson', 'white']);
    expect(r.pins('st').map((p) => p.color).sort()).toEqual(['black', 'crimson', 'white']);
    expect(r.emotes('p0').map((e) => e.pid)).toEqual(['st', 'p0']);
    // Nobody else observed anything.
    for (const pid of ['p1', 'p2', 'p3']) expect(observed(r, pid), pid).toBe(before.get(pid));

    // A player at night cannot gesture outside their home (not a place they are shown).
    r.pinPerson('p1', 'p0');
    expect(r.errors('p1').at(-1)).toMatchObject({ code: 'not_found' });

    r.exit('st');
    r.phase('dawn');
    r.phase('day');
    // Night pins are gone (they would tell daytime visitors of home 0 that the ST was there); the
    // daytime pins survive.
    expect(r.social.allPins().map((p) => p.color).sort()).toEqual(['gold', 'green']);
  });

  it('emotes reach exactly the members who can see the emoter (incl. themselves)', () => {
    const r = rig();
    r.enter('p2', 2);
    r.enter('p3', 2);
    const p1 = r.pos('p1');
    r.point('p0', p1.x + 3, p1.y + 3, 'p1');
    const ev = r.emotes('p0')[0]!;
    expect(ev).toMatchObject({ pid: 'p0', kind: 'point', target: 'p1', x: Math.round(p1.x * 10) / 10, y: Math.round(p1.y * 10) / 10 });
    expect(r.emotes('p1')).toEqual([ev]);
    expect(r.emotes('st')).toEqual([ev]); // the Storyteller sees everyone
    expect(r.emotes('p2')).toEqual([]);
    expect(r.emotes('p3')).toEqual([]);
    // Inside: only the people in that cottage (+ the Storyteller).
    r.point('p2', 20, 20);
    for (const v of ['p2', 'p3', 'st']) expect(r.emotes(v).at(-1)!.pid, v).toBe('p2');
    expect(r.emotes('p0').map((e) => e.pid)).toEqual(['p0']);
    expect(r.emotes('p1').map((e) => e.pid)).toEqual(['p0']);
    // Pointing at someone you cannot see / out of town is refused and sent to nobody.
    r.point('p0', 10, 10, 'p2');
    r.point('p0', TOWN_RIGHT_PX + 200, 10);
    expect(r.errors('p0').map((e) => e.code)).toEqual(['not_found', 'invalid']);
    expect(r.emotes('st')).toHaveLength(2);
  });

  it('emotes at night: only the visited player and the Storyteller', () => {
    const r = rig();
    r.start();
    r.phase('first_night');
    r.enter('st', 2);
    r.point('st', 30, 30);
    r.point('p1', 30, 30); // a player alone at home
    expect(r.emotes('p2').map((e) => e.pid)).toEqual(['st']);
    expect(r.emotes('st').map((e) => e.pid)).toEqual(['st', 'p1']);
    expect(r.emotes('p1').map((e) => e.pid)).toEqual(['p1']);
    expect(r.emotes('p0')).toEqual([]);
    expect(r.emotes('p3')).toEqual([]);
  });

  it('canSee mirrors the world snapshot rule exactly, in every phase', () => {
    const r = rig(6);
    r.start();
    const check = (label: string) => {
      const all = [...r.pids, 'st'];
      for (const v of all) {
        const seen = new Set(r.world.snapshotFor(v).entities.map((e) => e.id));
        for (const t of all) expect(r.social.canSee(v, t), `${label}: ${v} sees ${t}`).toBe(seen.has(t));
      }
    };
    const scatter = () => {
      r.enter('p1', 1);
      r.enter('p2', 1);
      r.enter('p3', 4);
      r.enter('st', 3);
    };
    check('start');
    for (const p of ['setup', 'day', 'bedtime'] as GamePhase[]) {
      r.phase(p);
      scatter();
      check(p);
    }
    for (const p of ['night', 'dawn', 'day', 'first_night', 'finished'] as GamePhase[]) {
      r.phase(p);
      if (p === 'night' || p === 'first_night') r.enter('st', 4);
      check(p);
    }
  });
});

describe('social: cleanup', () => {
  it('a member who leaves takes their pins and the person-pins on them along', () => {
    const r = rig();
    r.pinHere('p1');
    r.pinPerson('p0', 'p1');
    r.pinPerson('p2', 'p0');
    r.host.emit({ type: 'member_left', pid: 'p1' });
    expect(r.social.allPins().map((p) => `${p.by}->${p.target.kind === 'person' ? p.target.pid : 'place'}`)).toEqual(['p2->p0']);
  });

  it('game start and game end clear every pin', () => {
    const r = rig();
    r.pinHere('p0');
    r.start();
    expect(r.social.allPins()).toHaveLength(0);
    r.phase('day');
    r.pinHere('p0');
    r.pinHere('st');
    r.host.emit({ type: 'game_finished' });
    expect(r.social.allPins()).toHaveLength(0);
    for (const v of [...r.pids, 'st']) expect(r.pins(v)).toEqual([]);
  });
});

describe('social: rate limits', () => {
  it('emotes: burst 4, then ~2/s, with a friendly error', () => {
    const r = rig();
    const p = r.pos('p0');
    for (let i = 0; i < 5; i++) r.point('p0', p.x, p.y);
    expect(r.emotes('p0')).toHaveLength(4);
    const err = r.errors('p0')[0]!;
    expect(err).toMatchObject({ code: 'rate_limited', for: 'social:emote' });
    expect(err.message).not.toMatch(/slow down/i);
    r.tick(500);
    r.point('p0', p.x, p.y);
    expect(r.emotes('p0')).toHaveLength(5);
    // Another member has their own bucket.
    r.point('p1', p.x, p.y);
    expect(r.errors('p1')).toEqual([]);
  });

  it('pin operations share one bucket: burst 6, then ~3/s', () => {
    const r = rig();
    for (let i = 0; i < 4; i++) r.pinHere('p0');
    r.social.handle('p0', 'social:unpin', { id: r.social.allPins()[0]!.id });
    r.social.handle('p0', 'social:clearPins', { scope: 'mine' });
    expect(r.errors('p0')).toEqual([]);
    r.pinHere('p0');
    expect(r.errors('p0').at(-1)).toMatchObject({ code: 'rate_limited', for: 'social:pin' });
    expect(r.social.allPins()).toHaveLength(0);
    r.tick(340);
    r.pinHere('p0');
    expect(r.social.allPins()).toHaveLength(1);
  });
});

describe("social: Nick Song's 'nick-face' emote (v2.2)", () => {
  const asNick = (r: Rig, pid: string) => {
    r.host.member(pid)!.cosmetics = { ...DEFAULT_COSMETICS, preset: NICK_FACE_CHARACTER };
  };
  const nickFace = (r: Rig, pid: string) => r.social.handle(pid, 'social:emote', { kind: 'nick-face' });

  it('the C2S schema accepts { kind: "nick-face" } and still rejects unknown kinds', () => {
    expect(C2S['social:emote'].safeParse({ kind: 'nick-face' }).success).toBe(true);
    expect(C2S['social:emote'].safeParse({ kind: 'dab' }).success).toBe(false);
  });

  it('only the player whose lobby character is nicksong may send it (else invalid, delivered to nobody)', () => {
    const r = rig();
    nickFace(r, 'p0'); // hero-0, not Nick
    expect(r.errors('p0').map((e) => [e.code, e.for])).toEqual([['invalid', 'social:emote']]);
    // a Storyteller whose account preset is nicksong is still not Nick in this lobby
    asNick(r, 'st');
    nickFace(r, 'st');
    expect(r.errors('st').map((e) => e.code)).toEqual(['invalid']);
    for (const v of ['p0', 'p1', 'p2', 'p3', 'st']) expect(r.emotes(v), v).toEqual([]);
    asNick(r, 'p1');
    nickFace(r, 'p1');
    expect(r.errors('p1')).toEqual([]);
    const ev = r.emotes('p1')[0]!;
    const p = r.pos('p1');
    expect(ev).toEqual({ pid: 'p1', kind: 'nick-face', x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, at: r.host.clock.now });
  });

  it('is relayed only to members who can see him', () => {
    const r = rig();
    asNick(r, 'p0');
    r.enter('p2', 2);
    nickFace(r, 'p0');
    for (const v of ['p0', 'p1', 'p3', 'st']) expect(r.emotes(v).map((e) => e.kind), v).toEqual(['nick-face']);
    expect(r.emotes('p2')).toEqual([]); // inside a cottage: cannot see him
    // he goes inside: only that cottage (+ the Storyteller) sees it
    r.tick(1000);
    r.enter('p0', 2);
    nickFace(r, 'p0');
    expect(r.emotes('p2').map((e) => e.pid)).toEqual(['p0']);
    expect(r.emotes('st')).toHaveLength(2);
    expect(r.emotes('p1')).toHaveLength(1);
    expect(r.emotes('p3')).toHaveLength(1);
    // at night only his own home sees it (nobody else is there)
    r.exit('p0');
    r.start();
    r.phase('night');
    r.tick(1000);
    nickFace(r, 'p0');
    expect(r.emotes('p1')).toHaveLength(1);
    expect(r.emotes('p2')).toHaveLength(1);
    expect(r.emotes('st')).toHaveLength(3);
  });

  it('shares the emote rate limit with pointing', () => {
    const r = rig();
    asNick(r, 'p0');
    const p = r.pos('p0');
    for (let i = 0; i < 3; i++) r.point('p0', p.x, p.y);
    nickFace(r, 'p0');
    nickFace(r, 'p0');
    expect(r.emotes('p0').map((e) => e.kind)).toEqual(['point', 'point', 'point', 'nick-face']);
    expect(r.errors('p0').at(-1)).toMatchObject({ code: 'rate_limited', for: 'social:emote' });
  });
});
