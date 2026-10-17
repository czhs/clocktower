// v3 WP0 (v3-lead). Which town renderer to mount (docs/v3/INTEGRATION.md §1.2). Pure decision table +
// thin browser probes. STATIC import (main bundle): never imports three.js or game3d's lazy modules.
//
// chooseRenderer evaluates the rows IN ORDER, the first match wins:
//   1 lobby world 'v2'                      -> Classic (the 3D town cannot draw v2 geometry)
//   2 ct.debug.v3force = '1'                -> v3, skipping rows 3-8 (probe without the caveat flag; only a
//                                              missing webgl2 fails it). e2e on the host (SwiftShader).
//   3 pref ct.graphics = 'classic'          -> Classic
//   4 boot guard (unclean previous boot)    -> Classic + toast (also for an explicit 'v3')
//   5 webgl2 probe (failIfMajorPerformanceCaveat) null -> Classic
//   6 software GL (SwiftShader / llvmpipe)  -> Classic
//   7 'auto' + auto-fallback memo < 7 days  -> Classic ("too slow on this device")
//   8 'auto' + phone (coarse, short side ≤ 500) -> Classic; an explicit 'v3' runs at 'low'
//   9 starting tier: 'low' for fx low, tablets, integrated / mobile GPUs; else 'high'
import type { WorldId } from '@ct/protocol';
import { FX_QUALITY_KEY } from '../game/fx/quality';
import { bootGuardState, type BootGuardState } from './bootGuard';
import type { RendererKind, Tier } from './contract';

export const GRAPHICS_KEY = 'ct.graphics';
export const GRAPHICS_PREFS = ['auto', 'v3', 'classic'] as const;
export type GraphicsPref = (typeof GRAPHICS_PREFS)[number];
export const V3_FORCE_KEY = 'ct.debug.v3force';
export const AUTO_FALLBACK_KEY = 'ct.graphics.autoFallback';
export const AUTO_FALLBACK_DAYS = 7;
export const PHONE_SHORT_SIDE = 500;
export const SOFTWARE_GL = /SwiftShader|llvmpipe|Software/i;
export const INTEGRATED_GL = /Intel|UHD|Iris|Mali|Adreno|PowerVR|Apple GPU/i;

type Storage0 = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function parseGraphicsPref(raw: string | null | undefined): GraphicsPref {
  const v = raw?.trim().toLowerCase();
  return (GRAPHICS_PREFS as readonly string[]).includes(v ?? '') ? (v as GraphicsPref) : 'auto';
}

export interface ProbeResult {
  /** UNMASKED_RENDERER (or RENDERER) string. */
  renderer: string;
}

/** Everything chooseRenderer reads; `browserEnv()` fills it from the page. */
export interface SelectEnv {
  world: WorldId | undefined;
  pref: GraphicsPref;
  force: boolean;
  /** webgl2 probe; `caveat` = with failIfMajorPerformanceCaveat. null = no context. */
  probe(caveat: boolean): ProbeResult | null;
  bootGuard: BootGuardState;
  /** ISO date of the last perf auto-fallback, or null. */
  autoFallbackAt: string | null;
  now: number;
  coarsePointer: boolean;
  /** min(screen width, height) in CSS px. */
  shortSide: number;
  /** ct.fxQuality resolves to 'low'. */
  fxLow: boolean;
}

export type ChoiceReason =
  | 'world-v2'
  | 'forced'
  | 'forced-no-webgl2'
  | 'pref-classic'
  | 'boot-guard'
  | 'no-webgl2'
  | 'software-gl'
  | 'auto-fallback'
  | 'phone'
  | 'ok';

export interface RendererChoice {
  renderer: RendererKind;
  tier: Tier;
  /** The decisive row (1-9). */
  row: number;
  reason: ChoiceReason;
  /** GPU string from the probe (when one ran). */
  gpu: string | null;
}

/** Row 9: the starting tier. */
export function startingTier(e: Pick<SelectEnv, 'fxLow' | 'coarsePointer'>, gpu: string | null): Tier {
  if (e.fxLow || e.coarsePointer || (gpu !== null && INTEGRATED_GL.test(gpu))) return 'low';
  return 'high';
}

function memoFresh(at: string | null, now: number): boolean {
  if (!at) return false;
  const t = Date.parse(at);
  return Number.isFinite(t) && now - t >= 0 && now - t < AUTO_FALLBACK_DAYS * 86_400_000;
}

