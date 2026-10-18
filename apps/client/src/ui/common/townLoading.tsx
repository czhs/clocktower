// LEAD-OWNED (v3 WP8). The v3 loading scene with real progress, for the lobby chunk:
//   <TownLoading renderer="v3" | "classic" />   GameScreen's town-loading state in a v3 lobby (replaces "Lighting the
//                                               lamps…"; v2 lobbies keep the old overlay)
//   useLoadSeen()                               the Resource Timing tracker (./townLoad.ts) as Preact state
import { useEffect, useState } from 'preact/hooks';
import { loadProgress, loadSeen, onLoadSeen, type LoadSeen, type LoadStep } from './townLoad';
import { V3Loading } from './v3loading';

export function useLoadSeen(): LoadSeen {
  const [s, set] = useState<LoadSeen>(loadSeen);
  useEffect(() => {
    set(loadSeen());
    return onLoadSeen(set);
  }, []);
  return s;
}

/** The scene for one loading step, its progress read from the tracker. `label` overrides the step's line. */
export function V3LoadingStep({ step, renderer = 'v3', label, detail }: { step: LoadStep; renderer?: 'v3' | 'classic'; label?: string; detail?: string | null }) {
  const p = loadProgress(step, useLoadSeen(), renderer);
  return <V3Loading frac={p.frac} label={label ?? p.label} detail={detail ?? p.detail} />;
}

/** GameScreen, v3 lobby, while the town loads (chunk → pieces → warm-up). */
export function TownLoading({ renderer }: { renderer: 'v3' | 'classic' }) {
  return <V3LoadingStep step="town" renderer={renderer} />;
}
