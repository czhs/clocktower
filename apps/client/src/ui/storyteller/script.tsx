// OWNED BY rules-storyteller (st-ui). The Storyteller's default, simple panel: "the game is a stage
// and the Storyteller moves the props".
//   * PhaseStageBar  — every phase as a big stage cue; jump to any of them in any order (current one lit,
//                      the suggested next one emphasised; consequential jumps arm a confirm strip that
//                      says who sees it, what the rules say follows, and whether Undo can revert it).
//   * ScriptView     — only what this moment needs: setup, bedtime, TONIGHT'S VISITS (a play script:
//                      house + player + portrait + role + what to tell them, Go / Done / Next visit),
//                      dawn, and the day (circle, nominations, votes, execution, bell, seat list).
// Everything else (full Grimoire, statuses, tools, log, stage map, teleport / walk, doors...) stays in
// the existing tabs behind "Grimoire & tools". The rules engine only advises: nothing here is gated
// except where the server would reject the payload.
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { currentLayout } from '../../net/layout'; // (v3) the lobby's layout
import { CHARACTER_INFO, type BuildingDef, type GrimoireEntry, type InfoSpecInput, type NightStepView, type StorytellerGameView } from '@ct/protocol';
import { CastPortrait } from '../common/castPortrait';
import { charName, CharacterSelect, Countdown, nameOf } from '../hud/shared';
import { swapCharacter, swapNumber, swapSeat, type InfoAttachments, type InfoDraft } from './infoEdit';
import { BedtimeTimer, ClockButton, ConfirmButton, deathEffects, EVERYONE, noExecutionEffects, only, type Send } from './stage';
import { StClockControl } from '../clock/StClock'; // (v2.1, clock-client) the town clock on the tower
import { DealChooser, dealSummary } from './deal'; // (v2.2) dealing modes
import { ExileControls, TravellerSetup } from './travellers'; // Travellers + exile

/** Character (cast) id for a seat's portrait, or null (silhouette). */
export type CastOf = (seat: number) => string | null;
/** Open the full Grimoire & tools on a tab (optionally with a player's card open on the Stage tab). */
export type OpenTools = (tab: 'setup' | 'stage' | 'grimoire' | 'night' | 'day' | 'tools' | 'log', seat?: number) => void;

// ------------------------------------------------------------------------------------ helpers

const FINISHED = (s: NightStepView) => s.status === 'resolved' || s.status === 'skipped';
const isNight = (p: StorytellerGameView['phase']) => p === 'first_night' || p === 'night';
/** Steps whose resolve needs a chosen target (server: "No target chosen yet" without one). */
const TARGET_STEPS: readonly string[] = ['monk', 'poisoner', 'imp', 'butler'];

export function houseOf(seat: number): BuildingDef | undefined {
  return currentLayout().buildings.find((b) => b.houseIndex === seat);
}

const name = (view: StorytellerGameView, seat: number) => nameOf(view.players, seat);

/** The seat-bound steps of tonight's order (each is a house to visit), in night order. */
export function visitSteps(view: StorytellerGameView): NightStepView[] {
  return view.nightQueue.filter((s) => s.seat !== null);
}

/**
 * The next house to go to: the first unfinished visit after the one the Storyteller is in (night
 * order), wrapping round to any earlier one they passed over. Null when every visit is done.
 */
export function nextVisit(view: StorytellerGameView): NightStepView | null {
  const visits = visitSteps(view);
  let here = -1;
  visits.forEach((s, i) => {
    if (s.seat === view.visitingSeat) here = i;
  });
  const open = (s: NightStepView) => !FINISHED(s) && s.seat !== view.visitingSeat;
  return visits.slice(here + 1).find(open) ?? visits.find(open) ?? null;
}

/** Names of the living Minions / Demons (who an evil-team info step tells). */
function evilNames(view: StorytellerGameView, type: 'minion' | 'demon'): string {
  return view.grimoire
    .filter((g) => g.alive && CHARACTER_INFO[g.character].type === type)
    .map((g) => g.name)
    .join(', ');
}

function stragglers(view: StorytellerGameView): number[] {
  return (view.stage?.players ?? []).filter((x) => x.presence !== 'home').map((x) => x.seat);
}

function list(names: string[]): string {
  return names.length > 4 ? `${names.slice(0, 4).join(', ')} +${names.length - 4}` : names.join(', ');
}

/** Teleport the Storyteller into a seat's cottage (at night the engine counts it as a visit). */
function goTo(send: Send, seat: number): void {
  const h = houseOf(seat);
  if (h) send({ type: 'teleport_self', to: { kind: 'building', buildingId: h.id } });
  else send({ type: 'visit_home', seat });
}

/** Back outside, on the square (the server picks the nearest free spot). */
function toSquare(send: Send): void {
  const sq = currentLayout().square;
  send({ type: 'teleport_self', to: { kind: 'point', x: Math.round(sq.cx), y: Math.round(sq.cy + sq.r * 0.55) } });
}

// --------------------------------------------------------------------------------- stage cues

export type Cue = 'setup' | 'first_night' | 'day' | 'gather' | 'bedtime' | 'night' | 'dawn' | 'end';

const CUES: { id: Cue; label: string; icon: string; title: string }[] = [
  { id: 'setup', label: 'Setup', icon: '✎', title: 'Setup: deal the characters' },
  { id: 'first_night', label: 'First night', icon: '☽', title: 'The first night' },
  { id: 'day', label: 'Day', icon: '☼', title: 'Day: the town talks' },
  { id: 'gather', label: 'Gather', icon: '◎', title: 'Gather the circle for nominations' },
  { id: 'bedtime', label: 'Bedtime', icon: '♫', title: 'Ring the bedtime bell: everyone walks home' },
  { id: 'night', label: 'Night', icon: '☾', title: 'Night: visit the houses' },
  { id: 'dawn', label: 'Dawn', icon: '☀', title: 'Dawn: review the night (nothing is announced yet)' },
  { id: 'end', label: 'End', icon: '⚑', title: 'End the game' },
];

interface ConfirmSpec {
  ask: string;
  audience?: string;
  effects?: string[];
  undo?: 'yes' | 'final';
}
interface CueAction {
  run: () => void;
  confirm?: ConfirmSpec;
  /** Tooltip / what happens. */
  hint: string;
  /** The server would reject it (e.g. no characters yet): the cue is disabled with this reason. */
  blocked?: string;
}

