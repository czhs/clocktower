// Look test scene (owner: look). Character material, FLAG_CHAR outlines, far-half shadow, ground separation.
//   ?view=main (default) | ab | facings | pillars
//     main     one character in the sun between a pillar in front and one behind + one in a cast shadow (invisible caster)
//     ab       the same character twice: far-half OFF (left) / ON (right), in sun, and both again in a cast shadow
//     facings  8 characters at the 8 quantized facings (0 = facing the camera, +45° each, turning to its left)
//     pillars  close-up of the pillar-in-front / pillar-behind cases for the FLAG_CHAR outline rules
//   ?tod=noon|morning|golden|night  ?vh=<viewHeight> (default 10 = reference zoom; 6 for close-ups)
//   ?char=spike (default) | mannequin (characters/mannequin.js + src/chars/rig.js when they exist)
//   ?face=<0-7> (main/ab) ?pose=walk|rest ?far=0 (far-half off everywhere) ?midline=pixel ?cloud=root|pixel|off
//   ?clouds=0 (no cloud shadows; default on)  ?look=far (forced pixels tinted magenta)
//   engine debug views work as usual: ?debug=flags|normal|depth ?outlineDebug=1|2
// Deterministic: everything is a function of t (the pose is static unless ?anim=1: stepped walk at 8 fps).
import * as THREE from 'three';
import { applyTimeOfDay, setClouds } from '../src/world/sky.js';
import { createTerrain } from '../src/world/terrain.js';
import { createPillar } from '../src/world/props.js';
import { createGrass, viewArea } from '../src/world/grass.js';
import { buildSpikeCharacter, chamferBox } from '../src/chars/spike.js';
import { characterMaterial, updateLook } from '../src/chars/look.js';

const B = (w, h, d, c) => chamferBox(w, h, d, c);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

// spike skeleton dressed like t3ssel8r's elf (refs/chars/01): white hair, brown capelet, olive tunic, boots
export const LOOK_SPEC = {
  palette: {
    hair: ['#F6F2E4', '#DCDDDA', '#98A6BC'],
    cape: ['#9A6A4C', '#714C38', '#4A3432'],
    tunic: ['#7A7A62', '#58584A', '#3A3A40'],
    skin: ['#F2C49A', '#D49E78', '#946C72'],
    boots: ['#7A4E36', '#553828', '#33262A'],
  },
  bones: [
    { name: 'hips', pos: [0, 0.55, 0] }, { name: 'chest', parent: 'hips', pos: [0, 0.22, 0] },
    { name: 'head', parent: 'chest', pos: [0, 0.3, 0] },
    { name: 'armL', parent: 'chest', pos: [0.2, 0.22, 0] }, { name: 'foreL', parent: 'armL', pos: [0, -0.2, 0] },
    { name: 'armR', parent: 'chest', pos: [-0.2, 0.22, 0] }, { name: 'foreR', parent: 'armR', pos: [0, -0.2, 0] },
    { name: 'legL', parent: 'hips', pos: [0.09, -0.04, 0] }, { name: 'shinL', parent: 'legL', pos: [0, -0.25, 0] },
    { name: 'legR', parent: 'hips', pos: [-0.09, -0.04, 0] }, { name: 'shinR', parent: 'legR', pos: [0, -0.25, 0] },
  ],
  parts: [
    { bone: 'hips', geo: box(0.32, 0.16, 0.22), at: [0, 0.02, 0], color: 'boots' },
    { bone: 'chest', geo: box(0.3, 0.3, 0.2), at: [0, 0.08, 0], color: 'tunic' },
    { bone: 'chest', geo: B(0.42, 0.2, 0.3, 0.5), at: [0, 0.16, -0.01], color: 'cape' },       // capelet
    { bone: 'chest', geo: box(0.34, 0.24, 0.06), at: [0, 0.0, -0.14], color: 'cape' },        // cape back
    { bone: 'head', geo: box(0.28, 0.26, 0.26), at: [0, 0.13, 0.01], color: 'skin' },
    { bone: 'head', geo: B(0.34, 0.14, 0.32, 0.5), at: [0, 0.27, -0.01], color: 'hair' },
    { bone: 'head', geo: box(0.3, 0.16, 0.08), at: [0, 0.18, -0.13], color: 'hair' },
    { bone: 'armL', geo: box(0.1, 0.22, 0.1), at: [0, -0.09, 0], color: 'tunic' },
    { bone: 'foreL', geo: box(0.09, 0.2, 0.09), at: [0, -0.09, 0], color: 'skin' },
    { bone: 'armR', geo: box(0.1, 0.22, 0.1), at: [0, -0.09, 0], color: 'tunic' },
    { bone: 'foreR', geo: box(0.09, 0.2, 0.09), at: [0, -0.09, 0], color: 'skin' },
    { bone: 'legL', geo: box(0.11, 0.26, 0.11), at: [0, -0.12, 0], color: 'skin' },
    { bone: 'shinL', geo: box(0.12, 0.26, 0.15), at: [0, -0.15, 0.015], color: 'boots' },
    { bone: 'legR', geo: box(0.11, 0.26, 0.11), at: [0, -0.12, 0], color: 'skin' },
    { bone: 'shinR', geo: box(0.12, 0.26, 0.15), at: [0, -0.15, 0.015], color: 'boots' },
  ],
};

