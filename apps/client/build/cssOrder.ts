// (v2.4 perf P2) Stylesheet cascade order across code-split chunks — build side (vite.config.ts).
//
// Until v2.3 main.tsx imported every stylesheet so the entry CSS kept the cascade order of the single
// v2.1 bundle (theme.css last: its generic rules — button, input, .panel, the framed-button art —
// must win ties against feature sheets). A lazy chunk's CSS is appended to <head> by Vite's preload
// helper, i.e. AFTER the entry CSS, which would silently flip those ties. Now:
//
//   index.html   <link index-base-*.css>  BASE sheets (landing / auth / home), manual chunk 'index-base'
//                <link index-*.css>       theme.css only (+ fonts), marked data-ct-css="theme"
//   lazy chunks  their own sheets, inserted by the preload helper BEFORE the theme link
//                (ui/common/cssOrder.ts), except LATE chunks (dialogs that were always loaded after
//                the theme and rely on it: SettingsDialog, IntroTour), which are appended after it.
//
// So for every pair (feature sheet, theme) the order is the same as in one bundle. Feature sheets
// relative to each other follow load order; they are namespaced (.cth-, .ct-chat-, .ctn-, …) and do
// not style each other's elements. `checkCssChunks` fails the build when a sheet lands somewhere
// this scheme does not cover (a new stylesheet, the theme in a lazy chunk, a late sheet mixed into a
// normal chunk, …), so the order cannot regress silently.

/** Every stylesheet of the client, in the cascade order of the single v2.1 bundle (paths under src/). */
export const CSS_ORDER = [
  'ui/common/help.css',
  'ui/auth/auth.css',
  'ui/auth/landing.css',
  'ui/lobby/lobby.css',
  'ui/social/social.css',
  'ui/common/RoleIcon.css',
  'ui/notebook/notebook.css',
  'ui/story/story.css',
  'ui/clock/clock.css',
  'game/game.css',
  'ui/admin/admin.css',
  'ui/hud/hud.css',
  'ui/storyteller/storyteller.css',
  'ui/voice/voice.css',
  'ui/chat/chat.css',
  'ui/social/pie.css',
  'ui/rulebook/rulebook.css', // rulebook Grimoire (lazy chunk)
  'ui/common/theme.css',
  // late: loaded after the theme since they were added (lazy dialogs); they rely on it
  'ui/common/Settings.css',
  'ui/intro/intro.css',
] as const;

/** The entry's own CSS: only the theme (fonts.css is @imported by it). */
export const THEME = 'ui/common/theme.css';
/** Sheets the entry screens need (landing, sign-up / sign-in, account home): manual chunk 'index-base'. */
export const BASE: readonly string[] = ['ui/common/help.css', 'ui/auth/auth.css', 'ui/auth/landing.css', 'ui/lobby/lobby.css', 'ui/common/RoleIcon.css'];
/** Sheets that come after the theme, and the only chunks that may carry them. */
export const LATE: readonly string[] = ['ui/common/Settings.css', 'ui/intro/intro.css'];
export const LATE_CHUNKS: readonly string[] = ['SettingsDialog', 'IntroTour'];
export const BASE_CHUNK = 'index-base';
/** Dev-only and test-only sheets the scheme ignores. */
const IGNORED = /(^|\/)game\/dev\//;

/** 'ui/hud/hud.css' for a module id under apps/client/src (query stripped), else null. */
export function srcCss(id: string): string | null {
  const clean = id.split('?')[0]!.replace(/\\/g, '/');
  const m = /\/apps\/client\/src\/(.+\.css)$/.exec(clean);
  return m ? m[1]! : null;
}

/** manualChunks: the BASE sheets form their own (pure CSS) chunk, emitted before the entry CSS. */
export function baseChunkFor(id: string): string | undefined {
  const s = srcCss(id);
  return s && BASE.includes(s) ? BASE_CHUNK : undefined;
}

export interface ChunkCss {
  name: string;
  isEntry: boolean;
  sheets: string[];
}

