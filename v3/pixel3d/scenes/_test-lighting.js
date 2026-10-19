// Lighting test scene (owner: lighting). TECHNIQUES §3.10.
//   ?tod=morning|noon|golden|night   ?clouds=0|1 (default 1)   ?grade=0|1 (default 1)   ?cover=0.55
//   ?palette=1 (OKLab snap to the shrine palette)   ?quant=8 (OKLab posterize)   ?yaw=45 (deg)   ?vh=10 (viewHeight)   ?lantern=1 (night point light)
// Flat ground + bumps (smooth normals, normal noise), box row at 0/45/90°, a smooth and a flat sphere,
// a stacked-block pillar, a tall obelisk casting a long shadow, an overhang slab, a floating cube.
import * as THREE from 'three';
import { toonMesh, rampFromTones } from '../src/materials/toon.js';
import { applyTimeOfDay, setClouds } from '../src/world/sky.js';
import { addGrade } from '../src/post/grade.js';
import { noise2 } from '../src/core/noise.js';

const GRASS = rampFromTones('#BBD985', '#75A558', '#3B6B5A');
const STONE = rampFromTones('#BBAC97', '#8C7E72', '#5B5A64');
const COBBLE = rampFromTones('#606C77', '#535B6B', '#444B5C');
const CUBE = rampFromTones('#7FD3F5', '#4BA8E8', '#2F7FC4');

function groundGeometry(size = 48, seg = 192) {
  const g = new THREE.PlaneGeometry(size, size, seg, seg).rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    // gentle rolling field + two mounds front-left / back-right
    let h = (noise2(x * 0.12, z * 0.12, 3) - 0.5) * 0.35;
    const m1 = Math.hypot(x + 4.5, z - 2.0), m2 = Math.hypot(x - 2.5, z + 5.5);
    h += 1.6 * Math.exp(-(m1 * m1) / 3.0) + 1.2 * Math.exp(-(m2 * m2) / 2.0);
    // flatten the pad around the props
    const pad = Math.hypot(x - 0.5, z + 0.3);
    h *= THREE.MathUtils.smoothstep(pad, 2.5, 4.0);
    p.setY(i, h);
  }
  g.computeVertexNormals();
  return g;
}

export default async function build(engine, params) {
  const { scene } = engine;
  const tod = params.get('tod') || 'noon';
  const yaw = THREE.MathUtils.degToRad(Number(params.get('yaw') ?? 45));
  engine.camera.set({ target: new THREE.Vector3(0, 0.5, 0), yaw, pitch: Math.PI / 6, viewHeight: Number(params.get('vh') ?? 10) });
  applyTimeOfDay(engine, tod);
  setClouds(engine, params.get('clouds') === '0' ? { scale: 0 } : { cover: Number(params.get('cover') ?? 0.55) });
  const PAL = ['#BBD985', '#75A558', '#3B6B5A', '#BBAC97', '#8C7E72', '#5B5A64', '#606C77', '#535B6B', '#444B5C',
    '#7FD3F5', '#4BA8E8', '#2F7FC4', '#E2D6BC', '#706D74', '#BFE0EA'];
  const gopts = {};
  if (params.get('palette') === '1') gopts.palette = PAL;
  if (params.get('quant')) gopts.quantize = Number(params.get('quant'));
  if (params.get('grade') !== '0') addGrade(engine, gopts);

  scene.add(toonMesh(engine, groundGeometry(), { ...GRASS, normalNoise: Number(params.get('nn') ?? 0.15) }, { castShadow: false }));

  const stone = (geo, pos, rotY = 0, tones = STONE) => {
    const m = toonMesh(engine, geo, { ...tones, flatShading: true });
    m.position.copy(pos); m.rotation.y = rotY; scene.add(m); return m;
  };
  // box row at 0 / 45 / 90 degrees
  [0, 45, 90].forEach((deg, i) => stone(new THREE.BoxGeometry(0.9, 0.9, 0.9), new THREE.Vector3(-2.2 + i * 1.6, 0.45, 1.6), THREE.MathUtils.degToRad(deg)));
  // smooth sphere + flat ico
  const sph = toonMesh(engine, new THREE.SphereGeometry(0.65, 32, 16), { ...STONE });
  sph.position.set(2.6, 0.65, -0.6); scene.add(sph);
  stone(new THREE.IcosahedronGeometry(0.6, 1), new THREE.Vector3(2.0, 0.55, 1.5));
  // stacked-block pillar (offset slabs, 45°-friendly)
  const blocks = [[0.95, 0.42, 0.9, 0.00, 0.00], [0.85, 0.5, 0.85, 0.05, -0.03], [0.9, 0.38, 0.8, -0.06, 0.02],
    [0.8, 0.52, 0.86, 0.03, 0.05], [0.92, 0.36, 0.92, 0.0, -0.04], [1.02, 0.3, 1.0, -0.02, 0.0]];
  let y = 0;
  for (const [w, h, d, ox, oz] of blocks) { stone(new THREE.BoxGeometry(w, h, d), new THREE.Vector3(-2.4 + ox, y + h / 2, -1.4 + oz)); y += h; }
  // tall obelisk (long shadow)
  stone(new THREE.BoxGeometry(0.5, 4.2, 0.5), new THREE.Vector3(0.4, 2.1, -2.6), Math.PI / 4);
  // overhang: two posts + a lintel slab (self-shadow / acne check under the slab)
  stone(new THREE.BoxGeometry(0.35, 1.0, 0.35), new THREE.Vector3(-0.6, 0.5, -0.2));
  stone(new THREE.BoxGeometry(0.35, 1.0, 0.35), new THREE.Vector3(0.9, 0.5, -0.2));
  stone(new THREE.BoxGeometry(2.0, 0.25, 0.8), new THREE.Vector3(0.15, 1.125, -0.2));
  // low cobble slab on the ground (contact shadow / peter-panning check)
  stone(new THREE.BoxGeometry(1.4, 0.12, 1.0), new THREE.Vector3(-0.4, 0.06, 3.0), 0, COBBLE);
  // floating cyan cube
  const cube = toonMesh(engine, new THREE.BoxGeometry(0.35, 0.35, 0.35), { ...CUBE, flatShading: true });
  cube.position.set(0.15, 1.75, -0.2); scene.add(cube);

  if (tod === 'night' && params.get('lantern') !== '0') {
    const pl = new THREE.PointLight(new THREE.Color('#FFC46B'), 2.2, 5.5, 1.2);
    pl.position.set(-1.2, 0.9, 0.9); scene.add(pl);
    const lamp = toonMesh(engine, new THREE.BoxGeometry(0.16, 0.22, 0.16), { color: '#FFC46B', ramp: { hi: [1.3, 1.2, 1.0], sh: [1, 0.9, 0.7] } }, { castShadow: false });
    lamp.material.emissive = new THREE.Color('#FFB040');
    lamp.position.copy(pl.position); scene.add(lamp);
    engine.onUpdate((t) => { // 8 fps stepped flicker, deterministic
      const k = Math.floor(t * 8);
      pl.intensity = 2.0 + 0.35 * (noise2(k * 0.37, 1.3, 9) - 0.5);
    });
  }
}
