import type { ComponentType } from 'preact';
import { useEffect, useState } from 'preact/hooks';

// Guarded mount of the tutorial teammate's pre-sign-in tour (apps/client/src/ui/intro/index.ts).
// import.meta.glob resolves to {} when the folder does not exist yet, so this compiles and simply
// renders nothing (and hides "Watch the tour") until the tour lands. When it exists it is loaded as
// a separate chunk after first paint, so it never delays the landing screen.
//
// Expected exports (from the tutorial teammate):
//   IntroHost(props: { invited?: boolean; onAction?: (reason: 'skip' | 'finish' | 'join') => void })
//     auto-shows on first visit (localStorage 'ct.intro.seen.v1'), listens for openIntro(), marks seen on close.
//   openIntro(): void

export type IntroReason = 'skip' | 'finish' | 'join';
type IntroModule = {
  IntroHost: ComponentType<{ invited?: boolean; onAction?: (reason: IntroReason) => void }>;
  openIntro: () => void;
};

const loaders = import.meta.glob<IntroModule>('../intro/index.ts');
const load = loaders['../intro/index.ts'];

let cached: IntroModule | null = null;
let pending: Promise<IntroModule | null> | null = null;
function loadIntro(): Promise<IntroModule | null> {
  if (cached) return Promise.resolve(cached);
  if (!load) return Promise.resolve(null);
  pending ??= load()
    .then((m) => (typeof m?.IntroHost === 'function' && typeof m.openIntro === 'function' ? (cached = m) : null))
    .catch(() => null);
  return pending;
}

/** The tour module once loaded (null while loading, or forever if it isn't in this build). */
export function useIntro(): IntroModule | null {
  const [mod, setMod] = useState<IntroModule | null>(cached);
  useEffect(() => {
    let alive = true;
    void loadIntro().then((m) => alive && setMod(m));
    return () => {
      alive = false;
    };
  }, []);
  return mod;
}

export function TourHost({ mod, invited, onAction }: { mod: IntroModule | null; invited: boolean; onAction: (r: IntroReason) => void }) {
  if (!mod) return null;
  const Host = mod.IntroHost;
  return <Host invited={invited} onAction={onAction} />;
}
