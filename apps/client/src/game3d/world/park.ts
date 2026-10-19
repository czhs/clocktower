// v3 WP3 (v3-stage). Park the town graph while an interior is shown (docs/v3/INTEGRATION.md §3
// "Interiors"): a reimplementation of the demo's private createTownPark (v3/pixel3d/src/demo/main.js).
// The room is a separate little scene 200 m east, but the whole town (~1.5k nodes) would still go through
// three's matrix update, culling and the shadow pass. Every light-free branch of the town root is detached
// while inside and re-attached in its original child order on the way out; branches that hold a light stay
// (removing a light changes the light count = every lit material recompiles), only their light-free
// children are parked, and only below identity-transform nodes (a parked object's world matrix stays right).
// The life piece's update is skipped meanwhile (its systems are pure f(t)).
import * as THREE from 'three';

export interface ParkablePiece {
  update?: ((t: number, dt: number) => void) | null;
}

export interface TownPark {
  park(): void;
  unpark(): void;
  readonly parked: boolean;
  /** Branches detached by the last park (debug). */
  readonly count: number;
}

export function createTownPark(scene: THREE.Object3D, root: THREE.Object3D | null | undefined, life: ParkablePiece | null | undefined): TownPark {
  const I = new THREE.Matrix4();
  const parked: [THREE.Object3D, THREE.Object3D][] = [];
  const orders = new Map<THREE.Object3D, THREE.Object3D[]>();
  let on = false;
  let count = 0;
  let saved: ParkablePiece['update'] = null;
  const skip = () => undefined;
  const hasLight = (o: THREE.Object3D) => {
    let l = false;
    o.traverse((c) => {
      if ((c as THREE.Light).isLight) l = true;
    });
    return l;
  };
  const isIdentity = (o: THREE.Object3D) => {
    if (o.matrixAutoUpdate) o.updateMatrix();
    return o.matrix.equals(I);
  };
  // the root carries the camera's sub-texel snap offset (a few mm): parked branches only lose that in their
  // (unused) world matrices meanwhile
  const rootOk = () => {
    if (!root || root.parent !== scene) return false;
    const e = root.matrix.elements;
    const rot = Math.abs(e[0]! - 1) + Math.abs(e[5]! - 1) + Math.abs(e[10]! - 1) + Math.abs(e[1]!) + Math.abs(e[2]!) + Math.abs(e[4]!) + Math.abs(e[6]!) + Math.abs(e[8]!) + Math.abs(e[9]!);
    return rot < 1e-6 && Math.hypot(e[12]!, e[13]!, e[14]!) < 0.5;
  };
  const collect = (node: THREE.Object3D) => {
    for (const c of node.children) {
      if (!hasLight(c)) parked.push([node, c]);
      else if (isIdentity(c)) collect(c);
    }
  };
  return {
    get parked() {
      return on;
    },
    get count() {
      return count;
    },
    park() {
      if (on || !rootOk()) return;
      on = true;
      collect(root!);
      for (const [p] of parked) if (!orders.has(p)) orders.set(p, p.children.slice());
      for (const [p, c] of parked) p.remove(c);
      count = parked.length;
      if (life && life.update !== skip) {
        saved = life.update ?? null;
        life.update = skip;
      }
    },
    unpark() {
      if (!on) return;
      on = false;
      for (const [p, c] of parked) p.add(c);
      for (const [p, before] of orders) {
        const at = new Map(before.map((o, i) => [o, i]));
        p.children.sort((a, b) => (at.get(a) ?? 1e9) - (at.get(b) ?? 1e9));
      }
      parked.length = 0;
      orders.clear();
      if (life && life.update === skip) life.update = saved;
      saved = null;
    },
  };
}
