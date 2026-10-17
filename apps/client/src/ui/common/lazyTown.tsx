// (v2.4 perf P2) Lazy stand-ins for the components in ./townParts (one chunk). They render nothing
// until the chunk is there; `preloadTownParts()` starts the download (LobbyRoute does on mount, next
// to the Phaser chunk), so by the time the town is ready they normally render at once.
import { lazyComponent } from './lazy';

type Parts = typeof import('./townParts');
let parts: Promise<Parts> | null = null;
const load = (): Promise<Parts> =>
  (parts ??= import('./townParts').catch((e: unknown) => {
    parts = null; // retry on the next mount / preload
    throw e;
  }));

/** Start fetching the in-town panels' chunk (idempotent, never rejects). */
export const preloadTownParts = (): Promise<void> => load().then(
  () => undefined,
  () => undefined,
);

export const Notebook = lazyComponent(() => load().then((m) => m.Notebook));
export const Story = lazyComponent(() => load().then((m) => m.Story));
export const SocialPalette = lazyComponent(() => load().then((m) => m.SocialPalette));
export const ClockChip = lazyComponent(() => load().then((m) => m.ClockChip));
export const AutoStorylineSetting = lazyComponent(() => load().then((m) => m.AutoStorylineSetting));
