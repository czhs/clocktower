// OWNED BY world-audit. Server movement validation vs. realistic client movement: the client's
// prediction (packages/assets/test/navsim.ts = TownScene.stepLocal) is replayed along every
// standard route at 60 fps and its 15 Hz `move` messages are fed to the real WorldModule with a
// matching fake clock. The server must never answer a legitimate walk with a correction
// (rubber-banding) — with today's client, and with the corner nudge recommended in
// docs/world-audit.md (so the client fix can land without a server change).
import { describe, expect, it } from 'vitest';
import { townLayout as L } from '@ct/assets';
import { tileCenterPx, type WorldTeleport } from '@ct/protocol';
import { createWorldModule } from '../src/world/index.js';
import { createFakeHost } from './helpers/fakeHost.js';
import { bfs, lattice, pathTo, simulate, smooth, type Pt } from '../../../packages/assets/test/navsim.js';

const lat = lattice(L);

type Start = { kind: 'spawn' } | { kind: 'door'; id: string } | { kind: 'inside'; id: string };
interface Route {
  name: string;
  start: Start;
  to: Pt;
}

const routes: Route[] = [];
const houses = L.buildings.filter((b) => b.kind === 'house');
for (const b of L.buildings) {
  routes.push({ name: `spawn -> ${b.id}`, start: { kind: 'spawn' }, to: tileCenterPx(L, b.door) });
  if (b.bed) routes.push({ name: `${b.id} door -> bed`, start: { kind: 'inside', id: b.id }, to: tileCenterPx(L, b.bed) });
  if (b.visitPoint) routes.push({ name: `${b.id} door -> visit`, start: { kind: 'inside', id: b.id }, to: tileCenterPx(L, b.visitPoint) });
}
for (let i = 0; i < houses.length; i++) routes.push({ name: `${houses[i]!.id} -> ${houses[(i + 1) % houses.length]!.id}`, start: { kind: 'door', id: houses[i]!.id }, to: tileCenterPx(L, houses[(i + 1) % houses.length]!.door) });

function drive(r: Route, mode: 'pointer' | 'keys', sloppy: number, nudge: number) {
  const host = createFakeHost();
  const world = createWorldModule(host);
  host.setModules({ world });
  host.addMember({ pid: 'p0' });
  host.emit({ type: 'member_joined', pid: 'p0' });
  if (r.start.kind === 'door') {
    world.teleportToBuilding('p0', r.start.id, 'door');
    world.exitBuilding('p0', 'door');
  } else if (r.start.kind === 'inside') world.teleportToBuilding('p0', r.start.id, 'door');
  const from = world.positionOf('p0')!;
  const path = pathTo(lat, bfs(lat, from), r.to);
  if (!path) return { corrections: -1, arrived: false };
  let seq = 0;
  let lastSent = { ...from };
  const t0 = host.clock.now;
  const res = simulate(L, smooth(L, path, mode), {
    mode,
    sloppy,
    nudge,
    onFrame: (me, f, moving) => {
      // client: send at <= 15 Hz while something changed (positions rounded to 0.01 px)
      host.clock.now = t0 + Math.round(((f + 1) * 1000) / 60);
      if ((f % 4 === 0 || !moving) && (Math.abs(me.x - lastSent.x) > 0.05 || Math.abs(me.y - lastSent.y) > 0.05 || !moving)) {
        seq += 1;
        world.handleMove('p0', { seq, x: Math.round(me.x * 100) / 100, y: Math.round(me.y * 100) / 100, facing: 'down', moving });
        lastSent = { x: me.x, y: me.y };
      }
    },
  });
  const corrections = (host.sent.get('p0') ?? []).filter((m) => m.type === 'world:teleport' && (m.payload as WorldTeleport).reason === 'correction').length;
  return { corrections, arrived: res.arrived, final: world.positionOf('p0'), me: res.me };
}

describe('server accepts realistic client movement (no rubber-banding) — world-audit', () => {
  for (const [mode, sloppy, nudge] of [
    ['pointer', 0, 0],
    ['keys', 0, 0],
    ['pointer', 3, 4],
    ['keys', 3, 4],
  ] as const) {
    it(`${mode}${sloppy ? ' sloppy + 4px nudge' : ' planned'}: ${routes.length} routes, zero corrections, server ends where the client is`, () => {
      const bad: string[] = [];
      for (const r of routes) {
        const out = drive(r, mode, sloppy, nudge);
        if (!out.arrived) bad.push(`${r.name}: client sim did not arrive`);
        else if (out.corrections !== 0) bad.push(`${r.name}: ${out.corrections} corrections`);
        else if (Math.hypot(out.final!.x - out.me!.x, out.final!.y - out.me!.y) > 0.02) bad.push(`${r.name}: server/client drift`);
      }
      expect(bad).toEqual([]);
    });
  }
});
