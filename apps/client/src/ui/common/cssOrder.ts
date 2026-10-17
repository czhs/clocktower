// (v2.4 perf P2) Cascade order of lazily loaded stylesheets — runtime side; the build side and the
// reasoning are in apps/client/build/cssOrder.ts. Imported first by main.tsx (before anything can
// start a dynamic import).
//
// Build: Vite's preload helper (patched in vite.config.ts) hands every chunk stylesheet <link> to
// window.__ctPlaceCss instead of appending it to <head>: feature sheets go just before the theme
// link (index.html, data-ct-css="theme"), so the theme still wins ties as in one bundle; the late
// dialogs' sheets (SettingsDialog, IntroTour) go after it, where they always were.
// Dev (`vite` serve): sheets are <style data-vite-dev-id> elements appended in import order; they are
// kept sorted by the same cascade order (moving a <style> re-applies it synchronously).

declare global {
  interface Window {
    __ctPlaceCss?: (link: HTMLLinkElement) => void;
  }
}

/** Chunk stylesheets that belong after the theme (see LATE_CHUNKS in build/cssOrder.ts). */
export const LATE_CSS = /\/(?:SettingsDialog|IntroTour)-[\w-]+\.css(?:$|\?)/;

/** Insert a chunk stylesheet link at its cascade position in `head`. */
export function placeCss(head: HTMLElement, link: HTMLLinkElement): void {
  const theme = LATE_CSS.test(link.href) ? null : head.querySelector('link[rel="stylesheet"][data-ct-css="theme"]');
  if (theme && theme.parentNode === head) head.insertBefore(link, theme);
  else head.appendChild(link);
}

/** Dev only: keep Vite's injected <style data-vite-dev-id> elements in `order` (paths under src/). */
function sortDevStyles(order: readonly string[]): void {
  const rank = (el: Element): number => {
    const id = (el.getAttribute('data-vite-dev-id') ?? '').replace(/\\/g, '/');
    const i = order.findIndex((p) => id.endsWith(`/src/${p}`));
    return i < 0 ? order.length : i;
  };
  let busy = false;
  const sort = () => {
    if (busy) return;
    const styles = [...document.head.querySelectorAll('style[data-vite-dev-id]')];
    const sorted = [...styles].sort((a, b) => rank(a) - rank(b));
    if (sorted.every((el, i) => el === styles[i])) return;
    busy = true;
    for (const el of sorted) document.head.appendChild(el);
    busy = false;
  };
  new MutationObserver(sort).observe(document.head, { childList: true });
  sort();
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.__ctPlaceCss = (link) => placeCss(document.head, link);
  if (import.meta.env.DEV) sortDevStyles(__CT_CSS_ORDER__);
}

declare const __CT_CSS_ORDER__: readonly string[];
