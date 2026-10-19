// Outline test scene (owner: outlines). Self-contained geometry so it does not depend on other modules.
//   stacked offset blocks (t3ssel8r pillars), stairs, an octagonal ring, spheres (flat ico, smooth UV,
//   depth-only), a sloped ground + smooth hill + a cliff plateau, cubes at 0/45°, an L-wall, a chamfered
//   rock and FLAG_NONE grass blades around a stone.
// Query: ?view=a|b (two framings), ?outline=0 disables the pass, ?outlineDebug=1 colours the lines.
import * as THREE from 'three';
import { toonMesh, rampFromTones } from '../src/materials/toon.js';
import { rng } from '../src/core/noise.js';
import { applyOutlineStyle } from '../src/post/outline.js';

const STONE = rampFromTones('#BBAC97', '#8C7E72', '#5B5A64');
const STONE2 = rampFromTones('#B3A28E', '#857767', '#55535F');
const GRASS = rampFromTones('#A9C46A', '#75A558', '#3E6E5A');
const DIRT = rampFromTones('#B39A74', '#8A7356', '#5A5260');
const CYAN = rampFromTones('#7FD3F5', '#4BA8E8', '#2F7FC4');

function mesh(engine, geo, tone, extra = {}) {
  return toonMesh(engine, geo, { color: tone.color, ramp: tone.ramp, flatShading: true, ...extra });
}

// closed wedge, local: base x∈[0,len], z∈[-w/2,w/2]; top rises from y=0 at x=0 to y=h at x=len
function wedge(len, w, h) {
  const a = [0, 0, w / 2], b = [len, 0, w / 2], c = [len, h, w / 2];
  const d = [0, 0, -w / 2], e = [len, 0, -w / 2], f = [len, h, -w / 2];
  const tri = (...v) => v.flat();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([
    ...tri(a, c, f), ...tri(a, f, d),   // slope
    ...tri(a, b, c), ...tri(d, f, e),   // sides
    ...tri(b, e, f), ...tri(b, f, c),   // high end (vertical)
  ], 3));
  g.computeVertexNormals();
  return g;
}

function pillar(engine, group, x, z, seed, n = 6) {
  const r = rng(seed);
  let y = 0;
  for (let i = 0; i < n; i++) {
    const w = 0.75 + r() * 0.35, d = 0.75 + r() * 0.35, h = 0.28 + r() * 0.34;
    const b = mesh(engine, new THREE.BoxGeometry(w, h, d), i % 3 === 1 ? STONE2 : STONE);
    const q = () => [-0.12, 0, 0.12][Math.floor(r() * 3)];   // flush or ≥ 0.12 m steps (no 1-px slivers)
    b.position.set(x + q(), y + h / 2, z + q());
    group.add(b);
    y += h;
  }
}

function stairs(engine, group, x, z, steps = 5) {
  for (let i = 0; i < steps; i++) {
    const h = 0.25 * (i + 1);
    const b = mesh(engine, new THREE.BoxGeometry(1.6, h, 0.4), STONE);
    b.position.set(x, h / 2, z - i * 0.4);
    group.add(b);
  }
}

function octRing(engine, group, x, z, R = 2.2, r = 1.6, h = 0.55) {
  const shape = new THREE.Shape();
  const hole = new THREE.Path();
  for (let i = 0; i <= 8; i++) {
    const a = (i + 0.5) / 8 * Math.PI * 2;
    (i ? shape.lineTo : shape.moveTo).call(shape, Math.cos(a) * R, Math.sin(a) * R);
    (i ? hole.lineTo : hole.moveTo).call(hole, Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false }).rotateX(-Math.PI / 2);
  const m = mesh(engine, g, STONE);
  m.position.set(x, 0, z);
  group.add(m);
  // inner step (second tier, recessed) + basin floor
  const g2 = new THREE.CylinderGeometry(1.0, 1.0, 0.9, 8).rotateY(Math.PI / 8);
  const m2 = mesh(engine, g2, STONE2);
  m2.position.set(x, 0.45, z);
  group.add(m2);
}

function grassPatch(engine, group, cx, cz, rad, count, seed) {
  const r = rng(seed);
  const pos = [];
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * rad;
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    const h = 0.18 + r() * 0.16, w = 0.05, yaw = Math.PI / 4;   // face the camera (yaw 45°)
    const ux = Math.cos(yaw) * w, uz = -Math.sin(yaw) * w;
    const lean = (r() - 0.5) * 0.1;
    pos.push(x - ux, 0, z - uz, x + ux, 0, z + uz, x + lean, h, z + lean);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const m = toonMesh(engine, g, {
    color: GRASS.color, ramp: GRASS.ramp, outline: 'none', side: THREE.DoubleSide,
    transparent: true, depthWrite: false, blending: THREE.NoBlending, alphaTest: 0.5,
  }, { castShadow: false, receiveShadow: true });
  m.material.userData.toon.uMatHi.value.copy(GRASS.ramp.hi).multiplyScalar(1.08);  // slightly lighter than ground
  group.add(m);
}