export function currentCue(view: StorytellerGameView): Cue {
  switch (view.phase) {
    case 'setup':
      return 'setup';
    case 'first_night':
      return 'first_night';
    case 'night':
      return 'night';
    case 'bedtime':
      return 'bedtime';
    case 'dawn':
      return 'dawn';
    case 'day':
      return view.gathering ? 'gather' : 'day';
    case 'finished':
      return 'end';
  }
}

/** The cue the Storyteller most likely wants next (emphasised; advisory only). */
export function suggestedCue(view: StorytellerGameView): Cue | null {
  if (view.pendingResult) return 'end';
  switch (view.phase) {
    case 'setup':
      return view.charactersAssigned ? 'bedtime' : null;
    case 'bedtime':
      return view.bedtimeFirstNight ? 'first_night' : 'night';
    case 'first_night':
    case 'night':
      return 'dawn';
    case 'dawn':
      return 'day';
    case 'day': {
      const d = view.day;
      if (!view.gathering && d && d.executedSeat === null && !d.nominations.length) return 'gather';
      return 'bedtime';
    }
    case 'finished':
      return null;
  }
}

/** A visit step's role name (the character they wake as). */
function roleName(s: NightStepView): string {
  return s.character === 'minion_info' ? 'Minion info' : s.character === 'demon_info' ? 'Demon info' : s.character === 'dusk' ? 'Dusk' : s.character === 'dawn' ? 'Dawn' : charName(s.character);
}

/** What ending the day now means (`verb` = 'End the day' | 'Night now'). */
function dayEndEffects(view: StorytellerGameView, verb = 'End the day'): { ask: string; effects: string[] } {
  const d = view.day;
  const voting = d?.nominations.find((n) => n.status === 'voting');
  const block = d && d.executedSeat === null ? d.onTheBlock : null;
  if (voting) {
    const fx = ['The running vote is dropped.'];
    if (block) fx.push(`${name(view, block.seat)} is on the block and is NOT executed.`);
    return { ask: `${verb} while a vote is running?`, effects: fx };
  }
  if (block) return { ask: `${verb}? ${name(view, block.seat)} is executed.`, effects: deathEffects(view, block.seat, 'execute') };
  if (d && d.executedSeat !== null) return { ask: `${verb}?`, effects: [] };
  return { ask: `${verb} with no execution?`, effects: noExecutionEffects(view) };
}

function visitsLeftEffects(view: StorytellerGameView): string[] {
  const left = visitSteps(view).filter((s) => !FINISHED(s)).length;
  const group = view.nightQueue.filter((s) => (s.character === 'minion_info' || s.character === 'demon_info') && !FINISHED(s));
  const out: string[] = [];
  if (left) out.push(`${left} visit${left === 1 ? '' : 's'} not done yet.`);
  for (const g of group) out.push(`${g.character === 'minion_info' ? 'Minion' : 'Demon'} info not given yet.`);
  return out;
}

/** What jumping to `cue` does from the current state (null = this is where we are). */
export function cueAction(view: StorytellerGameView, cue: Cue, send: Send): CueAction | null {
  const p = view.phase;
  if (p === 'finished') return cue === 'end' ? null : { run: () => undefined, hint: 'The game is over', blocked: 'The game is over: start a rematch from the lobby.' };
  const night = isNight(p);
  const voting = p === 'day' && !!view.day?.nominations.some((n) => n.status === 'voting');
  const out = stragglers(view);
  const outFx = out.length ? [`Not home yet: ${list(out.map((s) => name(view, s)))}. They are put to bed.`] : [];
  const force = (to: 'setup' | 'first_night' | 'day' | 'gather' | 'bedtime' | 'night' | 'dawn', ask: string, effects: string[] = [], audience = EVERYONE): CueAction => ({
    run: () => send({ type: 'force_phase', to }),
    confirm: { ask, audience, effects, undo: 'yes' },
    hint: 'Jump straight there (a stage override; no rules checks)',
  });
  const unassigned = !view.charactersAssigned && view.dayNumber === 0 && p === 'setup';
  switch (cue) {
    case 'setup':
      if (p === 'setup') return null;
      return force('setup', 'Return the town to setup?', ["Tonight's night order and today's nominations are cleared."]);
    case 'first_night':
      if (p === 'first_night') return null;
      if (p === 'setup') {
        if (!view.charactersAssigned) return { run: () => undefined, hint: 'Deal the characters first', blocked: 'Deal the characters first (Random setup).' };
        return { run: () => send({ type: 'begin_first_night' }), confirm: { ask: 'First night now? Anyone not home is put to bed.', audience: EVERYONE, undo: 'yes' }, hint: 'Skip the walk home: night falls now' };
      }
      if (p === 'bedtime' && view.bedtimeFirstNight)
        return {
          run: () => send({ type: 'advance_phase', to: 'night' }),
          confirm: out.length ? { ask: 'First night now?', audience: EVERYONE, effects: outFx, undo: 'yes' } : undefined,
          hint: 'Night falls: the first night begins',
        };
      return force('first_night', 'Start a first night again?', night ? visitsLeftEffects(view) : []);
    case 'day':
      if (p === 'day') return view.gathering ? { run: () => send({ type: 'gather', on: false }), hint: 'Dissolve the circle: the town talks freely' } : null;
      if (p === 'dawn') {
        const deaths = view.pendingDeaths ?? [];
        return {
          run: () => send({ type: 'advance_phase', to: 'day' }),
          confirm: deaths.length ? { ask: 'Announce the night and start the day?', audience: EVERYONE, effects: deaths.map((s) => `${name(view, s)} dies.`), undo: 'yes' } : undefined,
          hint: deaths.length ? `Start the day: ${deaths.length} death${deaths.length > 1 ? 's' : ''} announced` : 'Start the day (nobody died)',
        };
      }
      if (night) return force('day', 'End the night now (skip the dawn review)?', visitsLeftEffects(view), "Everyone will see this; tonight's deaths are announced.");
      return force('day', 'Jump to day?');
    case 'gather':
      if (p === 'day') return view.gathering ? null : { run: () => send({ type: 'gather', on: true }), hint: 'Everyone walks to their seat in the circle' };
      return force('gather', 'Jump to day and gather the circle?', night ? visitsLeftEffects(view) : []);
    case 'bedtime':
      if (p === 'bedtime') return null;
      if (p === 'setup') {
        if (unassigned) return force('bedtime', 'Ring the bell before dealing characters?', ['Characters are not dealt yet: deal them before the first night falls.']);
        return { run: () => send({ type: 'advance_phase', to: 'bedtime' }), hint: 'Ring the bell: players walk home; the first night falls when all are in' };
      }
      if (p === 'day') {
        const { ask, effects } = dayEndEffects(view);
        if (voting) return { ...force('bedtime', ask, effects), hint: 'Ring the bedtime bell (drops the running vote)' };
        return { run: () => send({ type: 'advance_phase', to: 'bedtime' }), confirm: { ask, audience: EVERYONE, effects, undo: 'yes' }, hint: 'Ring the bedtime bell: the day ends, everyone walks home' };
      }
      return force('bedtime', 'Ring the bedtime bell now?', night ? visitsLeftEffects(view) : []);
    case 'night':
      if (p === 'night') return null;
      if (p === 'bedtime')
        return {
          run: () => send({ type: 'advance_phase', to: 'night' }),
          confirm: out.length ? { ask: 'Night now?', audience: EVERYONE, effects: outFx, undo: 'yes' } : undefined,
          hint: view.bedtimeFirstNight ? 'Night falls: the first night begins' : 'Night falls',
        };
      if (p === 'day') {
        const { ask, effects } = dayEndEffects(view, 'Night now, skipping bedtime');
        if (voting) return force('night', ask, effects);
        return {
          run: () => send({ type: 'advance_phase', to: 'night' }),
          confirm: { ask, audience: EVERYONE, effects, undo: 'yes' },
          hint: 'Night now, skipping the walk home',
        };
      }
      if (p === 'setup' && !view.charactersAssigned) return { run: () => undefined, hint: 'Deal the characters first', blocked: 'Deal the characters first (Random setup).' };
      return force('night', 'Jump to night?', p === 'first_night' ? visitsLeftEffects(view) : []);
    case 'dawn':
      if (p === 'dawn') return null;
      if (night) {
        const fx = visitsLeftEffects(view);
        return {
          run: () => send({ type: 'advance_phase', to: 'dawn' }),
          confirm: fx.length ? { ask: 'Dawn now?', audience: 'Nothing is announced until you start the day.', effects: fx, undo: 'yes' } : undefined,
          hint: 'Dawn: review the deaths (nothing is announced yet)',
        };
      }
      return force('dawn', 'Jump to dawn?');
    case 'end':
      return { run: () => undefined, hint: view.pendingResult ? 'A game end was detected: confirm or override it' : 'Declare the winner' };
  }
}

