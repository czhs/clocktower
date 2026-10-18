// (B) The cast on the voting circle's 15 seats (pass B; docs/DEMO.md §4.9): CAST characters (characters/*.js through the
// roster: the offered ones that carry the game clips) stand on the seat stones instead of the townsfolk mannequins
// (time.js's seated folk, life/folk.js: hidden while this module runs). Never the skipped cast member: only ids the
// roster offers (tools/demo-roster.mjs already excludes pipeline/skip.txt), never the player's own character, nor an
// idle NPC's, nor the Storyteller (who stands at the dais).
//   createSeatCast(demo) -> seats { list, heightOf(i), version, members, update(t, dt), info(), dispose() }
//
// - Built at boot (before the shader warm-up: each character's programs compile behind the loading screen; all 15
//   are visible in the warm-up frames, then only the occupied seats show). One Character per seat (characters.js
//   createCharacter, own clock), feet on the stone top (0.235 m), facing the dais; hidden seats are not updated.
// - Clips follow the store + the time module, as the game does: occupied = idle; dead = 'ghost' (vote unspent) /
//   'ghost-spent' ('die' plays first when a seat dies in front of you); the vote = 'vote' (held) when the dais' brass
//   hand reaches a voter (time.sweep / time.votes, the folk's timing); nomination: the nominator (the nearest living
//   seat before the nominee) turns to the nominee and plays 'point'; day / nomination: deterministic chatter ('talk'
//   one seat every TALK_EVERY s) and now and then a signature emote. The execution: the nominee dies when the store
//   marks the seat dead (time.js / the ceremony).
// - Swap: picking a seated character as your own swaps that seat to your previous character (like the idle NPCs).
// - The game UI sees the seated cast as townsfolk: demo.npcs.members is extended (name labels, talk bubbles, point /
//   pin targets, the notebook's seats) with slot 1000 + seat (gameui's NPC reading schedule starts slot k at
//   6 + 11 k s: ~3 h for these, i.e. the seated cast never pulls out a book mid-vote). ?seatLabels=0 keeps them out; ?seatCast=0 = the old folk.
import * as THREE from 'three';
import { createCharacter } from './characters.js';
import { loadRoster } from './roster.js';

const N = 15;
const SEAT_TOP = 0.235;
const NEED = ['talk', 'vote'];
const TALK_EVERY = 2.7, SIG_EVERY = 9.5, POINT_S = 1.8, DIE_S = 1.7;

