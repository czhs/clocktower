// (v3 WP6, v3-ui) The Settings "Town graphics" status line: what draws the town in this lobby and why
// (game3d/select.ts chooseRenderer rows, docs/v3/INTEGRATION.md §1.2), plus the one action that can change it.
// Pure (tested in apps/client/test/ui.graphicsStatus.test.ts).
import type { WorldId } from '@ct/protocol';
import type { RendererChoice } from '../../game3d/select';

/** What draws the town here and why (game3d/select.ts chooseRenderer), with the one action that can change it. */
export function graphicsStatus(world: WorldId | null, c: RendererChoice | null): { text: string; action?: 'auto-fallback' | 'boot-guard' } {
  if (!world || !c) return { text: 'Used in Hollowmere (v3) lobbies; Classic lobbies always draw the classic town.' };
  switch (c.reason) {
    case 'world-v2':
      return { text: 'This lobby uses the classic town.' };
    case 'forced':
      return { text: 'Debug: the 3D town is forced on in this browser.' };
    case 'forced-no-webgl2':
      return { text: 'Debug: 3D is forced on, but this browser has no WebGL 2, so Classic 2D draws the town.' };
    case 'pref-classic':
      return { text: 'Classic 2D draws this town.' };
    case 'boot-guard':
      return { text: 'v3 graphics stopped last time, so Classic 2D draws the town for now.', action: 'boot-guard' };
    case 'no-webgl2':
      return { text: 'Classic 2D: this browser cannot run the 3D town (no WebGL 2).' };
    case 'software-gl':
      return { text: 'Classic 2D: this device has no graphics acceleration for the 3D town.' };
    case 'auto-fallback':
      return { text: 'Auto (Classic: too slow on this device)', action: 'auto-fallback' };
    case 'phone':
      return { text: 'Auto uses Classic 2D on phones. Choose “v3 3D” to try the 3D town anyway.' };
    case 'ok':
      return { text: `The 3D town is on (${c.tier === 'low' ? 'light' : 'full'} detail).` };
  }
}
