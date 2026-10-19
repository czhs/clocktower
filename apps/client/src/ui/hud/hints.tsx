// OWNED BY rules-storyteller. (gameplay) "Learned by playing": ONE short context hint for what to do
// right now (walk home, take your seat, vote now, you're dead but still social, private visit…).
// It appears when the context changes and fades after ~6 s; hints that need an action right now
// (sticky) shrink to a small pill instead of disappearing.
// Reads the own control state from world snapshots (`you`) and the predicted position from the
// localPlayer store; re-renders only when a derived value changes. Player-only data.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { currentLayout } from '../../net/layout'; // (v3) the lobby's layout
import { circleSpots, CIRCLE_SEATED_PX, type BuildingDef, type PlayerGameView, type SelfControl } from '@ct/protocol';
import { localPlayer, type LocalPlayerState } from '../../net/localPlayer';
import type { RoomConnection } from '../../net/room';
import { Countdown } from './shared';
import { townSays } from '../clock/logic';

/** Own avatar control from world snapshots; re-renders only when mode/goal change. */
function useSelfControl(conn: RoomConnection): Pick<SelfControl, 'mode' | 'goal'> | null {
  const [ctl, setCtl] = useState<Pick<SelfControl, 'mode' | 'goal'> | null>(null);
  useEffect(() => {
    let key = '';
    return conn.events.on('world:snapshot', (s) => {
      const next = s.you ? `${s.you.mode}|${s.you.goal ?? ''}` : '';
      if (next === key) return;
      key = next;
      setCtl(s.you ? { mode: s.you.mode, goal: s.you.goal } : null);
    });
  }, [conn]);
  return ctl;
}

/** Derive a small value from the (per-frame) localPlayer store; re-render only when it changes. */
function useLocalDerived<T extends string | number | boolean>(fn: (lp: LocalPlayerState) => T, deps: unknown[]): T {
  const [v, setV] = useState(() => fn(localPlayer.get()));
  useEffect(() => {
    setV(fn(localPlayer.get()));
    return localPlayer.subscribe((lp) => setV(fn(lp)));
  }, deps);
  return v;
}

const HINT_MS = 6000;

export function homeOf(seat: number): BuildingDef | null {
  return currentLayout().buildings.find((b) => b.houseIndex === seat) ?? null;
}

