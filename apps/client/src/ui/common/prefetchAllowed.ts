// v3.2 perf (ui/common/townPrefetch.ts): may this page prefetch chunks it does not need yet? Its own module so the entry
// chunk (main.tsx) can ask without pulling select.ts in.
type NetInfo = { saveData?: boolean; effectiveType?: string };

/** Save-Data off and the connection not slow (2g / slow-2g / 3g). Pure over `nav`. */
export function prefetchAllowed(nav: { connection?: NetInfo } | undefined = typeof navigator === 'undefined' ? undefined : (navigator as { connection?: NetInfo })): boolean {
  const c = nav?.connection;
  if (!c) return true;
  if (c.saveData) return false;
  return !['slow-2g', '2g', '3g'].includes(c.effectiveType ?? '');
}
