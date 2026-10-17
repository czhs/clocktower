// Fire fixtures (owner: fire): the lit props the flames sit on — campfire (stone ring, ash, crossed logs), wall torch
// (iron bracket + pitch head), brazier (iron bowl on 4 legs), forge hearth (stone block, fire pit, hood + chimney),
// candles (3 church candles on a stone). Painted kit geometry (3 tones per material), ALL fixtures merged into ONE
// toon mesh (colour + normal + shadow = 3 GL calls). Hosts that already have their own props (the town) pass
// fixtures: false and only get the flames / smoke / embers (1 + 1 calls).
//
// Each builder works in LOCAL space: origin on the ground (torch: on the wall face at mount height), +Z towards the
// open side (the camera side for a wall torch), and returns { parts, emitters: [[x, y, z]...], smoke?: [x, y, z] }.
import * as THREE from 'three';
import * as K from '../../chars/kit.js';
import { paint, mergePose } from '../core.js';

export const FPAL = {
  stone: ['#BBAC97', '#8C7E72', '#5B5A64'],
  stoneDark: ['#7A6E72', '#564E5C', '#3A3646'],
  wood: ['#A27660', '#73524E', '#4C3A4C'],
  char: ['#5E4C52', '#403644', '#2C2636'],
  ash: ['#9A928C', '#76707A', '#524E5C'],
  iron: ['#7E7A8A', '#575462', '#37353F'],
  wax: ['#F2E8CE', '#D9CBAA', '#A8988A'],
  cloth: ['#8E7A62', '#6A5A4E', '#463C42'],
};
const at = (g, x, y, z, rot = [0, 0, 0]) => K.xf(g, { at: [x, y, z], rot });

function campfire() {
  const parts = [];
  parts.push(paint(at(K.prism(8, 0.32, 0.03), 0, 0.012, 0), FPAL.ash));
  for (let i = 0; i < 8; i++) {                          // stone ring, every stone on a 45° stop
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8, r = 0.4;
    const w = i % 3 === 0 ? 0.18 : 0.15, h = i % 2 ? 0.1 : 0.13;
    parts.push(paint(at(K.chamferBox(w, h, 0.13, 0.3, { top: 0.02 }), Math.sin(a) * r, h / 2 - 0.02, Math.cos(a) * r, [0, (a * 180) / Math.PI, 0]), FPAL.stone));
  }
  // two crossed logs on the ash + two leaning into a low teepee (logs 0.1 m = 3-4 texels thick, charred ends)
  parts.push(paint(at(K.box(0.1, 0.1, 0.56), 0, 0.06, 0, [0, 45, 0]), FPAL.wood));
  parts.push(paint(at(K.box(0.1, 0.1, 0.56), 0, 0.15, 0, [0, -45, 0]), FPAL.wood));
  parts.push(paint(at(K.box(0.09, 0.09, 0.36), -0.1, 0.17, 0.02, [0, 0, -38]), FPAL.char));
  parts.push(paint(at(K.box(0.09, 0.09, 0.36), 0.1, 0.17, -0.02, [0, 0, 38]), FPAL.char));
  return { parts, emitters: [[0, 0.16, 0.03]], light: [0, 0.5, 0], glow: [0, 0.01, 0] };
}

function brazier() {
  const parts = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]])
    parts.push(paint(at(K.box(0.06, 0.66, 0.06), sx * 0.15, 0.33, sz * 0.15), FPAL.iron));
  parts.push(paint(at(K.box(0.36, 0.05, 0.36), 0, 0.3, 0), FPAL.iron));              // shelf ring
  parts.push(paint(at(K.frustum(8, 0.15, 0.28, 0.22), 0, 0.73, 0), FPAL.iron));      // bowl
  parts.push(paint(at(K.prism(8, 0.3, 0.05), 0, 0.86, 0), FPAL.iron));               // rim
  parts.push(paint(at(K.prism(8, 0.25, 0.02), 0, 0.885, 0), FPAL.char));             // coal top
  return { parts, emitters: [[0, 0.9, 0.02]], light: [0, 1.2, 0], glow: [0, 0.01, 0] };
}

