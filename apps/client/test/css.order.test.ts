// (v2.4 perf P2) Stylesheet cascade order across lazy chunks: build/cssOrder.ts (build side) and
// src/ui/common/cssOrder.ts (runtime placement of chunk <link>s before the theme).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BASE, baseBeforeTheme, checkCssChunks, CSS_ORDER, LATE, LATE_CHUNKS, lazyIndexName, markThemeLink, patchPreloadHelper, renamedCss, THEME, type ChunkCss } from '../build/cssOrder';
import { LATE_CSS, placeCss } from '../src/ui/common/cssOrder';

const SRC = join(import.meta.dirname, '../src');
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const files = walk(SRC);
const rel = (f: string) => relative(SRC, f).replace(/\\/g, '/');

describe('CSS_ORDER covers the client', () => {
  const sheets = files.filter((f) => f.endsWith('.css')).map(rel).filter((s) => s !== 'ui/common/fonts.css');
  it('lists every stylesheet once (fonts.css is @imported by the theme)', () => {
    expect(new Set(CSS_ORDER).size).toBe(CSS_ORDER.length);
    expect([...sheets].sort()).toEqual([...CSS_ORDER].sort());
    expect(readFileSync(join(SRC, THEME), 'utf8')).toMatch(/@import '\.\/fonts\.css'/);
  });
  it('puts the theme after every feature sheet and only the late dialogs after it', () => {
    const t = CSS_ORDER.indexOf(THEME);
    expect(CSS_ORDER.slice(t + 1)).toEqual(LATE);
    for (const b of BASE) expect(CSS_ORDER.indexOf(b as (typeof CSS_ORDER)[number])).toBeLessThan(t);
  });
  it('main.tsx installs the placement first, then imports exactly the base sheets in cascade order, theme last', () => {
    const main = readFileSync(join(SRC, 'main.tsx'), 'utf8');
    const imports = [...main.matchAll(/^import '\.\/([^']+)';$/gm)].map((m) => m[1]);
    expect(imports[0]).toBe('ui/common/cssOrder');
    const css = imports.filter((i) => i!.endsWith('.css'));
    expect(css).toEqual([...BASE].sort((a, b) => CSS_ORDER.indexOf(a as never) - CSS_ORDER.indexOf(b as never)).concat(THEME));
    // nothing before the placement hook can start a dynamic import
    expect(main.indexOf("import './ui/common/cssOrder'")).toBeLessThan(main.indexOf('import('));
  });
  it('every feature sheet is imported by the component that uses it (it ships with that chunk)', () => {
    const imported = new Set<string>();
    for (const f of files.filter((x) => /\.tsx?$/.test(x) && !x.endsWith('main.tsx') && !rel(x).startsWith('game/dev/')))
      for (const m of readFileSync(f, 'utf8').matchAll(/^import '(\.[^']+\.css)';/gm)) imported.add(rel(join(f, '..', m[1]!)));
    for (const s of CSS_ORDER.filter((x) => !BASE.includes(x) && x !== THEME)) expect(imported.has(s), s).toBe(true);
  });
});