/** The always-visible row of stage cues + the confirm strip of an armed jump. */
export function PhaseStageBar({ view, send }: { view: StorytellerGameView; send: Send }) {
  const [armed, setArmed] = useState<Cue | null>(null);
  const cur = currentCue(view);
  const next = suggestedCue(view);
  useEffect(() => setArmed(null), [view.phase, view.gathering]);
  const click = (cue: Cue) => {
    const a = cueAction(view, cue, send);
    if (!a || a.blocked) return;
    if (cue === 'end' || a.confirm) setArmed(armed === cue ? null : cue);
    else {
      setArmed(null);
      a.run();
    }
  };
  const armedAction = armed ? cueAction(view, armed, send) : null;
  return (
    <div class="cts-cuebar">
      <div class="cts-cues" role="group" aria-label="Phases of the game: jump to any">
        {CUES.map((c) => {
          const a = cueAction(view, c.id, send);
          const isCur = c.id === cur;
          const isNext = c.id === next && !isCur;
          const cls = ['cts-cue', isCur ? 'now' : '', isNext ? 'next' : '', armed === c.id ? 'armed' : '', c.id === 'end' && view.pendingResult ? 'alarm' : ''].join(' ');
          return (
            <button
              key={c.id}
              class={cls}
              data-cue={c.id}
              aria-current={isCur ? 'step' : undefined}
              aria-disabled={a?.blocked ? 'true' : undefined}
              title={isCur ? `${c.title} — you are here` : a?.blocked ?? `${c.title}${a ? ` — ${a.hint}` : ''}`}
              onClick={() => click(c.id)}
            >
              <span class="cts-cue-icon" aria-hidden="true">
                {c.icon}
              </span>
              <span class="cts-cue-label">{c.label}</span>
              {isNext && <span class="cts-cue-tag">next</span>}
              {isCur && <span class="cts-cue-tag now">now</span>}
            </button>
          );
        })}
      </div>
      {armed === 'end' ? (
        <EndStrip key="end" view={view} send={send} onClose={() => setArmed(null)} />
      ) : (
        armed &&
        armedAction?.confirm && (
          <ArmedStrip
            key={armed}
            confirm={armedAction.confirm}
            onYes={() => {
              setArmed(null);
              armedAction.run();
            }}
            onClose={() => setArmed(null)}
          />
        )
      )}
    </div>
  );
}

const ARM_S = 10;

/** Inline confirm for an armed cue: who sees it, what the rules say follows, undo; disarms after 10 s. */
function ArmedStrip({ confirm, onYes, onClose, children }: { confirm: ConfirmSpec; onYes?: () => void; onClose: () => void; children?: ComponentChildren }) {
  const [left, setLeft] = useState(ARM_S);
  const first = useRef<HTMLDivElement>(null);
  useEffect(() => {
    first.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, []);
  useEffect(() => {
    if (left <= 0) return onClose();
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return (
    <div class="cts-armed" role="alertdialog" aria-label={confirm.ask} onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), onClose())}>
      <div class="cts-armed-ask">
        {confirm.ask} <span class="cts-confirm-left">({left})</span>
      </div>
      {confirm.effects?.map((e) => (
        <div class="cts-confirm-effect" key={e}>
          ⚠ {e}
        </div>
      ))}
      {confirm.audience && <div class="cts-confirm-aud">👁 {confirm.audience}</div>}
      {confirm.undo === 'yes' && <div class="muted">↶ Undo can revert this.</div>}
      {confirm.undo === 'final' && <div class="cts-confirm-effect">Final: cannot be undone.</div>}
      <div class="cts-armed-btns" ref={first}>
        {children ?? (
          <button class="primary" onClick={onYes}>
            Yes
          </button>
        )}
        <button onClick={onClose}>No</button>
      </div>
    </div>
  );
}