function torch() {
  const parts = [];
  parts.push(paint(at(K.box(0.12, 0.22, 0.04), 0, 0, 0.02), FPAL.iron));            // wall plate
  parts.push(paint(at(K.box(0.06, 0.06, 0.18), 0, -0.05, 0.11), FPAL.iron));        // arm
  parts.push(paint(at(K.box(0.07, 0.07, 0.07), 0, 0.0, 0.2), FPAL.iron));           // ring
  parts.push(paint(at(K.box(0.06, 0.38, 0.06), 0, 0.05, 0.2, [12, 0, 0]), FPAL.wood));  // handle (top leans out)
  parts.push(paint(at(K.box(0.1, 0.11, 0.1), 0, 0.26, 0.245, [12, 0, 0]), FPAL.cloth)); // pitch-soaked head
  return { parts, emitters: [[0, 0.32, 0.26]], light: [0, 0.5, 0.35], glow: [0, 0.36, 0.02] };
}

function forge() {
  const parts = [];
  parts.push(paint(at(K.chamferBox(1.04, 0.6, 0.74, 0.12, { top: 0.03 }), 0, 0.3, 0), FPAL.stone));
  // raised pit rim around the fire bed (4 kerb stones) and the sunken dark bed
  parts.push(paint(at(K.box(0.8, 0.03, 0.46), 0, 0.605, 0.02), FPAL.stoneDark));
  parts.push(paint(at(K.box(0.9, 0.08, 0.1), 0, 0.64, 0.3), FPAL.stone));
  parts.push(paint(at(K.box(0.1, 0.08, 0.46), -0.45, 0.64, 0.04), FPAL.stone));
  parts.push(paint(at(K.box(0.1, 0.08, 0.46), 0.45, 0.64, 0.04), FPAL.stone));
  // hood wall + chimney behind the pit
  parts.push(paint(at(K.box(1.04, 0.62, 0.24), 0, 0.9, -0.25), FPAL.stone));
  parts.push(paint(at(K.chamferBox(0.44, 0.7, 0.3, 0.2, { top: 0.03 }), 0, 1.55, -0.25), FPAL.stone));
  parts.push(paint(at(K.box(0.3, 0.04, 0.18), 0, 1.91, -0.25), FPAL.char));          // chimney mouth soot
  return { parts, emitters: [[0, 0.64, 0.06]], smoke: [0, 1.93, -0.25], light: [0, 0.95, 0.2], glow: [0, 0.01, 0.42] };
}

function candles() {
  const parts = [];
  parts.push(paint(at(K.chamferBox(0.46, 0.32, 0.38, 0.3, { top: 0.03 }), 0, 0.16, 0), FPAL.stone));
  const C = [[-0.11, 0.2, 0.04], [0.04, 0.15, -0.06], [0.13, 0.1, 0.08]];
  const emitters = [];
  for (const [x, h, z] of C) {
    parts.push(paint(at(K.prism(4, 0.05, h), x, 0.32 + h / 2, z, [0, 45, 0]), FPAL.wax));
    emitters.push([x, 0.32 + h + 0.005, z]);
  }
  return { parts, emitters, light: [0, 0.6, 0], glow: [0, 0.325, 0] };
}

const BUILDERS = { campfire, brazier, torch, forge, candle: candles };

/** Build one fixture at world position `pos` (Vector3), yaw (rad). Returns { parts (world), emitters: [Vector3], smoke, light, glow (night glow anchor) }. */
export function buildFixture(kind, pos, yaw = 0) {
  const b = BUILDERS[kind]();
  const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(pos);
  const W = (v) => new THREE.Vector3(...v).applyMatrix4(m);
  return {
    parts: b.parts.map((g) => g.applyMatrix4(m)),
    emitters: b.emitters.map(W), smoke: b.smoke ? W(b.smoke) : null, light: W(b.light), glow: W(b.glow),
  };
}

export const mergeFixtures = (parts) => mergePose(parts);
