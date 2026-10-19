// v3 WP1 (v3-core). The opt-in test hooks of the 3D town (docs/v3/INTEGRATION.md §6.1), compatible with Classic's
// (TownScene.ts `__ctCamera`, social/phaserView.ts `__ctSocial`):
//
//   window.__ctCamera   only when localStorage['ct.debug.camera'] === '1'. Core members (worldToScreen, view, me,
//                       v3) plus every Layer3d.debug?() member (avatar, bubbles, doorBoards, npcs, dais, …), merged
//                       again after a rebuild; a layer can never replace a core member.
//   window.__ctSocial   only when localStorage['ct.debug.social'] === '1': the social controller's members
//                       (seen / hold / radial / pie) plus the v3 view's (emotes / pins / zoom), WP4 passes them.
//
// Every install returns its uninstall, which deletes the global only while it is still this hook (a renderer swap
// must not delete the other renderer's hook; GameScreen also deletes both after every destroy()).
import type { Layer3d } from '../contract';

type Members = Record<string, (...args: never[]) => unknown>;
type HookWindow = { __ctCamera?: unknown; __ctSocial?: unknown };

export const CAMERA_FLAG = 'ct.debug.camera';
export const SOCIAL_FLAG = 'ct.debug.social';
export const PERF_FLAG = 'ct.debug.v3perf';

/** localStorage flag === '1' (false when storage is blocked). */
export function debugFlag(key: string, s: Pick<Storage, 'getItem'> | null = safeStorage()): boolean {
  try {
    return s?.getItem(key) === '1';
  } catch {
    return false;
  }
}

function safeStorage(): Pick<Storage, 'getItem'> | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

const hookWindow = (): HookWindow | null => (typeof window !== 'undefined' ? (window as unknown as HookWindow) : null);

export interface CameraHook {
  /** The object installed as window.__ctCamera. */
  readonly members: Record<string, unknown>;
  /** Replace the layer members (after a (re)build). Returns the names a layer tried to override (ignored). */
  setLayers(layers: readonly Layer3d[]): string[];
  uninstall(): void;
}

/**
 * Install __ctCamera (or return null when the flag is off). `core` members always win; layer members are merged
 * from each layer's debug() in registration order (the first layer to name a member keeps it).
 */
export function installCameraHook(core: Members, layers: readonly Layer3d[] = [], on = debugFlag(CAMERA_FLAG), w: HookWindow | null = hookWindow()): CameraHook | null {
  if (!on || !w) return null;
  const members: Record<string, unknown> = { ...core };
  let layerKeys: string[] = [];
  const hook: CameraHook = {
    members,
    setLayers(ls) {
      for (const k of layerKeys) delete members[k];
      layerKeys = [];
      const clashes: string[] = [];
      for (const l of ls) {
        let extra: Record<string, () => unknown> = {};
        try {
          extra = l.debug?.() ?? {};
        } catch (e) {
          console.warn('[town3d] layer debug() failed', e);
        }
        for (const [k, fn] of Object.entries(extra)) {
          if (k in members) {
            clashes.push(k);
            continue;
          }
          members[k] = fn;
          layerKeys.push(k);
        }
      }
      if (clashes.length) console.warn('[town3d] __ctCamera members already taken:', clashes.join(', '));
      return clashes;
    },
    uninstall() {
      if (w.__ctCamera === members) delete w.__ctCamera;
    },
  };
  hook.setLayers(layers);
  w.__ctCamera = members;
  return hook;
}

/** Install __ctSocial from the controller's and the view's members; returns the uninstall (no-op when off). */
export function installSocialHook(members: Members, on = debugFlag(SOCIAL_FLAG), w: HookWindow | null = hookWindow()): () => void {
  if (!on || !w) return () => undefined;
  const obj = { ...members };
  w.__ctSocial = obj;
  return () => {
    if (w.__ctSocial === obj) delete w.__ctSocial;
  };
}
