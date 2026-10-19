// SPIKE (lead): one skinned low-poly biped on a grass patch; validates skinning + toon + outlines +
// shadows + texel snapping for characters. ?vh=<viewHeight> ?yaw=<deg> ?pose=rest|walk ?tod=noon|golden
import * as THREE from 'three';
import { applyTimeOfDay } from '../src/world/sky.js';
import { toonMesh, rampFromTones } from '../src/materials/toon.js';
import { buildSpikeCharacter, chamferBox } from '../src/chars/spike.js';

const B = (w, h, d, c) => chamferBox(w, h, d, c);

export default async function build(engine, params) {
  const vh = Number(params.get('vh') ?? 6);
  const yaw = THREE.MathUtils.degToRad(Number(params.get('yaw') ?? 45));
  engine.camera.set({ target: new THREE.Vector3(0, 0.6, 0), yaw, pitch: Math.PI / 6, viewHeight: vh });
  applyTimeOfDay(engine, params.get('tod') || 'noon', { shadowExtent: 6 });

  const { color, ramp } = rampFromTones('#BBD985', '#75A558', '#3B6B5A');
  engine.scene.add(toonMesh(engine, new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), { color, ramp, normalNoise: 0.12 }));
  const rock = toonMesh(engine, new THREE.IcosahedronGeometry(0.5, 0).toNonIndexed(), rampFromTones('#8a8299', '#646076', '#484566'));
  rock.geometry.computeVertexNormals(); rock.position.set(1.4, 0.2, -0.6); engine.scene.add(rock);

  const spec = {
    palette: {
      cloak: ['#E5C98F', '#B98A5A', '#6E5A6E'], skin: ['#F2D2B0', '#D9A982', '#8C6A78'],
      dark: ['#6C6A86', '#4A4862', '#34334A'], steel: ['#E8ECEF', '#A9B4BE', '#5F6A82'],
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
      { bone: 'hips', geo: B(0.32, 0.18, 0.22), at: [0, 0.04, 0], color: 'cloak' },
      { bone: 'chest', geo: B(0.36, 0.3, 0.24), at: [0, 0.1, 0], color: 'cloak' },
      { bone: 'head', geo: B(0.34, 0.3, 0.3, 0.4), at: [0, 0.14, 0], color: 'skin' },
      { bone: 'head', geo: B(0.38, 0.12, 0.34, 0.4), at: [0, 0.28, -0.01], color: 'dark' },
      { bone: 'armL', geo: B(0.1, 0.22, 0.1), at: [0, -0.09, 0], color: 'cloak' },
      { bone: 'foreL', geo: B(0.09, 0.2, 0.09), at: [0, -0.09, 0], color: 'skin' },
      { bone: 'armR', geo: B(0.1, 0.22, 0.1), at: [0, -0.09, 0], color: 'cloak' },
      { bone: 'foreR', geo: B(0.09, 0.2, 0.09), at: [0, -0.09, 0], color: 'skin' },
      { bone: 'foreR', geo: B(0.05, 0.6, 0.02, 0), at: [0, -0.45, 0.06], color: 'steel' },
      { bone: 'legL', geo: B(0.12, 0.26, 0.12), at: [0, -0.12, 0], color: 'dark' },
      { bone: 'shinL', geo: B(0.11, 0.26, 0.14), at: [0, -0.15, 0.015], color: 'dark' },
      { bone: 'legR', geo: B(0.12, 0.26, 0.12), at: [0, -0.12, 0], color: 'dark' },
      { bone: 'shinR', geo: B(0.11, 0.26, 0.14), at: [0, -0.15, 0.015], color: 'dark' },
    ],
  };
  const ch = buildSpikeCharacter(engine, spec);
  engine.scene.add(ch.root);
  engine.camera.snapObjectToTexel(ch.root);
  const pose = params.get('pose') || 'walk';
  engine.onUpdate((t) => {
    if (pose === 'rest') return;
    const ph = Math.floor(t * 8) / 8 * Math.PI * 2 * 0.75; // stepped at 8 fps
    const s = Math.sin(ph);
    ch.setPose({
      legL: [30 * s, 0, 0], shinL: [-25 * Math.max(0, -s), 0, 0], legR: [-30 * s, 0, 0], shinR: [-25 * Math.max(0, s), 0, 0],
      armL: [-25 * s, 0, 8], armR: [25 * s, 0, -8], foreR: [-30, 0, 0], foreL: [-20, 0, 0], chest: [4, 8 * s, 0], head: [0, -6 * s, 0],
    });
    ch.root.position.y = Math.abs(Math.cos(ph)) * 0.03;
  });
}