export function MoveHint({ view, conn }: { view: PlayerGameView; conn: RoomConnection }) {
  const ctl = useSelfControl(conn);
  const seat = view.you.seat;
  const home = useMemo(() => homeOf(seat), [seat]);
  const seatsKey = view.players.map((p) => p.seat).join(',');
  const spot = useMemo(
    () => (view.gathering ? (circleSpots(currentLayout(), view.players.map((p) => p.seat)).find((s) => s.seat === seat) ?? null) : null),
    [seatsKey, seat, view.gathering],
  );
  // 'home' | 'otherhouse' | 'inside' | 'seated' | 'outdoors'
  const where = useLocalDerived(
    (lp) => {
      if (home && lp.location === `bld:${home.id}`) return 'home';
      if (lp.location !== 'outdoors') {
        const b = currentLayout().buildings.find((x) => `bld:${x.id}` === lp.location);
        return b && b.houseIndex !== null ? 'otherhouse' : 'inside';
      }
      if (spot && Math.hypot(lp.x - spot.x, lp.y - spot.y) <= CIRCLE_SEATED_PX) return 'seated';
      return 'outdoors';
    },
    [home, spot],
  );

  const p = view.phase;
  // A running vote, or a pending nomination (hands may go up before the clock starts).
  const nom = p === 'day' ? (view.day?.nominations.find((n) => n.status === 'voting') ?? view.day?.nominations.find((n) => n.status === 'pending')) : undefined;
  let text: string | null = null;
  let short = '';
  let sticky = false;
  let tone = '';
  let countdown = false;
  if (p === 'finished') text = null;
  else if (ctl?.mode === 'frozen') {
    text = 'The Storyteller has paused your movement.';
    short = '❄ Paused';
    sticky = true;
    tone = 'frozen';
  } else if (view.storytellerVisitingYou) {
    text = 'The Storyteller is visiting you: this conversation is private.';
    short = '🕯 Private visit';
    sticky = true;
    tone = 'private';
  } else if (nom && !(seat in nom.votes)) {
    const canVote = view.you.alive || view.you.ghostVoteAvailable;
    const raised = (nom.handsRaised ?? []).includes(seat);
    if (!canVote) text = 'Your ghost vote is used: you can still watch and talk.';
    else if (raised) {
      text = 'Your hand is up: it counts when the clock hand reaches you.';
      short = '✋ Hand up';
      sticky = true;
      tone = 'ok';
    } else {
      text =
        nom.status === 'pending'
          ? view.you.alive
            ? 'A vote is coming: raise your hand now if you want to vote.'
            : 'A vote is coming: raising your hand uses your one ghost vote.'
          : view.you.alive
            ? 'Vote now: raise your hand before the clock reaches you.'
            : 'Vote now: raising your hand uses your one ghost vote.';
      short = 'Vote now';
      sticky = true;
      tone = 'vote';
    }
  } else if (p === 'bedtime') {
    if (where === 'home') {
      text = "You're home. Night falls when everyone is in.";
      tone = 'ok';
    } else if (view.bedtimeOvertime || ctl?.mode === 'auto') {
      text = 'The night watch walks you home…';
      tone = 'auto';
    } else {
      text =
        where === 'otherhouse'
          ? 'This is not your house: yours is marked. Head out and walk home.'
          : where === 'inside'
            ? 'Night is falling: leave this building and walk home (your house is marked).'
            : 'Night is falling: walk home (your house is marked).';
      short = where === 'otherhouse' ? '⌂ Not your house' : '⌂ Walk home';
      sticky = true;
      countdown = true;
    }
  } else if ((p === 'night' || p === 'first_night') && where === 'home') {
    text = 'Night: wait at home. The Storyteller may visit you.';
    tone = 'night';
  } else if (ctl?.mode === 'auto') {
    text = ctl.goal === 'seat' ? 'The Storyteller is walking you to your seat…' : ctl.goal === 'home' ? 'The Storyteller is walking you home…' : 'The Storyteller is guiding you…';
    tone = 'auto';
  } else if (!view.you.alive && p === 'day') {
    text = view.you.ghostVoteAvailable
      ? "You're dead: you can still talk, and you have 1 ghost vote."
      : "You're dead: you can still talk; your ghost vote is used.";
    tone = 'dead';
  } else if (view.gathering && p === 'day') {
    if (where === 'seated') {
      text = `Seated (seat ${seat + 1}).`;
      tone = 'ok';
    } else {
      text = where === 'inside' || where === 'otherhouse' ? `The town gathers: head out and take your seat in the circle (seat ${seat + 1}).` : `Take your seat in the circle (seat ${seat + 1}).`;
      short = `◯ Seat ${seat + 1}`;
      sticky = true;
    }
  } else if (p === 'setup') {
    text = 'Explore and chat: the Storyteller is preparing the game.';
  }

  // Show on every context change; after HINT_MS fade out, or shrink to a pill when sticky.
  const [stage, setStage] = useState<'full' | 'pill' | 'gone'>('full');
  useEffect(() => {
    if (!text) return;
    setStage('full');
    const t = setTimeout(() => setStage(sticky ? 'pill' : 'gone'), sticky ? HINT_MS : HINT_MS + 600);
    return () => clearTimeout(t);
  }, [text, sticky]);
  if (!text || stage === 'gone') return null;
  const pill = stage === 'pill';
  return (
    <div class={`cth-hint ${tone}${pill ? ' pill' : sticky ? '' : ' fade'}`} role="status" aria-live="polite" title={pill ? text : undefined}>
      <span>{townSays(pill && short ? short : text, view.storytellerMode)}</span>
      {countdown && view.phaseEndsAt !== null && <Countdown endsAt={view.phaseEndsAt} />}
    </div>
  );
}