/** Problems with where the stylesheets landed (empty = the cascade order is preserved). */
export function checkCssChunks(chunks: ChunkCss[]): string[] {
  const errors: string[] = [];
  const known = new Set<string>(CSS_ORDER);
  const seenBase = new Set<string>();
  for (const c of chunks) {
    for (const s of c.sheets) {
      if (IGNORED.test(s)) continue;
      if (!known.has(s)) errors.push(`${s} (chunk ${c.name}) is not in CSS_ORDER (apps/client/build/cssOrder.ts): add it at its cascade position`);
      if (s === THEME && !c.isEntry) errors.push(`${THEME} must only be in the entry chunk, found in ${c.name}`);
      if (c.isEntry && s !== THEME) errors.push(`${s} is in the entry chunk's CSS, after the theme: add it to BASE or import it from a lazy component`);
      if (BASE.includes(s)) {
        if (c.name !== BASE_CHUNK) errors.push(`base sheet ${s} landed in chunk ${c.name}, not ${BASE_CHUNK}`);
        seenBase.add(s);
      }
      if (c.name === BASE_CHUNK && !BASE.includes(s)) errors.push(`${s} landed in ${BASE_CHUNK}`);
      const late = LATE.includes(s);
      if (late && !LATE_CHUNKS.includes(c.name)) errors.push(`late sheet ${s} is in chunk ${c.name}: only ${LATE_CHUNKS.join(', ')} are placed after the theme`);
      if (!late && LATE_CHUNKS.includes(c.name) && s !== THEME) errors.push(`${s} is in late chunk ${c.name} (would load after the theme)`);
    }
  }
  if (!chunks.some((c) => c.isEntry && c.sheets.includes(THEME))) errors.push(`${THEME} is not in the entry chunk`);
  for (const s of BASE) if (!seenBase.has(s)) errors.push(`base sheet ${s} is not in ${BASE_CHUNK}`);
  return errors;
}

/** The statement in Vite's preload helper that inserts a dependency <link>. */
const HELPER_APPEND = 'document.head.appendChild(link);';

/**
 * Route the preload helper's stylesheet links through window.__ctPlaceCss (ui/common/cssOrder.ts),
 * which puts them before the theme link (or after it, for late chunks). Returns null when the
 * helper does not look as expected (the build then fails: see vite.config.ts).
 */
export function patchPreloadHelper(code: string): string | null {
  if (code.split(HELPER_APPEND).length !== 2 || !code.includes('const isCss')) return null;
  return code.replace(HELPER_APPEND, 'if (isCss && typeof window.__ctPlaceCss === "function") window.__ctPlaceCss(link); else document.head.appendChild(link);');
}

/** Mark the entry's own stylesheet link (the theme) in index.html; null when it is not found. */
export function markThemeLink(html: string, themeFile: string): string | null {
  const re = new RegExp(`<link rel="stylesheet"([^>]*?) href="([^"]*${themeFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})"`);
  if (!re.test(html)) return null;
  return html.replace(re, '<link rel="stylesheet" data-ct-css="theme"$1 href="$2"');
}

/** Move the index-base stylesheet link right before the (marked) theme link; null when either is missing. */
export function baseBeforeTheme(html: string): string | null {
  const base = new RegExp(`[ \\t]*<link rel="stylesheet"[^>]*href="[^"]*/${BASE_CHUNK}-[^"]*\\.css"[^>]*>\\n?`).exec(html);
  if (!base) return null;
  const rest = html.slice(0, base.index) + html.slice(base.index + base[0].length);
  const at = rest.search(/[ \t]*<link rel="stylesheet" data-ct-css="theme"/);
  if (at < 0) return null;
  return rest.slice(0, at) + base[0] + (base[0].endsWith('\n') ? '' : '\n') + rest.slice(at);
}

/**
 * Lazy chunks whose main module is a directory's index.tsx (ui/storyteller/index.tsx, ui/intro/index.ts)
 * would be named index-*.js / index-*.css like the app entry, and tooling reads assets/index-*.css as
 * the entry CSS (scripts/perf/budgets.mjs). Name them after the directory instead ('storyteller').
 * `moduleIds`: the chunk's modules (a shared chunk has no facade module).
 */
export function lazyIndexName(chunk: { name: string; isEntry: boolean; facadeModuleId: string | null; moduleIds: readonly string[] }): string | null {
  if (chunk.isEntry || chunk.name !== 'index') return null;
  for (const id of [chunk.facadeModuleId, ...chunk.moduleIds]) {
    const m = id && /\/src\/(?:.*\/)?([^/]+)\/index\.[jt]sx?$/.exec(id.replace(/\\/g, '/'));
    if (m) return m[1]!;
  }
  return null;
}

/** 'assets/index-AbC.css' -> 'assets/storyteller-AbC.css' (the CSS asset of a renamed lazy index chunk). */
export function renamedCss(file: string, dir: string): string {
  return file.replace(/(^|\/)index-([^/]+\.css)$/, `$1${dir}-$2`);
}
