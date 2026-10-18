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
import { CEREMONY } from '../town/life/ceremony.js';
import { sealVoteAt } from './sealvote.js';

const N = 15;
const SEAT_TOP = 0.235;
const NEED = ['talk', 'vote'];
const TALK_EVERY = 2.7, SIG_EVERY = 9.5, POINT_S = 2.6, DIE_S = 1.7;

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
  // (B) the vote staging (votestage.js): while staged a seat stands on its VOTE spot (on the setts / the tower court:
  // the terrain's height, not the stone's) at the stage's cast scale; it swaps between stone and spot in one drawing,
  // hidden by the Storyteller's puff (votemarks.js draws the poofs)
  const stage = () => demo.passB?.stage ?? null;
  const groundApi = demo.town?.registry?.get?.('ground')?.api;
  const terrain = (x, z) => (typeof groundApi?.heightAt === 'function' ? groundApi.heightAt(x, z) : 0);
  const seats = [];       // { i, id, h (handle), spot (the stone), home, pos (where it stands now), staged, face, shown, clip, ... }
  let version = 0;

  async function spawn(i, id) {
    const s = layout.seatPos(i, N);
    const spot = new THREE.Vector3(s.x, 0, s.z);
    const home = Math.atan2(C.cx - s.x, C.cz - s.z);
    const before = new Set(engine.scene.children);
    const rec = seats[i] ?? { i, spot, home, pos: spot.clone(), staged: false };
    const ground = { heightAt: (x, z) => (rec.staged ? terrain(x, z) : SEAT_TOP) };
    const h = await createCharacter(engine, id, { position: rec.pos, face: home, ground });
    // the Character's scene-level FX / smear holders and its root get seat-cast names: the roster / playtest checks
    // count the player's + the idle NPCs' models by 'character:' and their 'char-fx' / 'smears' holders
    for (const o of engine.scene.children) if (!before.has(o) && /^(char-fx|smears)/.test(o.name)) { o.name = `seat-cast-${o.name}`; o.userData.seatCast = i; }
    const old = rec.h;
    Object.assign(rec, { id, h, face: rec.staged ? rec.face : home, shown: true, clip: 'idle', want: 'idle', dieAt: -1, pointUntil: -1, oneShotUntil: -1 });
    if (rec.staged) { h.root.scale.setScalar(stage()?.scale ?? 1); }
    h.ch.drive(() => ({ pos: rec.pos, face: rec.face }));
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
  // (spot = where the seat stands NOW: the stone, or its vote spot while staged; scale = the staged cast scale, gameui
  // lifts the name label by it)
  const members = seats.map((r) => ({ slot: 1000 + r.i, get id() { return r.id; }, get spot() { return r.pos; }, get face() { return r.face; }, get handle() { return r.h; }, get scale() { return r.staged ? stage()?.scale ?? 1 : 1; }, seat: r.i }));

  // ---- staging: put a seat on its vote spot / back on its stone in ONE drawing. The Character's motion state is
  // re-seated at the new spot (no velocity spike: no stumble, no lean, the feet re-planted under the body, the facing
  // sector set directly) - src/chars is read-only, so this writes the few fields Character._resetSim initialises.
  const V0 = new THREE.Vector3(), TAU = Math.PI * 2;
  function warp(r, x, z, face, staged) {
    r.staged = staged;
    r.pos.set(x, 0, z);
    r.face = face;
    r.h.root.scale.setScalar(staged ? stage()?.scale ?? 1 : 1);
    const ch = r.h.ch, s = ch._s;
    if (!s) return;
    const y = ch.opts.ground ? ch.opts.ground.heightAt(x, z) : 0, P = new THREE.Vector3(x, y, z);
    const cam = engine.camera.targetYaw ?? 0, step = TAU / (ch.opts.facingSteps || 8), k = Math.round((face - cam) / step);
    s.k = k; s.facingYaw = cam + k * step; s.desired = face; s.heading = face;
    s.prevPos.copy(P); s.vel.set(0, 0, 0); s.velF?.reset?.(V0.clone()); s.prevVelF?.set(0, 0, 0);
    s.lean?.reset?.(new THREE.Vector2()); s.chestYaw?.reset?.(s.facingYaw); s.headYaw?.reset?.(s.facingYaw);
    ch.gait?.reset?.(P, s.facingYaw, ch.opts.ground);
    for (const c of ch._chains ?? []) { c.init = false; c.cached = false; for (const L of c.links) L.dir = null; }
    s.snapChains = true;
    ch.root.position.copy(P); ch.root.rotation.set(0, s.facingYaw, 0); ch.root.updateMatrixWorld(true);
  }
  function placeFor(r, t) {
    const st = stage();
    const want = !!st && st.gathered(r.i, t);
    if (want === r.staged) return;
    if (want) { const p = st.spots[r.i]; warp(r, p.x, p.z, p.face, true); } else warp(r, r.spot.x, r.spot.z, r.home, false);
    version++;
  }
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

  // ---- (seal vote, critic-3 P3) YOUR SEAT: while the vote camera is up on the stones (stage A) you sit in the circle
  // like everyone else: the seat nearest to you when the camera comes up (never the nominee's, never a dead one; the
  // ceremony's nominee / dead seats are known ahead) - its cast member steps aside (hidden), you appear on the stone
  // (player.teleport, facing the dais) and YOUR seal is yours to slap / take back (X, or the action bar's seal button,
  // gameui.js). Walking off the stone gives the seat back; leaving the vote camera puts you down just outside the ring.
  let yours = -1, yoursAt = -1;
  const P0 = new THREE.Vector3();
  function pickYours() {
    const p = demo.player?.position;
    if (!p || demo.player?.interior || demo.player?.handle?.id === 'storyteller') return -1;
    const s = store.state, cer = !!demo.time?.ceremony, nom = s.nominee ?? s.seats.findIndex((x) => x.nominated);
    let best = -1, bd = Infinity;
    for (let i = 0; i < N; i++) {
      if (i === nom || s.seats[i]?.dead) continue;
      if (cer && (i === CEREMONY.nominee || CEREMONY.dead.includes(i))) continue;
      const q = layout.seatPos(i, N), d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  function sit(i) {
    if (i < 0 || !demo.player?.teleport) return;
    yours = i; yoursAt = engine.time;
    const q = layout.seatPos(i, N);
    demo.player.teleport(q.x, q.z, Math.atan2(C.cx - q.x, C.cz - q.z), { exact: true, location: 'town', keepCamera: true });
    version++;
    events.emit('seat:yours', { seat: i });
  }
  function stand({ move = true } = {}) {
    if (yours < 0) return;
    const i = yours; yours = -1;
    if (move && demo.player?.teleport) {
      const q = layout.seatPos(i, N), ox = q.x - C.cx, oz = q.z - C.cz, n = Math.hypot(ox, oz) || 1;
      demo.player.teleport(q.x + (ox / n) * 1.25, q.z + (oz / n) * 1.25, Math.atan2(-ox, -oz), { location: 'town' });
    }
    version++;
    events.emit('seat:yours', { seat: -1 });
  }
  const ringStage = () => { const st = stage(); return !st || st.onStones; };
  offs.push(store.on('camera', ({ value, prev }) => {
    if (value === 'vote' && prev !== 'vote' && ringStage() && params.get('yourSeat') !== '0') sit(pickYours());
    else if (value !== 'vote' && prev === 'vote') stand();
  }));
  /** slap / take back YOUR seal (X, the action bar's seal button) -> { ok, why } */
  function toggleSeal() {
    const s = store.state, tm = demo.time;
    if (yours < 0) return { ok: false, why: 'You have no seat in this vote' };
    if (s.phase !== 'vote') return { ok: false, why: s.phase === 'nomination' ? 'Wait for the vote to open' : 'There is no vote right now' };
    const V = demo.gameui?.voteOf?.();
    const S = V ? sealVoteAt(V, engine.time, tm?.seals?.log) : null, d = S?.seats?.[yours + 1];
    if (d && (d.yes || d.no)) return { ok: false, why: d.yes ? 'The clock hand has locked your vote' : 'The clock hand has passed you' };
    const down = !!tm?.seals?.downAt?.(yours, engine.time);
    tm?.setVote?.(yours, !down);
    if (!down) demo.player?.emote?.('vote'); else demo.player?.handle?.play?.('idle');
    events.emit('seat:seal', { seat: yours, down: !down });
    return { ok: true, down: !down };
  }
  offs.push(demo.input?.bind?.('KeyX', () => {
    const r = toggleSeal();
    if (!r.ok) events.emit('toast', { text: r.why });
  }, { desc: 'vote: slap your seal / take it back', group: 'town' }));

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
    get list() { return seats.map((r) => ({ seat: r.i, id: r.id, shown: r.shown, clip: r.h?.ch?.state?.clip ?? r.clip, face: +r.face.toFixed(3), staged: r.staged, at: [+r.pos.x.toFixed(2), +r.pos.z.toFixed(2)] })); },
    get version() { return version; },
    heightOf: (i) => (seats[i]?.h ? seats[i].h.height ?? null : null),
    /** (B) where seat i stands now: { pos (feet, world), height (as shown, x the cast scale), staged } */
    spotOf(i) {
      // (seal vote) YOUR seat: you stand there (the player's figure on the stone)
      if (i === yours && demo.player?.position) {
        const p = demo.player.position, h = demo.player.handle;
        return { pos: P0.set(p.x, SEAT_TOP, p.z).clone(), height: h?.height ?? 1.4, scale: 1, staged: false, id: h?.id ?? null, shown: true, shownAt: null, you: true };
      }
      const r = seats[i];
      if (!r) return null;
      const sc = r.staged ? stage()?.scale ?? 1 : 1;
      return { pos: new THREE.Vector3(r.pos.x, r.staged ? terrain(r.pos.x, r.pos.z) : SEAT_TOP, r.pos.z), height: (r.h?.height ?? 1.4) * sc, scale: sc, staged: r.staged, id: r.id, shown: r.shown, shownAt: r.shownAt ?? null, face: r.face };
    },
    members,
    /** (seal vote) your seat in the vote (0-based) or -1; toggleSeal() = X; sit(i) / stand() for tests */
    get yours() { return yours; },
    toggleSeal, sit, stand,
    update(t) {
      const s = store.state, ph = s.phase;
      if (ph !== prevPhase) {
        // the nominator: the nearest living occupied seat before the nominee (counter-clockwise); points at the nominee
        // when the nomination is made AND again as the vote opens (the accusation stands while the hand starts round)
        if (ph === 'nomination' || ph === 'vote') {
          const nom = nomineeOf(s);
          nominator = -1;
          // (the nearest one whose character HAS a point clip: a nominator that cannot point reads as nobody accusing)
          if (nom >= 0) for (const needPoint of [true, false]) {
            for (let k = 1; k < N && nominator < 0; k++) { const j = (nom - k + N) % N; const st = s.seats[j]; if (st.occupied && !st.dead && (!needPoint || (seats[j] && has(seats[j], 'point')))) nominator = j; }
            if (nominator >= 0) break;
          }
          nominatedAt = t;
        }
        prevPhase = ph;
      }
      info.nominator = nominator;
      const nom = nomineeOf(s), seals = demo.time?.seals;
      // walked off your stone: the seat goes back to its cast member
      if (yours >= 0 && demo.player?.position) {
        const q = layout.seatPos(yours, N), p = demo.player.position;
        if (Math.hypot(p.x - q.x, p.z - q.z) > 0.6 && t - yoursAt > 0.5) stand({ move: false });
      }
      let shown = 0;
      shownMembers.length = 0;
      for (const r of seats) {
        if (!r?.h) continue;
        const st = s.seats[r.i], on = warm || (seatOn(st) && r.i !== yours);
        if (on !== r.shown) { r.shown = on; r.h.root.visible = on; if (on && !warm) r.shownAt = t; }
        if (!on) continue;
        shown++;
        if (!warm) shownMembers.push(members[r.i]);
        placeFor(r, t);
        // the persistent clip
        let want = 'idle';
        r.face = r.staged ? stage().spots[r.i].face : r.home;
        if (st.dead) {
          if (r.dieAt < 0) r.dieAt = t;
          const fresh = t - r.dieAt < DIE_S && has(r, 'die') && r.wasAlive;
          want = fresh ? 'die' : st.ghostVote !== false ? (has(r, 'ghost') ? 'ghost' : 'idle') : has(r, 'ghost-spent') ? 'ghost-spent' : has(r, 'ghost') ? 'ghost' : 'idle';
        } else {
          r.dieAt = -1; r.wasAlive = true;
          // (seal vote) the 'vote' clip plays as the voter SLAPS their seal down and holds while it lies there;
          // taking it back releases it (the seals' log, sealvote.js: scripted voters are written ahead)
          if (ph === 'vote' && seals?.downAt?.(r.i, t)) want = 'vote';
          if ((ph === 'nomination' || ph === 'vote') && r.i === nominator && nom >= 0 && t - nominatedAt < POINT_S + 0.4 && has(r, 'point') && want === 'idle') {
            const q = seats[nom]?.pos ?? layout.seatPos(nom, N);
            r.face = Math.atan2(q.x - r.pos.x, q.z - r.pos.z);
            if (t - nominatedAt > 0.4) want = 'point';
          }
        }
        // the accusation holds through its window: a point that finished is drawn again (one-shot clips end ~1 s)
        if (want === 'point' && r.clip === 'point' && !r.h.ch?.state?.action && t - (r.pointAt ?? -9) > 0.3) r.clip = 'idle';
        if (want === 'point' && r.clip !== 'point') r.pointAt = t;
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