export function chooseRenderer(e: SelectEnv): RendererChoice {
  const classic = (row: number, reason: ChoiceReason, gpu: string | null = null): RendererChoice => ({ renderer: 'classic', tier: 'low', row, reason, gpu });
  // 1
  if ((e.world ?? 'v2') === 'v2') return classic(1, 'world-v2');
  // 2
  if (e.force) {
    const p = e.probe(false);
    if (!p) return classic(2, 'forced-no-webgl2');
    return { renderer: 'v3', tier: startingTier(e, p.renderer), row: 2, reason: 'forced', gpu: p.renderer };
  }
  // 3
  if (e.pref === 'classic') return classic(3, 'pref-classic');
  // 4
  if (e.bootGuard.blocked) return classic(4, 'boot-guard');
  // 5
  const p = e.probe(true);
  if (!p) return classic(5, 'no-webgl2');
  // 6
  if (SOFTWARE_GL.test(p.renderer)) return classic(6, 'software-gl', p.renderer);
  // 7
  if (e.pref === 'auto' && memoFresh(e.autoFallbackAt, e.now)) return classic(7, 'auto-fallback', p.renderer);
  // 8
  const phone = e.coarsePointer && e.shortSide <= PHONE_SHORT_SIDE;
  if (phone && e.pref === 'auto') return classic(8, 'phone', p.renderer);
  // 9
  const tier = phone ? 'low' : startingTier(e, p.renderer);
  return { renderer: 'v3', tier, row: 9, reason: 'ok', gpu: p.renderer };
}

// ------------------------------------------------------------------------------------ browser side

function store(): Storage0 | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
function read(s: Storage0 | null, k: string): string | null {
  try {
    return s?.getItem(k) ?? null;
  } catch {
    return null;
  }
}

let probeCache: { caveat: boolean; result: ProbeResult | null } | null = null;

/** Create a throw-away webgl2 context, read its renderer string, release it. */
export function probeWebgl2(caveat: boolean): ProbeResult | null {
  if (probeCache && probeCache.caveat === caveat) return probeCache.result;
  let result: ProbeResult | null = null;
  try {
    if (typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      c.width = c.height = 1;
      const gl = c.getContext('webgl2', caveat ? { failIfMajorPerformanceCaveat: true } : {}) as WebGL2RenderingContext | null;
      if (gl) {
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        const r = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
        result = { renderer: typeof r === 'string' ? r : String(r ?? '') };
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      }
    }
  } catch {
    result = null;
  }
  probeCache = { caveat, result };
  return result;
}

export function readGraphicsPref(s: Storage0 | null = store()): GraphicsPref {
  return parseGraphicsPref(read(s, GRAPHICS_KEY));
}

/** The page's inputs for chooseRenderer. */
export function browserEnv(world: WorldId | undefined, s: Storage0 | null = store()): SelectEnv {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const sw = typeof screen !== 'undefined' ? screen.width : typeof innerWidth === 'number' ? innerWidth : 1024;
  const sh = typeof screen !== 'undefined' ? screen.height : typeof innerHeight === 'number' ? innerHeight : 768;
  return {
    world,
    pref: readGraphicsPref(s),
    force: read(s, V3_FORCE_KEY) === '1',
    probe: probeWebgl2,
    bootGuard: bootGuardState(Date.now(), s),
    autoFallbackAt: read(s, AUTO_FALLBACK_KEY),
    now: Date.now(),
    coarsePointer: coarse,
    shortSide: Math.min(sw, sh),
    // the same key and values as game/fx/quality.ts readQualityPref (exact 'high'|'medium'|'low'|'auto'; anything else = auto)
    fxLow: read(s, FX_QUALITY_KEY) === 'low',
  };
}

/** The choice for this page in a lobby of `world`. */
export function chooseRendererHere(world: WorldId | undefined): RendererChoice {
  return chooseRenderer(browserEnv(world));
}

/**
 * Prefetch hint for LobbyRoute (before the lobby's world is known): may this page use v3 at all?
 * Prefs + probe only (rows 2-6); no world, phone or memo rows.
 */
export function mayUseV3(s: Storage0 | null = store()): boolean {
  if (read(s, V3_FORCE_KEY) === '1') return true;
  if (readGraphicsPref(s) === 'classic') return false;
  if (bootGuardState(Date.now(), s).blocked) return false;
  const p = probeWebgl2(true);
  return !!p && !SOFTWARE_GL.test(p.renderer);
}

/** Remember a perf auto-fallback (row 7). */
export function rememberAutoFallback(now = Date.now(), s: Storage0 | null = store()): void {
  try {
    s?.setItem(AUTO_FALLBACK_KEY, new Date(now).toISOString());
  } catch {
    /* best effort */
  }
}
/** "Try v3 again": drop the memo. */
export function clearAutoFallback(s: Storage0 | null = store()): void {
  try {
    s?.removeItem(AUTO_FALLBACK_KEY);
  } catch {
    /* best effort */
  }
}

// ------------------------------------------------------------------------------------ in-place swaps

const graphicsListeners = new Set<() => void>();
/** GameScreen re-evaluates chooseRenderer (and swaps in place) when the Graphics setting changed. */
export function onGraphicsChange(fn: () => void): () => void {
  graphicsListeners.add(fn);
  return () => graphicsListeners.delete(fn);
}
/** Call after writing ct.graphics (Settings, "Try v3 again"): mounted towns swap renderer in place. */
export function notifyGraphicsChange(): void {
  for (const fn of [...graphicsListeners]) fn();
}
