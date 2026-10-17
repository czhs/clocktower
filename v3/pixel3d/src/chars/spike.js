// SPIKE (lead): smallest end-to-end character to validate the contract before the swarm builds
// src/chars/*. Bones + low-poly parts (rigid-bound) merged into ONE SkinnedMesh with the toon material
// (per-vertex mid colour + toneHi/toneSh attributes). Replaced by the rig module; keep for reference.
import * as THREE from 'three';
import { toonMaterial } from '../materials/toon.js';

const lin = (hex) => new THREE.Color(hex); // THREE.Color(hex) converts sRGB hex -> linear working space

/** Box with 45-degree chamfered vertical edges (8-sided prism), flat shaded. */
export function chamferBox(w, h, d, c = 0.25) {
  const cx = Math.min(w, d) * c * 0.5;
  const s = new THREE.Shape();
  const x = w / 2, z = d / 2;
  s.moveTo(-x + cx, -z); s.lineTo(x - cx, -z); s.lineTo(x, -z + cx); s.lineTo(x, z - cx);
  s.lineTo(x - cx, z); s.lineTo(-x + cx, z); s.lineTo(-x, z - cx); s.lineTo(-x, -z + cx); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false });
  g.rotateX(Math.PI / 2).translate(0, h, 0); // extrude along -y after rotation -> span y in [0,h]
  g.computeBoundingBox();
  const bb = g.boundingBox; g.translate(0, -bb.min.y - h / 2, 0); // centre on origin
  return g;
}

export function buildSpikeCharacter(engine, spec) {
  const root = new THREE.Group();
  const bones = {}, list = [];
  for (const b of spec.bones) {
    const bone = new THREE.Bone(); bone.name = b.name; bone.position.fromArray(b.pos);
    (b.parent ? bones[b.parent] : root).add(bone);
    bones[b.name] = bone; list.push(bone);
  }
  root.updateMatrixWorld(true);
  const pos = [], nrm = [], col = [], hi = [], sh = [], si = [], sw = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (const p of spec.parts) {
    let g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    e.set(...(p.rot || [0, 0, 0]).map(THREE.MathUtils.degToRad));
    m.compose(new THREE.Vector3(...(p.at || [0, 0, 0])), q.setFromEuler(e), new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m);
    g.applyMatrix4(bones[p.bone].matrixWorld); // bind space = rest world
    g.computeVertexNormals();                  // non-indexed -> flat facets
    const [H, M, S] = spec.palette[p.color].map(lin);
    const bi = list.indexOf(bones[p.bone]);
    const P = g.attributes.position, N = g.attributes.normal;
    for (let i = 0; i < P.count; i++) {
      pos.push(P.getX(i), P.getY(i), P.getZ(i)); nrm.push(N.getX(i), N.getY(i), N.getZ(i));
      col.push(M.r, M.g, M.b); hi.push(H.r, H.g, H.b); sh.push(S.r, S.g, S.b);
      si.push(bi, 0, 0, 0); sw.push(1, 0, 0, 0);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('toneHi', new THREE.Float32BufferAttribute(hi, 3));
  geo.setAttribute('toneSh', new THREE.Float32BufferAttribute(sh, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  const mat = toonMaterial(engine, { vertexColors: true, toneAttributes: true, outline: spec.outline || 'full' });
  const mesh = new THREE.SkinnedMesh(geo, mat);
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  root.add(mesh);
  mesh.bind(new THREE.Skeleton(list));
  const setPose = (pose) => {
    for (const [name, r] of Object.entries(pose)) bones[name]?.rotation.set(...r.map(THREE.MathUtils.degToRad));
  };
  return { root, mesh, bones, setPose };
}