export default async function build(engine, params) {
  const { scene } = engine;
  const view = params?.get?.('view') || 'a';
  if (params?.get?.('outline') === '0') engine.pipeline.getPass('outline').enabled = false;
  applyOutlineStyle(engine, {});
  const G = new THREE.Group();
  scene.add(G);

  // ground: flat meadow + a gentle smooth hill (interpolated normals, must show no lines)
  const N = 120, S = 44;
  const hill = (x, z) => 1.1 * Math.exp(-((x + 8.0) ** 2 + (z + 1.0) ** 2) / 5);
  const gg = new THREE.PlaneGeometry(S, S, N, N).rotateX(-Math.PI / 2);
  const p = gg.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, hill(p.getX(i), p.getZ(i)));
  gg.computeVertexNormals();
  G.add(toonMesh(engine, gg, { color: GRASS.color, ramp: GRASS.ramp }));

  // planar ramp (sloped ground, flat-shaded) rising +x to a turf-capped plateau with a dirt cliff
  const top = 1.2;
  const rampM = mesh(engine, wedge(4.0, 5.5, top), GRASS);
  rampM.position.set(1.5, 0, -4.75);
  G.add(rampM);
  const plateau = mesh(engine, new THREE.BoxGeometry(3.5, top - 0.15, 5.5), DIRT);
  plateau.position.set(5.5 + 1.75, (top - 0.15) / 2, -4.75);
  const cap = mesh(engine, new THREE.BoxGeometry(3.5, 0.15, 5.5), GRASS);   // turf band, flush with the dirt
  cap.position.set(5.5 + 1.75, top - 0.075, -4.75);
  G.add(plateau, cap);
  // grazing slope: rises TOWARDS the camera at 24° (view angle ≈ 6°), a classic false-line trap
  const graze = mesh(engine, wedge(3.2, 3.0, 3.2 * Math.tan(24 * Math.PI / 180)), DIRT);
  graze.position.set(-4.6, 0, -6.4); graze.rotation.y = -Math.PI / 4;   // local +x -> world (1,0,1)/√2
  G.add(graze);

  // a tall cliff block (stone) with a ledge
  const cliff = mesh(engine, new THREE.BoxGeometry(2.4, 2.2, 2.0), DIRT);
  cliff.position.set(-1.0, 1.1, -9.0);
  G.add(cliff);
  const ledge = mesh(engine, new THREE.BoxGeometry(2.6, 0.5, 2.4), STONE2);
  ledge.position.set(-0.9, 0.25, -8.5);
  G.add(ledge);

  pillar(engine, G, -2.5, -2.0, 11, 7);
  pillar(engine, G, 0.5, -4.5, 23, 5);
  pillar(engine, G, -4.0, 1.5, 37, 4);
  stairs(engine, G, 3.5, 2.5);
  octRing(engine, G, -0.5, 4.0);

  const ico = mesh(engine, new THREE.IcosahedronGeometry(0.75, 1), STONE);
  ico.position.set(2.2, 0.75, -0.5);
  const sph = toonMesh(engine, new THREE.SphereGeometry(0.6, 24, 16), { color: CYAN.color, ramp: CYAN.ramp });
  sph.position.set(4.2, 0.6, 0.0);
  const sphD = mesh(engine, new THREE.IcosahedronGeometry(0.55, 1), STONE2, { outline: 'depth' });
  sphD.position.set(5.6, 0.55, 1.6);
  G.add(ico, sph, sphD);

  const cube0 = mesh(engine, new THREE.BoxGeometry(0.9, 0.9, 0.9), STONE);
  cube0.position.set(-1.8, 0.45, 7.8);
  const cube45 = mesh(engine, new THREE.BoxGeometry(0.9, 0.9, 0.9), CYAN);
  cube45.position.set(1.8, 0.45, 7.2); cube45.rotation.y = Math.PI / 4;
  G.add(cube0, cube45);

  // L-shaped wall
  const w1 = mesh(engine, new THREE.BoxGeometry(3.0, 0.9, 0.4), STONE2);
  w1.position.set(-5.5, 0.45, 6.5);
  const w2 = mesh(engine, new THREE.BoxGeometry(0.4, 0.9, 2.4), STONE2);
  w2.position.set(-6.8, 0.45, 5.5);
  G.add(w1, w2);

  // chamfered rock in a grass patch
  const rock = mesh(engine, new THREE.DodecahedronGeometry(0.55, 0), STONE);
  rock.position.set(5.0, 0.3, 4.5); rock.rotation.set(0.3, 0.5, 0.1);
  G.add(rock);
  grassPatch(engine, G, 5.0, 4.5, 1.6, 420, 5);
  grassPatch(engine, G, -2.5, -2.0, 1.4, 260, 9);

  engine.setSun({ dir: new THREE.Vector3(0.75, 0.9, 0.35), intensity: 1, shadowExtent: 22 });
  const vh = Number(params?.get?.('vh') || 10);
  const tgt = view === 'b' ? new THREE.Vector3(-3, 0.8, 2) : new THREE.Vector3(0, 0.8, 0.5);
  const yaw = Number(params?.get?.('yaw') ?? 45) * Math.PI / 180;
  engine.camera.set({ target: tgt, yaw, pitch: Math.PI / 6, viewHeight: vh });
}