// a readable stride (refs/chars/01 top-right): arms and legs apart so near/far limbs separate on screen
function stride(ph) {
  const s = Math.sin(ph);
  return {
    legL: [32 * s, 0, 0], shinL: [-28 * Math.max(0, -s), 0, 0], legR: [-32 * s, 0, 0], shinR: [-28 * Math.max(0, s), 0, 0],
    armL: [-30 * s, 0, 10], armR: [30 * s, 0, -10], foreR: [-25, 0, 0], foreL: [-25, 0, 0], chest: [4, 8 * s, 0], head: [0, -6 * s, 0],
  };
}

// the same stride as pose triples for rig.js bipeds ([fwd, twist, out], docs/CHARACTERS.md §1)
function strideTriples(ph) {
  const s = Math.sin(ph);
  return {
    thighL: [-32 * s, 0, 0], shinL: [-40 * Math.max(0, s), 0, 0], thighR: [32 * s, 0, 0], shinR: [-40 * Math.max(0, -s), 0, 0],
    upperArmL: [30 * s, 0, 8], upperArmR: [-30 * s, 0, 8], forearmL: [25, 0, 0], forearmR: [25, 0, 0],
    chest: [4, 8 * s, 0], head: [0, -6 * s, 0],
  };
}

async function makeCharacter(engine, kind, matOpts) {
  if (kind === 'mannequin') {
    try {
      const [{ buildCharacter }, spec] = await Promise.all([import('../src/chars/rig.js'), import('../characters/mannequin.js')]);
      const sp = spec.default;
      const rig = buildCharacter(engine, { ...sp, material: { ...(sp.material || {}), ...matOpts } });
      rig.setPose = (p) => rig.applyPose(p === null ? {} : p);
      rig.triples = true;
      return rig;
    } catch (e) { console.warn('mannequin not available, using the spike', e); }
  }
  const ch = buildSpikeCharacter(engine, LOOK_SPEC);
  ch.mesh.material.dispose();
  ch.mesh.material = characterMaterial(engine, matOpts);
  return ch;
}