export async function createSeatCast(demo) {
  const { engine, store, events, layout } = demo;
  const params = demo.params ?? new URLSearchParams();
  if (params.get('seatCast') === '0') return null;
  const C = layout.CIRCLE;
  const roster = await loadRoster();
  const clipsOf = new Map(roster.characters.map((c) => [c.id, c.clips ?? []]));
  const offered = (demo.characters ?? []).filter((c) => c.complete).map((c) => c.id);
  const busy = () => new Set([store.state.character, ...(demo.npcs?.members ?? []).filter(Boolean).map((n) => n.id), 'storyteller']);
  const castable = (id) => NEED.every((k) => clipsOf.get(id)?.includes(k));
  function pickIds() {
    const b = busy();
    const pool = offered.filter((id) => castable(id) && !b.has(id));
    const ids = [];
    for (let i = 0; i < N && pool.length; i++) ids.push(pool[i % pool.length]);
    return ids;
  }
  const ids = pickIds();
  if (!ids.length) throw new Error('seat cast: no offered cast character with talk + vote clips');
  const ground = { heightAt: () => SEAT_TOP };
  const seats = [];       // { i, id, h (handle), spot, home, face, shown, clip, dieAt, pointUntil, member }
  let version = 0;

  async function spawn(i, id) {
    const s = layout.seatPos(i, N);
    const spot = new THREE.Vector3(s.x, 0, s.z);
    const home = Math.atan2(C.cx - s.x, C.cz - s.z);
    const before = new Set(engine.scene.children);
    const h = await createCharacter(engine, id, { position: spot, face: home, ground });
    // the Character's scene-level FX / smear holders and its root get seat-cast names: the roster / playtest checks
    // count the player's + the idle NPCs' models by 'character:' and their 'char-fx' / 'smears' holders
    for (const o of engine.scene.children) if (!before.has(o) && /^(char-fx|smears)/.test(o.name)) { o.name = `seat-cast-${o.name}`; o.userData.seatCast = i; }
    const rec = seats[i] ?? { i, spot, home };
    const old = rec.h;
    Object.assign(rec, { id, h, face: home, shown: true, clip: 'idle', want: 'idle', dieAt: -1, pointUntil: -1, oneShotUntil: -1 });
    h.ch.drive(() => ({ pos: spot, face: rec.face }));
    h.root.name = `seat-cast:${i}:${id}`; h.root.userData.seatCast = i;
    engine.scene.add(h.root);
    old?.dispose();
    seats[i] = rec;
    version++;
    return rec;
  }
  await Promise.all(ids.map((id, i) => spawn(i, id)));

  // the old seated folk (time.js) give way
  const folk = engine.scene.getObjectByName('demo-time-folk');
  if (folk) folk.visible = false;

  // ---- the game UI: seated cast as townsfolk (slot 100 + seat)
  const members = seats.map((r) => ({ slot: 1000 + r.i, get id() { return r.id; }, spot: r.spot, get face() { return r.face; }, get handle() { return r.h; }, seat: r.i }));
  const shownMembers = [];
  if (demo.npcs && params.get('seatLabels') !== '0') {
    const npcs = demo.npcs;
    const proto = Object.getPrototypeOf(npcs);
    const d = Object.getOwnPropertyDescriptor(npcs, 'members') ?? Object.getOwnPropertyDescriptor(proto, 'members');
    const base = d?.get ? () => d.get.call(npcs) : () => d?.value ?? [];
    const out = [];
    Object.defineProperty(npcs, 'members', { configurable: true, enumerable: true, get() { out.length = 0; for (const m of base()) out.push(m); for (const m of shownMembers) out.push(m); return out; } });
  }

  // ---- swap: picking a seated character as yours puts your previous character on that seat
  let playerId = store.state.character, lastCast = castable(playerId) ? playerId : null;
  const offs = [];
  offs.push(events.on('player:character', ({ id }) => {
    const prev = playerId; playerId = id;
    const r = seats.find((x) => x?.id === id);
    const was = lastCast;
    if (castable(prev)) lastCast = prev;
    if (!r || !prev || prev === id) return;
    // (ui pass fix) a previous character that cannot sit (no talk + vote clips, e.g. the Wanderer) left YOU on that
    // seat as well (player frog -> clarabelle -> wanderer -> frog): seat the last castable character you played instead
    // (already drawn as the player: its programs exist, nothing compiles), else a free castable one
    let sub = castable(prev) ? prev : null;
    if (!sub) {
      const b = busy(), used = new Set(seats.filter(Boolean).map((x) => x.id)), free = (x) => x && castable(x) && !b.has(x) && !used.has(x);
      sub = free(was) ? was : offered.find(free) ?? null;
    }
    if (sub) spawn(r.i, sub).catch((e) => console.warn('[passB] seat swap failed:', e));
  }));

  // ---- state -> clips
  const seatOn = (st) => st.occupied || st.dead;
  const nomineeOf = (s) => (s.nominee ?? s.seats.findIndex((x) => x.nominated));
  let warm = true;
  offs.push(events.on('ready', () => { warm = false; }));
  let prevPhase = store.state.phase, nominator = -1, nominatedAt = -1;
  const hash = (k) => { const x = Math.sin(k * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const has = (r, c) => !!r.h?.spec?.clips?.[c];
  // a held one-shot ('vote', 'die': Character clip.hold) only lets go on play('idle'): release it before the next clip
  function play(r, c) {
    if (r.clip === c) return;
    if (c !== 'idle' && (r.clip === 'vote' || r.clip === 'die')) r.h.play('idle');
    r.clip = c; r.h.play(c);
  }

  let talkK = -1, sigK = -1;
  const info = { ids: seats.map((r) => r.id), shown: 0, updated: 0, clips: {}, nominator: -1 };
  const api = {
    get list() { return seats.map((r) => ({ seat: r.i, id: r.id, shown: r.shown, clip: r.h?.ch?.state?.clip ?? r.clip, face: +r.face.toFixed(3) })); },
    get version() { return version; },
    heightOf: (i) => (seats[i]?.h ? seats[i].h.height ?? null : null),
    members,
    update(t) {
      const s = store.state, ph = s.phase;
      if (ph !== prevPhase) {
        if (ph === 'nomination') {
          // the nominator: the nearest living occupied seat before the nominee (counter-clockwise)
          const nom = nomineeOf(s);
          nominator = -1;
          if (nom >= 0) for (let k = 1; k < N; k++) { const j = (nom - k + N) % N; const st = s.seats[j]; if (st.occupied && !st.dead) { nominator = j; break; } }
          nominatedAt = t;
        }
        prevPhase = ph;
      }
      info.nominator = nominator;
      const nom = nomineeOf(s), sweep = demo.time?.sweep, votes = demo.time?.votes;
      let shown = 0;
      shownMembers.length = 0;
      for (const r of seats) {
        if (!r?.h) continue;
        const st = s.seats[r.i], on = warm || seatOn(st);
        if (on !== r.shown) { r.shown = on; r.h.root.visible = on; }
        if (!on) continue;
        shown++;
        if (!warm) shownMembers.push(members[r.i]);
        // the persistent clip
        let want = 'idle';
        r.face = r.home;
        if (st.dead) {
          if (r.dieAt < 0) r.dieAt = t;
          const fresh = t - r.dieAt < DIE_S && has(r, 'die') && r.wasAlive;
          want = fresh ? 'die' : st.ghostVote !== false ? (has(r, 'ghost') ? 'ghost' : 'idle') : has(r, 'ghost-spent') ? 'ghost-spent' : has(r, 'ghost') ? 'ghost' : 'idle';
        } else {
          r.dieAt = -1; r.wasAlive = true;
          if (ph === 'vote' && votes?.has?.(r.i) && sweep) {
            const off = ((r.i - sweep.from + N) % N) || N;
            if (t >= sweep.t0 + (off - 1) * sweep.per - 0.25) want = 'vote';
          }
          if (ph === 'nomination' && r.i === nominator && nom >= 0 && t - nominatedAt < POINT_S + 0.4 && has(r, 'point')) {
            const q = layout.seatPos(nom, N);
            r.face = Math.atan2(q.x - r.spot.x, q.z - r.spot.z);
            if (t - nominatedAt > 0.4) want = 'point';
          }
        }
        if (want !== 'idle' || r.oneShotUntil < t) {
          if (want === 'idle' && r.clip !== 'idle' && r.oneShotUntil < t) play(r, 'idle');
          else if (want !== 'idle') { play(r, want); r.oneShotUntil = -1; }
        }
        r.wantNow = want;
        r.h.update(t);
        info.updated++;
      }
      // chatter: one living, idle seat talks every TALK_EVERY s (day / nomination); a signature emote every SIG_EVERY s
      if (!warm && (ph === 'day' || ph === 'nomination')) {
        const k = Math.floor(t / TALK_EVERY);
        if (k !== talkK) {
          talkK = k;
          const alive = seats.filter((r) => r?.shown && r.wantNow === 'idle' && !s.seats[r.i].dead);
          if (alive.length) { const r = alive[Math.floor(hash(k) * alive.length)]; if (has(r, 'talk')) { play(r, 'talk'); r.oneShotUntil = t + 2.2; } }
        }
        const g = Math.floor(t / SIG_EVERY);
        if (g !== sigK) {
          sigK = g;
          const alive = seats.filter((r) => r?.shown && r.wantNow === 'idle' && !s.seats[r.i].dead && r.h.emotes?.signature);
          if (alive.length) { const r = alive[Math.floor(hash(g + 77) * alive.length)]; const sig = r.h.emotes.signature; play(r, sig); r.oneShotUntil = t + 2.6; }
        }
      }
      info.shown = shown;
    },
    info() {
      const clips = {};
      for (const r of seats) if (r?.shown) { const cs = r.h?.ch?.state; clips[r.i] = cs?.action ? `${cs.action}` : cs?.clip ?? r.clip; }
      return { ids: seats.map((r) => r?.id), shown: info.shown, nominator: info.nominator, clips, folkHidden: folk ? !folk.visible : null, members: shownMembers.length };
    },
    dispose() { for (const o of offs) o?.(); for (const r of seats) r?.h?.dispose(); if (folk) folk.visible = true; },
  };
  return api;
}
