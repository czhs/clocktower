// Entry: index.html?scene=<name>[&scale=2|fit][&debug=normal|depth|color|raw][&capture=1]
import { Engine } from './core/Engine.js';

const params = new URLSearchParams(location.search);
const sceneName = params.get('scene') || '_test-all'; // default: the integration scene
window.__pixel = { ready: false, errors: [], renderAt: () => {}, info: () => null, gpu: null };
window.addEventListener('error', (e) => window.__pixel.errors.push(String(e.message || e)));
window.addEventListener('unhandledrejection', (e) => window.__pixel.errors.push('unhandled: ' + (e.reason?.stack || e.reason)));

try {
  const engine = new Engine({ params });
  const mod = await import(`../scenes/${sceneName}.js`);
  await mod.default(engine, params);
  engine.start();
} catch (e) {
  console.error(e);
  window.__pixel.errors.push(String(e.stack || e));
}