function EndStrip({ view, send, onClose }: { view: StorytellerGameView; send: Send; onClose: () => void }) {
  const pr = view.pendingResult;
  const done = (f: () => void) => () => {
    onClose();
    f();
  };
  if (pr)
    return (
      <ArmedStrip confirm={{ ask: `Game end detected: ${pr.winner === 'good' ? 'Good' : 'Evil'} wins. ${pr.reason}`, audience: 'Everyone sees the result and every character.', undo: 'final' }} onClose={onClose}>
        <button class="primary" onClick={done(() => send({ type: 'confirm_result' }))}>
          End: {pr.winner === 'good' ? 'Good' : 'Evil'} wins
        </button>
        <button onClick={done(() => send({ type: 'override_result' }))} title="Rule otherwise: the game continues">
          Override (continue)
        </button>
      </ArmedStrip>
    );
  return (
    <ArmedStrip confirm={{ ask: 'End the game now? Who wins?', audience: 'Everyone sees the result and every character.', undo: 'final' }} onClose={onClose}>
      <button class="cts-good-btn" onClick={done(() => send({ type: 'declare_winner', winner: 'good', reason: 'Declared by the Storyteller.' }))}>
        Good wins
      </button>
      <button class="cts-evil-btn" onClick={done(() => send({ type: 'declare_winner', winner: 'evil', reason: 'Declared by the Storyteller.' }))}>
        Evil wins
      </button>
    </ArmedStrip>
  );
}

/** A big button that runs a stage cue's action (with its confirm when it has one). */
function CueButton({ view, send, cue, children, primary }: { view: StorytellerGameView; send: Send; cue: Cue; children: ComponentChildren; primary?: boolean }) {
  const a = cueAction(view, cue, send);
  if (!a) return null;
  const cls = `cts-big cts-wide${primary ? ' primary' : ''}`;
  if (a.blocked)
    return (
      <button class={cls} disabled title={a.blocked}>
        {children}
      </button>
    );
  return a.confirm ? (
    <ConfirmButton class={cls} ask={a.confirm.ask} audience={a.confirm.audience} effects={a.confirm.effects} undo={a.confirm.undo} onConfirm={a.run} title={a.hint}>
      {children}
    </ConfirmButton>
  ) : (
    <button class={cls} onClick={a.run} title={a.hint}>
      {children}
    </button>
  );
}

// ------------------------------------------------------------------------------- script view

export function ScriptView({ view, send, castOf, openTools }: { view: StorytellerGameView; send: Send; castOf: CastOf; openTools: OpenTools }) {
  const p = view.phase;
  return (
    <div class="cts-script">
      {view.pendingResult && view.phase !== 'finished' && <PendingResult view={view} send={send} />}
      {p === 'setup' && <SetupScript view={view} send={send} castOf={castOf} openTools={openTools} />}
      {p === 'bedtime' && <BedtimeScript view={view} send={send} castOf={castOf} />}
      {isNight(p) && <TonightsVisits view={view} send={send} castOf={castOf} openTools={openTools} />}
      {p === 'dawn' && <DawnScript view={view} send={send} castOf={castOf} openTools={openTools} />}
      {p === 'day' && <DayScript view={view} send={send} castOf={castOf} openTools={openTools} />}
      {p === 'finished' && (
        <p class="cts-script-note">
          {view.result ? `${view.result.winner === 'good' ? 'Good' : 'Evil'} wins — ${view.result.reason}` : 'Game over.'} The result is final and recorded. Start a rematch from the
          lobby.
        </p>
      )}
    </div>
  );
}

function PendingResult({ view, send }: { view: StorytellerGameView; send: Send }) {
  const pr = view.pendingResult!;
  return (
    <div class="cts-controls cts-pending" role="alert">
      <span>
        <b>Game end detected:</b> {pr.winner === 'good' ? 'Good' : 'Evil'} wins — {pr.reason} Players have not been told yet.
      </span>
      <ConfirmButton class="primary" ask={`End the game: ${pr.winner === 'good' ? 'Good' : 'Evil'} wins?`} audience="Everyone sees the result and every character." undo="final" onConfirm={() => send({ type: 'confirm_result' })}>
        Confirm game end
      </ConfirmButton>
      <button onClick={() => send({ type: 'override_result' })} title="Rule otherwise: the game continues">
        Override (continue)
      </button>
    </div>
  );
}

function Portrait({ seat, view, castOf, size = 32 }: { seat: number; view: StorytellerGameView; castOf: CastOf; size?: number }) {
  const id = castOf(seat);
  const p = view.players.find((x) => x.seat === seat);
  const ghost = p && !p.alive ? (p.ghostVoteAvailable ? true : 'spent') : undefined;
  return id ? <CastPortrait id={id} size={size} crop="bust" ghost={ghost} class="cts-face" /> : <span class="cts-face cts-face-none" style={{ width: `${size}px`, height: `${size}px` }} aria-hidden="true" />;
}

// ---- setup

function SetupScript({ view, send, castOf, openTools }: { view: StorytellerGameView; send: Send; castOf: CastOf; openTools: OpenTools }) {
  return (
    <section class="cts-sec-block" aria-label="Setup">
      <h3 class="cts-script-h">{view.charactersAssigned ? 'The cast is dealt' : 'Deal the characters'}</h3>
      {/* Travellers first: every deal skips their seats */}
      <TravellerSetup view={view} send={send} />
      {/* (v2.2) Random · Storyline · Pick characters · By hand (deal.tsx) */}
      <DealChooser view={view} send={send} openHand={() => openTools('setup')} />
      {view.charactersAssigned && (
        <>
          <p class="muted cts-script-note">
            {dealSummary(view) && <>{dealSummary(view)} · </>}Bluffs: {view.demonBluffs.map(charName).join(', ') || '—'} ·{' '}
            <button class="cts-link" onClick={() => openTools('setup')} title="Change single seats: Load current Grimoire → edit → Assign">
              tweak seats…
            </button>
          </p>
          <CueButton view={view} send={send} cue="bedtime" primary>
            ♫ Ring the bell → first night
          </CueButton>
          <p class="muted cts-script-note">Players walk home; the first night falls when everyone is in (or jump with the cues above).</p>
        </>
      )}
      <SeatGrid view={view} castOf={castOf} openTools={openTools} />
    </section>
  );
}

// ---- bedtime

function BedtimeScript({ view, send, castOf }: { view: StorytellerGameView; send: Send; castOf: CastOf }) {
  const out = stragglers(view);
  return (
    <section class="cts-sec-block" aria-label="Bedtime">
      <h3 class="cts-script-h">{out.length ? `${out.length} still out` : 'Everyone is home'}</h3>
      <BedtimeTimer view={view} send={send} />
      {out.length > 0 && (
        <>
          <ul class="cts-mini-seats">
            {out.map((s) => (
              <li key={s}>
                <Portrait seat={s} view={view} castOf={castOf} size={24} />
                {name(view, s)}
              </li>
            ))}
          </ul>
          <div class="cts-bigrow">
            <button class="cts-big" onClick={() => send({ type: 'walk_to', who: out, to: { kind: 'home' } })} title="They walk home at normal speed">
              Walk them home
            </button>
            <ConfirmButton class="cts-big" ask="Teleport them home now?" audience={EVERYONE} onConfirm={() => send({ type: 'teleport', who: out, to: { kind: 'home' } })}>
              Put them to bed now
            </ConfirmButton>
          </div>
        </>
      )}
      <CueButton view={view} send={send} cue="night" primary>
        ☾ Night falls{view.bedtimeFirstNight ? ' (first night)' : ''}
      </CueButton>
    </section>
  );
}