describe('checkCssChunks', () => {
  const good: ChunkCss[] = [
    { name: 'index', isEntry: true, sheets: [THEME] },
    { name: 'index-base', isEntry: false, sheets: [...BASE] },
    { name: 'LobbyRoute', isEntry: false, sheets: ['game/game.css', 'ui/hud/hud.css', 'ui/chat/chat.css'] },
    { name: 'SettingsDialog', isEntry: false, sheets: ['ui/common/Settings.css'] },
    { name: 'IntroTour', isEntry: false, sheets: ['ui/intro/intro.css'] },
  ];
  it('accepts the intended layout', () => expect(checkCssChunks(good)).toEqual([]));
  it('rejects an unknown sheet, a feature sheet in the entry, the theme in a lazy chunk, mixed late chunks', () => {
    expect(checkCssChunks([...good, { name: 'X', isEntry: false, sheets: ['ui/new/new.css'] }]).join()).toMatch(/not in CSS_ORDER/);
    expect(checkCssChunks([{ ...good[0]!, sheets: [THEME, 'ui/hud/hud.css'] }, ...good.slice(1)]).join()).toMatch(/entry chunk's CSS/);
    expect(checkCssChunks([...good, { name: 'X', isEntry: false, sheets: [THEME] }]).join()).toMatch(/only be in the entry/);
    expect(checkCssChunks([...good, { name: 'LobbyRoute', isEntry: false, sheets: ['ui/common/Settings.css'] }]).join()).toMatch(/late sheet/);
    expect(checkCssChunks([...good, { name: 'SettingsDialog', isEntry: false, sheets: ['ui/hud/hud.css'] }]).join()).toMatch(/late chunk/);
    expect(checkCssChunks(good.filter((c) => c.name !== 'index-base')).join()).toMatch(/base sheet/);
    expect(LATE_CHUNKS).toEqual(['SettingsDialog', 'IntroTour']);
  });
});

describe('build hooks', () => {
  it('patches the preload helper exactly once', () => {
    const helper = 'const isCss = dep.endsWith(".css");\n\t\t\tdocument.head.appendChild(link);\n\t\t\tif (isCss) return 1;';
    expect(patchPreloadHelper(helper)).toContain('window.__ctPlaceCss(link); else document.head.appendChild(link);');
    expect(patchPreloadHelper('document.head.appendChild(x);')).toBeNull();
    expect(patchPreloadHelper(helper + helper)).toBeNull();
  });
  it('marks the theme link and moves the base sheet before it', () => {
    const html = '<head>\n  <link rel="stylesheet" crossorigin href="/assets/index-T1.css">\n  <link rel="stylesheet" crossorigin href="/assets/index-base-B1.css">\n</head>';
    const marked = markThemeLink(html, 'assets/index-T1.css')!;
    expect(marked).toContain('<link rel="stylesheet" data-ct-css="theme" crossorigin href="/assets/index-T1.css">');
    const out = baseBeforeTheme(marked)!;
    expect(out.indexOf('index-base-B1.css')).toBeLessThan(out.indexOf('data-ct-css="theme"'));
    expect(out.match(/<link/g)).toHaveLength(2);
    expect(markThemeLink(html, 'assets/nope.css')).toBeNull();
  });
  it('names lazy index chunks after their directory', () => {
    const c = { name: 'index', isEntry: false, facadeModuleId: null, moduleIds: ['/x/apps/client/src/ui/storyteller/stage.tsx', '/x/apps/client/src/ui/storyteller/index.tsx'] };
    expect(lazyIndexName(c)).toBe('storyteller');
    expect(lazyIndexName({ ...c, isEntry: true })).toBeNull();
    expect(lazyIndexName({ ...c, name: 'LobbyRoute' })).toBeNull();
    expect(renamedCss('assets/index-Dp4_CHYO.css', 'storyteller')).toBe('assets/storyteller-Dp4_CHYO.css');
  });
});

describe('placeCss (runtime)', () => {
  /** A minimal <head>: an ordered list of nodes. */
  function fakeHead(hrefs: { href: string; theme?: boolean }[]) {
    const kids: { href: string; theme?: boolean }[] = [...hrefs];
    const head = {
      kids,
      querySelector: () => kids.find((k) => k.theme) ?? null,
      insertBefore: (n: { href: string }, ref: { href: string }) => kids.splice(kids.indexOf(ref), 0, n),
      appendChild: (n: { href: string }) => kids.push(n),
    };
    for (const k of kids) Object.defineProperty(k, 'parentNode', { value: head });
    return head;
  }
  it('puts feature chunks before the theme (in load order) and late dialogs after it', () => {
    const head = fakeHead([{ href: '/assets/index-base-B.css' }, { href: '/assets/index-T.css', theme: true }]);
    const add = (href: string) => placeCss(head as unknown as HTMLElement, { href } as HTMLLinkElement);
    add('https://x/assets/LobbyRoute-L.css');
    add('https://x/assets/SettingsDialog-S.css');
    add('https://x/assets/townParts-P.css');
    add('https://x/assets/IntroTour-I.css');
    expect(head.kids.map((k) => k.href.split('/').pop())).toEqual(['index-base-B.css', 'LobbyRoute-L.css', 'townParts-P.css', 'index-T.css', 'SettingsDialog-S.css', 'IntroTour-I.css']);
  });
  it('appends when there is no marked theme link (dev / tests)', () => {
    const head = fakeHead([{ href: '/a.css' }]);
    placeCss(head as unknown as HTMLElement, { href: '/assets/hud-1.css' } as HTMLLinkElement);
    expect(head.kids.map((k) => k.href)).toEqual(['/a.css', '/assets/hud-1.css']);
    expect(LATE_CSS.test('/assets/SettingsDialog-yG88v_-s.css')).toBe(true);
    expect(LATE_CSS.test('/assets/LobbyRoute-x.css')).toBe(false);
  });
});
