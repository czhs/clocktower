// Scene "ambient-fireflies" (owner: fireflies): the ambient stage (scenes/ambient-stage.js, its scripted game-speed
// walker and anchors) with the "fireflies" system dropped in (src/ambient/fireflies.js): fireflies / glow-worms /
// lamp moths at golden + night, butterflies / bees on their blooms by day. Every ambient-stage param works
// (tod, walker, speed, still, shot, vh, follow, grass, grade, seed); `systems` defaults to 'fireflies'.
// Own params:
//   stage=critters   build on scenes/ambient-critters.js instead (same stage + a pond: exercises the water-bank swarm
//                    at spots.pond); its shots (pond, ...) work too
//   pan=dx,dy        shift the camera by WHOLE texels (screen right, screen up) after the build: crawl A/B test
//   tools/ambientpack.sh fireflies --scene ambient-fireflies --tod night
//   tools/shot.sh ambient-fireflies shots/ambient-fireflies/x.png --size 640x360 --q 'scale=1&tod=night&shot=lamp'
import stage from './ambient-stage.js';

export default async function build(engine, params) {
  const p = new URLSearchParams(params.toString());
  if (!p.has('systems')) p.set('systems', 'fireflies');
  if (!p.has('strict')) p.set('strict', 'fireflies');
  if (p.get('stage') === 'critters') {
    const { default: critters } = await import('./ambient-critters.js');
    await critters(engine, p);
  } else await stage(engine, p);
  const pan = p.get('pan');
  if (pan) {
    const [dx, dy] = pan.split(',').map(Number);
    const cam = engine.camera;
    cam.update();
    const tw = cam.texelWorld;
    cam.target.addScaledVector(cam.right, dx * tw).addScaledVector(cam.up, dy * tw);
  }
}