// ---- night: tonight's visits

function TonightsVisits({ view, send, castOf, openTools }: { view: StorytellerGameView; send: Send; castOf: CastOf; openTools: OpenTools }) {
  // Info told this night (sending linked info completes info-only steps; others then need Done).
  const [told, setTold] = useState<string[]>([]);
  const visits = visitSteps(view);
  const group = view.nightQueue.filter((s) => s.character === 'minion_info' || s.character === 'demon_info');
  const done = visits.filter(FINISHED).length;
  const next = nextVisit(view);
  const hereStep = visits.find((s) => s.seat === view.visitingSeat && !FINISHED(s)) ?? null;
  const focus = hereStep ?? next;
  const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  // Keep the current visit in view as the night moves on.
  useEffect(() => {
    if (!focus) return;
    rowRefs.current.get(focus.id)?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }, [focus?.id]);
  const inside = view.visitingSeat !== null;
  return (
    <section class="cts-sec-block" aria-label="Tonight's visits">
      <div class="cts-visits-head">
        <h3 class="cts-script-h">
          Tonight’s visits <span class="muted">· {done}/{visits.length} done</span>
        </h3>
        <span class="cts-spacer" />
        {inside && (
          <button class="cts-link" onClick={() => toSquare(send)} title="Leave the house: back to the square">
            ⌂ back to the square
          </button>
        )}
      </div>
      {next ? (
        <button
          class={`cts-big cts-wide cts-nextvisit${hereStep ? '' : ' primary'}`}
          onClick={() => goTo(send, next.seat!)}
          title={`Teleport into ${houseOf(next.seat!)?.name ?? 'their house'}${hereStep ? ' (this visit is not done yet)' : ''}`}
        >
          ▶ Next visit: {name(view, next.seat!)} · {roleName(next)}
          <small>{houseOf(next.seat!)?.name ?? ''}</small>
        </button>
      ) : (
        visits.length > 0 &&
        (visits.some((s) => !FINISHED(s)) ? (
          <p class="cts-script-note">{visits.filter((s) => !FINISHED(s)).length === 1 ? 'One visit is still open — finish it, then the night is done.' : `${visits.filter((s) => !FINISHED(s)).length} visits are still open.`}</p>
        ) : (
          <p class="cts-script-note cts-ok">✓ Every visit is done.</p>
        ))
      )}
      <TonightGlance view={view} />
      {!visits.length && <p class="muted cts-script-note">Nobody wakes tonight.</p>}
      {group.length > 0 && (
        <ul class="cts-novisit" aria-label="No visit needed">
          {group.map((g) => (
            <li key={g.id} class={FINISHED(g) ? 'done' : ''}>
              <span class="cts-novisit-t">
                <b>{g.character === 'minion_info' ? 'Minion info' : 'Demon info'}</b>{' '}
                <span class="muted">
                  · {evilNames(view, g.character === 'minion_info' ? 'minion' : 'demon') || 'nobody'} · no visit needed
                </span>
              </span>
              {FINISHED(g) ? (
                <span class="cts-ok">✓ given</span>
              ) : (
                <button class="primary" onClick={() => send({ type: 'resolve_step', stepId: g.id })} title={g.suggestion}>
                  Give info
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <ol class="cts-visits">
        {visits.map((s, i) => (
          <VisitRow
            key={s.id}
            n={i + 1}
            step={s}
            view={view}
            send={send}
            castOf={castOf}
            here={s.seat === view.visitingSeat}
            isNext={!hereStep && s.id === next?.id}
            told={told.includes(s.id)}
            onTold={() => setTold((t) => [...t, s.id])}
            openTools={openTools}
            rowRef={(el) => {
              if (el) rowRefs.current.set(s.id, el);
              else rowRefs.current.delete(s.id);
            }}
          />
        ))}
      </ol>
      {!next && (
        <CueButton view={view} send={send} cue="dawn" primary>
          ☀ Dawn: review the night
        </CueButton>
      )}
    </section>
  );
}

function VisitRow(props: {
  n: number;
  step: NightStepView;
  view: StorytellerGameView;
  send: Send;
  castOf: CastOf;
  here: boolean;
  isNext: boolean;
  told: boolean;
  onTold: () => void;
  openTools: OpenTools;
  rowRef: (el: HTMLLIElement | null) => void;
}) {
  const { step, view, send, castOf, here, isNext, told } = props;
  const seat = step.seat!;
  const g: GrimoireEntry | undefined = view.grimoire.find((x) => x.seat === seat);
  const house = houseOf(seat);
  const fin = FINISHED(step);
  const open = here && !fin;
  const [infoText, setInfoText] = useState(step.suggestedInfo?.text ?? '');
  // Which suggestion the text box started from: the truth, or (drunk / poisoned) the false one.
  const [useFalse, setUseFalse] = useState(false);
  // The players / characters / number the info points at: the engine's suggestion, the Storyteller's to change.
  const [attach, setAttach] = useState<InfoAttachments>(() => attachmentsOf(step.suggestedInfo));
  const sug = step.suggestedInfo?.text ?? '';
  useEffect(() => {
    setInfoText(sug);
    setUseFalse(false);
    setAttach(attachmentsOf(step.suggestedInfo));
  }, [sug]);
  const base = useFalse && step.falseInfo ? step.falseInfo : step.suggestedInfo;
  const editInfo = (next: InfoDraft) => {
    setInfoText(next.text);
    setAttach(attachmentsOf(next));
  };
  const [target, setTarget] = useState<number | ''>('');
  // Choices the player could make themselves (the server refuses e.g. a Monk protecting themself).
  const targetOptions = view.players.filter(
    (p) =>
      (step.prompt?.allowSelf !== false || p.seat !== seat) &&
      (step.prompt?.allowDead !== false || view.grimoire.find((x) => x.seat === p.seat)?.alive !== false),
  );
  const needsTarget = TARGET_STEPS.includes(step.character) && g?.character !== 'drunk';
  const hasTarget = target !== '' || (step.response?.seats?.length ?? 0) > 0;
  const role = roleName(step);
  const cls = ['cts-visit', step.status, here ? 'here' : '', isNext ? 'nextup' : '', fin ? 'fin' : ''].join(' ');
  const what = step.suggestedInfo ? `Tell them: ${step.suggestedInfo.text}` : step.prompt ? `Ask: ${step.prompt.title}` : step.suggestion ?? 'Wake them; nothing to tell.';
  const answer = step.response
    ? [step.response.seats?.map((s) => name(view, s)).join(', '), step.response.character && charName(step.response.character), step.response.yes !== undefined && (step.response.yes ? 'yes' : 'no')]
        .filter(Boolean)
        .join(' · ')
    : '';
  const resolve = () => send(target !== '' ? { type: 'resolve_step', stepId: step.id, seats: [target] } : { type: 'resolve_step', stepId: step.id });
  return (
    <li class={cls} ref={props.rowRef} aria-current={here ? 'location' : undefined}>
      <div class="cts-visit-main">
        <span class="cts-visit-n" aria-hidden="true">
          {fin ? '✓' : props.n}
        </span>
        <Portrait seat={seat} view={view} castOf={castOf} size={fin ? 24 : 36} />
        <div class="cts-visit-who">
          <div class="cts-visit-line">
            <b class="cts-visit-name">{name(view, seat)}</b>
            <span class={`cts-char cts-${g?.alignment ?? 'good'}`}>{role}</span>
            {g && g.character !== step.character && <span class="muted">(is the {charName(g.character)})</span>}
            {step.impaired && !fin && (
              <span class="cts-chip cts-impaired" title="Their ability does nothing tonight; you may give false info">
                {g?.poisoned ? 'poisoned' : 'drunk'}: false info OK
              </span>
            )}
          </div>
          <div class="cts-visit-house">
            ⌂ {house?.name ?? `Seat ${seat + 1}'s home`}
            {here && <span class="cts-here"> · 🕯 you are here</span>}
            {fin && step.status === 'skipped' && <span class="muted"> · skipped</span>}
          </div>
          {!fin && !open && <div class="cts-visit-what">{what}</div>}
        </div>
        {!fin && !here && (
          <button class={`cts-go${isNext ? ' primary' : ''}`} onClick={() => goTo(send, seat)} title={`Teleport into ${house?.name ?? 'their house'}`}>
            Go
          </button>
        )}
      </div>
      {open && (
        <div class="cts-visit-act">
          {step.suggestion && step.suggestion !== step.suggestedInfo?.text && <div class="cts-sugg">{step.suggestion}</div>}
          {step.notes?.slice(0, 3).map((n, i) => (
            <div class={`cts-note ${step.impaired && /poisoned|drunk/i.test(n) ? 'cts-warn' : ''}`} key={i}>
              {n}
            </div>
          ))}
          {step.prompt && (step.status === 'pending' || step.status === 'visiting') && (
            <button class="cts-big cts-wide primary" onClick={() => send({ type: 'prompt_player', seat, prompt: step.prompt! })} title={only(view.players, seat)}>
              Ask: {step.prompt.title}
            </button>
          )}
          {step.status === 'prompted' && (
            <div class="cts-row cts-wrap">
              <span class="cts-waiting">Waiting for {name(view, seat)} to answer…</span>
              <button class="cts-link" onClick={() => send({ type: 'prompt_player', seat, prompt: step.prompt! })} disabled={!step.prompt}>
                ask again
              </button>
            </div>
          )}
          {answer && <div class="cts-resp">Answer: {answer}</div>}
          {step.suggestedInfo && (
            <form
              class="cts-tell"
              onSubmit={(e) => {
                e.preventDefault();
                const text = infoText.trim();
                if (!text) return;
                send({ type: 'send_info', seat, info: { ...(base ?? step.suggestedInfo!), ...attach, text: text.slice(0, 500), stepId: step.id } });
                props.onTold();
              }}
            >
              <label class="cts-tell-l">
                Tell {name(view, seat)}
                <input class="cts-grow" value={infoText} maxLength={500} onInput={(e) => setInfoText((e.currentTarget as HTMLInputElement).value)} title="Edit before telling them" />
              </label>
              <button type="submit" class={told ? '' : 'primary'} disabled={!infoText.trim()}>
                {told ? 'Tell again' : 'Tell them'}
              </button>
              {step.falseInfo && (
                <span class="cts-falsepick" role="group" aria-label="Which info to tell">
                  <button type="button" class={useFalse ? '' : 'on'} aria-pressed={!useFalse} onClick={() => { setUseFalse(false); setInfoText(step.suggestedInfo?.text ?? ''); setAttach(attachmentsOf(step.suggestedInfo)); }} title="The engine's truthful info">
                    true info
                  </button>
                  <button type="button" class={useFalse ? 'on' : ''} aria-pressed={useFalse} onClick={() => { setUseFalse(true); setInfoText(step.falseInfo!.text); setAttach(attachmentsOf(step.falseInfo)); }} title="A plausible false answer (they are drunk or poisoned)">
                    false info
                  </button>
                </span>
              )}
              <InfoPicker view={view} draft={{ text: infoText, ...attach }} onChange={editInfo} />
            </form>
          )}
          {told && <div class="cts-ok cts-script-note">✓ told</div>}
          <div class="cts-row cts-wrap">
            {needsTarget && (
              <select value={target} title="Choose on their behalf" onChange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; setTarget(v === '' ? '' : Number(v)); }}>
                <option value="">{step.response?.seats?.length ? '(their answer)' : 'choose for them…'}</option>
                {targetOptions.map((p) => (
                  <option key={p.seat} value={p.seat}>
                    {p.seat + 1}. {p.name}
                  </option>
                ))}
              </select>
            )}
            <button
              class={`cts-done${(!step.suggestedInfo || told) && (!needsTarget || hasTarget) && step.status !== 'prompted' ? ' primary' : ''}`}
              disabled={needsTarget && !hasTarget}
              title={needsTarget && !hasTarget ? 'Wait for their answer or choose for them' : 'Mark this visit done'}
              onClick={resolve}
            >
              ✓ Done
            </button>
            <button onClick={() => send({ type: 'skip_step', stepId: step.id })} title="Skip this step">
              Skip
            </button>
            <button class="cts-link" onClick={() => props.openTools('night')} title="Star-pass, Mayor bounce, custom info and prompts">
              more…
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * Tonight at a glance: who is poisoned / drunk / protected, the Fortune Teller's red herring and who
 * dies at dawn — the things a Storyteller otherwise keeps in their head. Only lines that apply.
 */
export function TonightGlance({ view }: { view: StorytellerGameView }) {
  const g = view.grimoire;
  const who = (f: (e: GrimoireEntry) => boolean) => g.filter(f).map((e) => e.name);
  const ft = g.some((e) => e.alive && e.character === 'fortune_teller');
  const rows = [
    { k: 'poisoned', icon: '🧪', label: 'poisoned', who: who((e) => e.alive && e.poisoned), tone: 'warn' },
    { k: 'drunk', icon: '🍺', label: 'drunk', who: who((e) => e.alive && (e.drunk || e.character === 'drunk')), tone: 'warn' },
    { k: 'protected', icon: '🛡', label: 'protected', who: who((e) => e.alive && e.protectedTonight), tone: '' },
    { k: 'herring', icon: '🐟', label: 'red herring', who: ft ? who((e) => !!e.isRedHerring) : [], tone: '' },
    { k: 'dies', icon: '⚰', label: 'dies at dawn', who: (view.pendingDeaths ?? []).map((s) => name(view, s)), tone: 'bad' },
  ].filter((r) => r.who.length);
  if (!rows.length) return null;
  return (
    <ul class="cts-glance" aria-label="Tonight at a glance">
      {rows.map((r) => (
        <li key={r.k} class={`cts-glance-${r.k} ${r.tone}`} data-glance={r.k}>
          <span aria-hidden="true">{r.icon}</span> <span class="muted">{r.label}:</span> {list(r.who)}
        </li>
      ))}
    </ul>
  );
}

// ---- dawn

function DawnScript({ view, send, castOf, openTools }: { view: StorytellerGameView; send: Send; castOf: CastOf; openTools: OpenTools }) {
  const deaths = view.pendingDeaths ?? [];
  const left = visitsLeftEffects(view);
  return (
    <section class="cts-sec-block" aria-label="Dawn">
      <h3 class="cts-script-h">{deaths.length ? 'Died in the night' : 'Nobody died tonight'}</h3>
      {deaths.length > 0 && (
        <ul class="cts-mini-seats">
          {deaths.map((s) => (
            <li key={s}>
              <Portrait seat={s} view={view} castOf={castOf} size={28} />
              {name(view, s)}
            </li>
          ))}
        </ul>
      )}
      {left.map((t) => (
        <div class="cts-note cts-warn" key={t}>
          ⚠ {t}
        </div>
      ))}
      {left.length > 0 && (
        <button class="cts-link cts-script-note" onClick={() => openTools('night')}>
          open the night order
        </button>
      )}
      <p class="muted cts-script-note">Nothing is announced until you start the day.</p>
      <CueButton view={view} send={send} cue="day" primary>
        ☼ Start the day{deaths.length ? ` (${deaths.length} death${deaths.length > 1 ? 's' : ''} announced)` : ''}
      </CueButton>
    </section>
  );
}

// ---- day

function DayScript({ view, send, castOf, openTools }: { view: StorytellerGameView; send: Send; castOf: CastOf; openTools: OpenTools }) {
  const d = view.day;
  if (!d) return null;
  const voting = d.nominations.find((n) => n.status === 'voting');
  const pending = d.nominations.filter((n) => n.status === 'pending');
  const past = d.nominations.filter((n) => n.status === 'tallied');
  const block = d.executedSeat === null ? d.onTheBlock : null;
  const exec = (seat: number | null) => send(voting ? { type: 'force_execute', seat } : { type: 'execute', seat });
  return (
    <section class="cts-sec-block" aria-label="Day">
      <div class="cts-bigrow cts-two">
        <button class={`cts-big${view.gathering ? ' on' : ''}`} aria-pressed={!!view.gathering} onClick={() => send({ type: 'gather', on: !view.gathering })}>
          {view.gathering ? '◎ Circle gathered (dissolve)' : '◎ Gather the circle'}
        </button>
        <button
          class={`cts-big${d.nominationsOpen ? ' on' : ''}`}
          aria-pressed={d.nominationsOpen}
          disabled={!d.nominationsOpen && d.executedSeat !== null}
          title={!d.nominationsOpen && d.executedSeat !== null ? 'Someone was executed today' : undefined}
          onClick={() => send({ type: 'set_nominations_open', open: !d.nominationsOpen })}
        >
          {d.nominationsOpen ? '✋ Nominations open (close)' : '✋ Open nominations'}
        </button>
      </div>
      <StClockControl view={view} send={send} stages={['discussion', 'nominations']} />
      <ExileControls view={view} send={send} />

      {voting && (
        <div class="cts-votenow" role="status">
          <div>
            Vote on <b>{name(view, voting.nomineeSeat)}</b> <span class="muted">(nominated by {name(view, voting.nominatorSeat)})</span>
          </div>
          <div class="cts-votecount">
            {voting.voteCount} / {voting.threshold}
            <span class="cts-votecount-t">
              {voting.currentVoterSeat !== null && <> · hand at {name(view, voting.currentVoterSeat)}</>}
              {(voting.handsRaised?.length ?? 0) > 0 && <> · ✋ {voting.handsRaised!.length} raised</>}
            </span>
          </div>
          <div class="cts-bigrow">
            <button class="cts-big primary" onClick={() => send({ type: 'close_vote', mode: 'tally' })} title="Lock every remaining hand and count">
              Close vote (tally)
            </button>
            <ClockButton nom={voting} send={send} big />
            <ConfirmButton class="cts-big" ask="Discard this vote?" audience={EVERYONE} undo="yes" onConfirm={() => send({ type: 'close_vote', mode: 'cancel' })}>
              Cancel vote
            </ConfirmButton>
          </div>
        </div>
      )}
      {pending.length > 0 && (
        <ul class="cts-noms">
          {pending.map((n) => (
            <li key={n.id}>
              <span class="cts-grow">
                {name(view, n.nominatorSeat)} → <b>{name(view, n.nomineeSeat)}</b>
              </span>
              <button class="primary" onClick={() => send(voting ? { type: 'force_vote', nominationId: n.id } : { type: 'start_vote', nominationId: n.id })} title={voting ? 'Replaces the running vote' : undefined}>
                Start vote
              </button>
              <ConfirmButton ask="Cancel this nomination?" audience={EVERYONE} undo="yes" onConfirm={() => send({ type: 'cancel_nomination', nominationId: n.id })}>
                ✕
              </ConfirmButton>
            </li>
          ))}
        </ul>
      )}
      {past.length > 0 && (
        <ul class="cts-noms past">
          {past.map((n) => (
            <li key={n.id}>
              <span class="cts-grow">
                {name(view, n.nominatorSeat)} → {name(view, n.nomineeSeat)}: {n.voteCount} vote{n.voteCount === 1 ? '' : 's'}
                {block?.seat === n.nomineeSeat && ' ⚖'}
              </span>
            </li>
          ))}
        </ul>
      )}
      {!voting && !pending.length && !past.length && (
        <p class="muted cts-script-note">
          No nominations yet.{' '}
          <button class="cts-link" onClick={() => openTools('day')}>
            create one by hand
          </button>
        </p>
      )}

      <div class="cts-blockrow">
        {d.executedSeat !== null ? (
          <span>
            Executed today: <b>{name(view, d.executedSeat)}</b>
          </span>
        ) : block ? (
          <>
            <span class="cts-grow">
              ⚖ <b>{name(view, block.seat)}</b> is on the block ({block.votes})
            </span>
            <ConfirmButton class="danger" ask={`Execute ${name(view, block.seat)} now?`} audience={EVERYONE} effects={deathEffects(view, block.seat, 'execute')} undo="yes" onConfirm={() => exec(block.seat)}>
              Execute {name(view, block.seat)}
            </ConfirmButton>
          </>
        ) : (
          <span class="cts-grow muted">Nobody is on the block.</span>
        )}
        {d.executedSeat === null && (
          <ConfirmButton ask="Declare no execution today?" audience={EVERYONE} effects={noExecutionEffects(view)} undo="yes" onConfirm={() => exec(null)}>
            No execution
          </ConfirmButton>
        )}
      </div>

      <CueButton view={view} send={send} cue="bedtime" primary>
        ♫ Ring the bedtime bell
      </CueButton>
      <SeatGrid view={view} castOf={castOf} openTools={openTools} />
    </section>
  );
}

// ---- seats at a glance

/** Tooltip words for a seat's markers (the icons are aria-hidden). */
function seatFlags(p: StorytellerGameView['players'][number], g: GrimoireEntry | undefined): string {
  const out: string[] = [];
  if (g?.poisoned) out.push('poisoned');
  if (g?.drunk) out.push('drunk');
  if (g?.protectedTonight) out.push('protected tonight');
  if (g?.isRedHerring) out.push('red herring');
  if (g?.abilityUsed) out.push('ability used');
  if (p.nominatedToday) out.push('has nominated today');
  if (p.wasNominatedToday) out.push('was nominated today');
  return out.length ? ` — ${out.join(', ')}` : '';
}

function SeatGrid({ view, castOf, openTools }: { view: StorytellerGameView; castOf: CastOf; openTools: OpenTools }) {
  const voting = view.day?.nominations.find((n) => n.status === 'voting');
  const block = view.day && view.day.executedSeat === null ? view.day.onTheBlock : null;
  return (
    <ul class="cts-seatgrid" aria-label="Seats">
      {[...view.players]
        .sort((a, b) => a.seat - b.seat)
        .map((p) => {
          const g = view.grimoire.find((x) => x.seat === p.seat);
          const state = p.alive ? 'alive' : p.ghostVoteAvailable ? 'ghost' : 'spent';
          const vote = voting?.votes[p.seat];
          return (
            <li key={p.seat}>
              <button
                class={`cts-seatcell ${state} ${p.connected ? '' : 'off'}`}
                onClick={() => openTools('stage', p.seat)}
                title={`${p.seat + 1}. ${p.name}${g ? ` — ${charName(g.character)} (${g.alignment})` : ''} — ${state === 'alive' ? 'alive' : state === 'ghost' ? 'dead, ghost vote left' : 'dead, ghost vote spent'}${seatFlags(p, g)}${p.connected ? '' : ' — offline'}. Click for actions.`}
              >
                <Portrait seat={p.seat} view={view} castOf={castOf} size={26} />
                <span class="cts-seatcell-t">
                  <span class="cts-seatcell-n">
                    {p.seat + 1}. {p.name}
                  </span>
                  <span class="cts-seatcell-s">
                    {state === 'alive' ? <span class="cts-ok">alive</span> : state === 'ghost' ? <span class="cts-ghost">👻 vote</span> : <span class="cts-dead">☠ spent</span>}
                    {g && <span class={`cts-${g.alignment}`}> · {charName(g.character)}</span>}
                    {g && g.character !== g.believedCharacter && <span class="muted"> (thinks {charName(g.believedCharacter)})</span>}
                  </span>
                </span>
                <span class="cts-seatcell-m" aria-hidden="true">
                  {g?.poisoned ? '🧪' : ''}
                  {g?.drunk ? '🍺' : ''}
                  {g?.protectedTonight && view.phase !== 'day' ? '🛡' : ''}
                  {block?.seat === p.seat ? '⚖' : ''}
                  {vote === true ? '✋' : ''}
                  {p.nominatedToday ? '☝' : ''}
                  {p.wasNominatedToday ? '🎯' : ''}
                </span>
              </button>
            </li>
          );
        })}
    </ul>
  );
}

// ------------------------------------------------------------------------------- info picker

function attachmentsOf(info: InfoSpecInput | undefined): InfoAttachments {
  if (!info) return {};
  return {
    ...(info.seats ? { seats: [...info.seats] } : {}),
    ...(info.characters ? { characters: [...info.characters] } : {}),
    ...(info.number !== undefined ? { number: info.number } : {}),
  };
}

/**
 * (st-control) The Storyteller picks what the player is shown: every player, character and number
 * the suggestion points at can be changed, and the sentence follows.
 */
function InfoPicker({ view, draft, onChange }: { view: StorytellerGameView; draft: InfoDraft; onChange: (d: InfoDraft) => void }) {
  const seats = draft.seats ?? [];
  const characters = draft.characters ?? [];
  if (!seats.length && !characters.length && draft.number === undefined) return null;
  const nameOf = (seat: number) => name(view, seat);
  return (
    <div class="cts-infopick" role="group" aria-label="What they are shown">
      <span class="muted">Show</span>
      {seats.map((seat, i) => (
        <select key={`s${i}`} value={String(seat)} title="Which player they are shown" onChange={(e) => onChange(swapSeat(draft, i, Number((e.currentTarget as HTMLSelectElement).value), nameOf))}>
          {view.players.map((p) => (
            <option key={p.seat} value={p.seat}>
              {p.seat + 1}. {p.name}
            </option>
          ))}
        </select>
      ))}
      {characters.map((c, i) => (
        <CharacterSelect key={`c${i}`} value={c} onChange={(x) => x && onChange(swapCharacter(draft, i, x))} />
      ))}
      {draft.number !== undefined && (
        <input class="cts-infopick-n" type="number" min={0} max={99} value={draft.number} title="The number they are told" onInput={(e) => { const n = Number((e.currentTarget as HTMLInputElement).value); if (Number.isInteger(n) && n >= 0 && n <= 99) onChange(swapNumber(draft, n)); }} />
      )}
    </div>
  );
}
