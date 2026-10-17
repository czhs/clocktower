// v3 WP0 (v3-lead). Types for the read-only pixel3d vendor tree (v3/pixel3d/src, aliased as '@pixel3d/' in
// vite.config.ts and vitest.config.ts). The vendor is plain JS and is never typechecked (no allowJs): every
// module is `any`-typed, plus the few signatures our wrappers call. Only game3d/vendor/*.ts may import
// '@pixel3d/*' (apps/client/test/game3d/boundary.test.ts).

declare module '@pixel3d/core/Engine.js' {
  export class Engine {
    constructor(opts?: { params?: URLSearchParams });
    params: URLSearchParams;
    pixelScale: number;
    width: number;
    height: number;
    lowW: number;
    lowH: number;
    time: number;
    lastFrameMs?: number;
    stats: Record<string, unknown>;
    updaters: ((t: number, dt: number, engine: Engine) => void)[];
    renderer: import('three').WebGLRenderer;
    scene: import('three').Scene;
    camera: Pixel3dCamera;
    pipeline: { render(): void; resize(w: number, h: number): void; upscale: { snapScreen: boolean | 'auto' }; dispose?(): void; [k: string]: unknown };
    uniforms: Record<string, { value: unknown }>;
    toonUniforms: Record<string, { value: unknown }>;
    onUpdate(fn: (t: number, dt: number, engine: Engine) => void): void;
    resize(): void;
    renderAt(t: number): void;
    _updateSun(): void;
    [k: string]: unknown;
  }
  export interface Pixel3dCamera {
    cam: import('three').OrthographicCamera;
    target: import('three').Vector3;
    yaw: number;
    pitch: number;
    viewHeight: number;
    offset: import('three').Vector2;
    lowW: number;
    lowH: number;
    readonly texelWorld: number;
    set(o: { target?: import('three').Vector3; yaw?: number; pitch?: number; viewHeight?: number; snap?: boolean }): void;
    resize(lowW: number, lowH: number): void;
    update(): void;
    snapWorld(p: import('three').Vector3, out?: import('three').Vector3): import('three').Vector3;
  }
}

declare module '@pixel3d/core/PixelCamera.js' {
  export const MARGIN: number;
  export const ZOOM_LADDER: number[];
}

declare module '@pixel3d/town/town.js' {
  export const BUILD_ORDER: string[];
  export function buildTown(
    engine: unknown,
    params: URLSearchParams,
    opts?: { pieces?: string[] | null; strict?: string | null; pad?: boolean; clouds?: boolean; cut?: boolean },
  ): Promise<{ registry: { get(id: string): { group: import('three').Object3D; api: Record<string, unknown> } | null; map: Map<string, unknown> }; tod: string; root: import('three').Group; quality: 'high' | 'low'; [k: string]: unknown }>;
}

declare module '@pixel3d/town/api.js' {
  export function applyCamera(
    engine: unknown,
    preset?: 'gameplay' | 'overview' | 'iso' | 'vote',
    o?: { focus?: import('three').Vector3 | null; yawDeg?: number | null; viewHeight?: number | null },
  ): { preset: string; target: import('three').Vector3; yaw: number; viewHeight: number };
}

declare module '@pixel3d/town/layout.js' {
  export const TOWN_W: number;
  export const TOWN_H: number;
  export const PLAZA: { cx: number; cz: number; r: number };
}

declare module '@pixel3d/demo/characters.js' {
  export interface Pixel3dCharacterHandle {
    id: string;
    name: string;
    root: import('three').Object3D;
    ch: { drive(fn: ((t: number) => { pos: import('three').Vector3; face?: number }) | null): void; [k: string]: unknown };
    height: number;
    walkSpeed: number;
    runSpeed: number;
    gameSpeed: number | null;
    clips: string[];
    emotes: Record<string, string | null>;
    emoteClips: string[];
    readonly clock: number;
    update(t: number): void;
    play(name: string, opts?: unknown): void;
    dispose(): void;
  }
  export function createCharacter(
    engine: unknown,
    id: string,
    o?: { position?: import('three').Vector3; face?: number; ground?: { heightAt(x: number, z: number): number }; fx?: boolean; smears?: boolean },
  ): Promise<Pixel3dCharacterHandle>;
}

declare module '@pixel3d/*' {
  const mod: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export = mod;
}