export default async function build(engine, params) {
  const P = (k, d) => params.get(k) ?? d;
  const view = P('view', 'main');
  const tod = P('tod', 'noon');
  const vh = Number(P('vh', view === 'pillars' ? 6 : 10));
  const yaw = THREE.MathUtils.degToRad(Number(P('yaw', 45)));
  const target = new THREE.Vector3(0, 0.6, 0);
  engine.camera.set({ target, yaw, pitch: Math.PI / 6, viewHeight: vh });
  const { dir: sunDir } = applyTimeOfDay(engine, tod, { shadowExtent: 14 });
  setClouds(engine, P('clouds', '1') === '0' ? { scale: 0 } : { scale: 0.06, cover: 0.6 });

  const R = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));      // screen-right on the ground
  const F = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));     // away from the camera on the ground
  const scr = (sx, sy) => new THREE.Vector3().addScaledVector(R, sx).addScaledVector(F, sy);

  const terrain = createTerrain(engine, { size: 48, height: 0.25, seed: 5, frequency: 0.06, flatten: [{ x: 0, z: 0, r: 7, h: 0, falloff: 4 }] });
  const H = (p) => terrain.heightAt(p.x, p.z);
  const props = [];
  const add = (g) => { engine.scene.add(g); props.push(g); return g; };

  const matBase = {
    farHalf: P('far', '1') !== '0', midline: P('midline', 'none'), cloud: P('cloud', 'root'),
  };
  const chars = [];
  const place = async (p, face, opts = {}) => {
    const ch = await makeCharacter(engine, P('char', 'spike'), { ...matBase, ...opts });
    ch.root.position.set(p.x, H(p), p.z);
    ch.root.rotation.y = yaw + THREE.MathUtils.degToRad(45 * face);      // face 0 = towards the camera
    engine.scene.add(ch.root);
    engine.camera.snapObjectToTexel(ch.root);
    chars.push(ch);
    return ch;
  };
  const face = Number(P('face', 1));
  const sunH = new THREE.Vector3(sunDir.x, 0, sunDir.z).normalize();
  // an INVISIBLE shadow caster (colorWrite/depthWrite off: nothing in the colour or normal pass; three's shadow
  // depth material still renders it) 3 m above `p`, offset towards the sun, so the whole figure stands in its cast
  // shadow at every preset without anything hiding it
  const cot = Math.sqrt(1 - sunDir.y * sunDir.y) / Math.max(sunDir.y, 0.05);
  const shadeWall = (p) => {
    const len = 1.6 * cot + 0.8;
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, len), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
    m.position.copy(p).addScaledVector(sunH, (3 - 0.75) * cot).setY(H(p) + 3);
    m.rotation.y = Math.atan2(sunH.x, sunH.z);
    m.castShadow = true; m.receiveShadow = false;
    engine.scene.add(m);
  };

  if (view === 'facings') {
    for (let k = 0; k < 8; k++) await place(scr(-6.3 + k * 1.8, 0), k);
  } else if (view === 'ab') {
    await place(scr(-2.8, 0.6), face, { farHalf: false });
    await place(scr(-1.2, 0.6), face, { farHalf: true });
    await place(scr(1.4, -1.0), face, { farHalf: false });
    await place(scr(3.0, -1.0), face, { farHalf: true });
    shadeWall(scr(1.4, -1.0)); shadeWall(scr(3.0, -1.0));
  } else if (view === 'pillars') {
    await place(scr(0, 0), face);
    add(createPillar(engine, { height: 1.1, seed: 3, width: 0.5, position: scr(0.42, -1.0), terrain, debris: false, plinth: false }));
    add(createPillar(engine, { height: 2.4, seed: 8, width: 0.6, position: scr(-0.5, 1.1), terrain, debris: false, plinth: false }));
  } else {
    await place(scr(-1.2, 0), face);
    add(createPillar(engine, { height: 1.2, seed: 3, width: 0.55, position: scr(-0.7, -1.1), terrain, debris: false }));
    add(createPillar(engine, { height: 2.6, seed: 8, width: 0.62, position: scr(-1.9, 1.2), terrain, debris: false }));
    await place(scr(2.6, 0.2), face);
    shadeWall(scr(2.6, 0.2));
  }

  const onStone = (x, z) => props.some((g) => g.userData.covers?.(x, z, 0.15));
  createGrass(engine, terrain, { area: viewArea(engine, 3), seed: 7, mask: (x, z) => !onStone(x, z), flowers: false });

  const anim = P('anim', '0') === '1';
  const poseKind = P('pose', 'walk');
  const poseAt = (ch, ph) => (poseKind === 'rest' ? {} : ch.triples ? strideTriples(ph) : stride(ph));
  for (const ch of chars) { ch.setPose(poseAt(ch, Math.PI / 2)); updateLook(engine, ch); }
  if (anim) {
    engine.onUpdate((t) => {
      const ph = Math.floor(t * 8) / 8 * Math.PI * 2 * 0.75;     // stepped at 8 fps
      for (const ch of chars) { ch.setPose(poseAt(ch, ph)); updateLook(engine, ch); }
    });
  }
}
