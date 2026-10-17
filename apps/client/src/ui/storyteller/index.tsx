// OWNED BY rules-storyteller. Storyteller overlay: setup (random/manual, drunk, red herring,
// bluffs), Grimoire with status toggles & reminders, night-order checklist with engine
// suggestions, visits (fast travel), prompt/info composer, phase/nomination/execution controls,
// kill/revive, travel speed, announcements, declare winner, undo, alerts and log.
// (gameplay) The Stage bar + Stage tab (stage.tsx): the game as malleable props — circle, votes,
// force phase, walk / teleport / freeze, doors, bedtime timer. The engine only advises.
// Rendered only for the seated Storyteller (the server sends a StorytellerGameView only to them).
// (st-ui) Default = the simple "script" panel (script.tsx): phase stage cues + only what this moment
// needs (tonight's visits / the day's few buttons). Everything above stays reachable, unchanged,
// behind the "Grimoire & tools" toggle (remembered per viewer: localStorage ct.st.tools = '1').
import { useEffect, useMemo, useState } from 'preact/hooks';
import { PLAYABLE_IDS } from '@ct/assets';
import {
  CHARACTER_INFO,
  type CharacterType,
  PROMPT_KINDS,
  type AccountView,
  type C2SPayload,
  type CharacterId,
  type GrimoireEntry,
  type InfoSpecInput,
  type NightStepView,
  type PromptKind,
  type PromptSpecInput,
  type StorytellerGameView,
} from '@ct/protocol';
import type { RoomConnection } from '../../net/room';
import { useStore } from '../../net/store';
import { charName, CharacterSelect, Countdown, friendlyError, phaseTitle, ScriptCtx, scriptPool, seatLabel, VoteClock } from '../hud/shared';
import { ConfirmButton, deathEffects, EVERYONE, noExecutionEffects, only, PickBanner, StageBar, StageTab, StatusBadges, Toggle } from './stage';
import { PhaseStageBar, ScriptView, type CastOf, type OpenTools } from './script';
import { reducedMotion } from '../../game/fx/motion';
import './storyteller.css';

type Cmd = C2SPayload<'st:command'>;
type Send = (c: Cmd) => void;
type Tab = 'setup' | 'stage' | 'grimoire' | 'night' | 'day' | 'tools' | 'log';

interface ComposerState {
  seat: number | null;
  mode: 'info' | 'prompt';
  prompt: PromptSpecInput;
  info: InfoSpecInput;
}

const EMPTY_PROMPT: PromptSpecInput = { kind: 'choose_players', title: 'Choose a player', minTargets: 1, maxTargets: 1, allowSelf: true, allowDead: true };
const EMPTY_INFO: InfoSpecInput = { text: '' };

function withoutStep(info: InfoSpecInput): InfoSpecInput {
  const { stepId: _drop, ...rest } = info;
  return rest;
}

export function StorytellerPanel({ conn }: { conn: RoomConnection; account: AccountView }) {
  const view = useStore(conn.gameView);
  if (!view || view.kind !== 'storyteller') return null;
  return <StPanel view={view} conn={conn} />;
}

/** Per-viewer panel layout, remembered in localStorage (may be unavailable: private mode etc.). */
type Dock = 'left' | 'right';
const LS_COLLAPSED = 'ct.st.collapsed';
const LS_DOCK = 'ct.st.dock';
const LS_TOOLS = 'ct.st.tools';
function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function lsSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: the choice lasts for this page only */
  }
}

function StPanel({ view, conn }: { view: StorytellerGameView; conn: RoomConnection }) {
  const [open, setOpenState] = useState(() => lsGet(LS_COLLAPSED) !== '1');
  const [dock, setDockState] = useState<Dock>(() => (lsGet(LS_DOCK) === 'right' ? 'right' : 'left'));
  const setOpen = (v: boolean) => {
    setOpenState(v);
    lsSet(LS_COLLAPSED, v ? '0' : '1');
  };
  const toggleDock = () => {
    const next: Dock = dock === 'left' ? 'right' : 'left';
    setDockState(next);
    lsSet(LS_DOCK, next);
  };
  const [tab, setTab] = useState<Tab>(view.phase === 'setup' ? 'setup' : 'grimoire');
  // Simple script (default) or the full Grimoire & tools.
  const [tools, setToolsState] = useState(() => lsGet(LS_TOOLS) === '1');
  const setTools = (v: boolean) => {
    setToolsState(v);
    lsSet(LS_TOOLS, v ? '1' : '0');
  };
  // Player whose card the Stage tab opens with (a seat clicked in the script's seat list).
  const [stageSeat, setStageSeat] = useState<{ seat: number | null; n: number }>({ seat: null, n: 0 });
  const lobby = useStore(conn.lobbyView);
  const castOf: CastOf = useMemo(() => {
    const byPid = new Map((lobby?.members ?? []).map((m) => [m.pid, m.cosmetics?.preset ?? null]));
    const pidBySeat = new Map(view.players.map((p) => [p.seat, p.pid]));
    return (seat: number) => {
      const id = byPid.get(pidBySeat.get(seat) ?? '') ?? null;
      return id && PLAYABLE_IDS.has(id) ? id : null;
    };
  }, [lobby?.members, view.players]);
  const openTools: OpenTools = (t, seat) => {
    setTab(t);
    if (t === 'stage') setStageSeat((x) => ({ seat: seat ?? null, n: x.n + 1 }));
    setTools(true);
  };
  const [error, setError] = useState<string | null>(null);
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);
  const [composer, setComposer] = useState<ComposerState>({ seat: null, mode: 'info', prompt: EMPTY_PROMPT, info: EMPTY_INFO });
  const send: Send = (c) => {
    setError(null);
    conn.send('st:command', c);
  };
  useEffect(
    () =>
      conn.events.on('error', (e) => {
        if (e.for === 'st:command') setError(friendlyError(e.message, true));
      }),
    [conn],
  );
  // Follow the phase: setup -> grimoire; night -> checklist; day -> day controls.
  useEffect(() => {
    if (view.phase === 'setup') setTab('setup');
    else if (view.phase === 'first_night' || view.phase === 'night') setTab('night');
    else if (view.phase === 'day') setTab('day');
    else if (view.phase === 'bedtime') setTab('stage'); // who is home yet (incl. the first bedtime)
  }, [view.phase]);
  // Gathering the circle: the stage diagram is the useful view.
  useEffect(() => {
    if (view.gathering) setTab('stage');
  }, [view.gathering]);

  const openComposer = (patch: Partial<ComposerState>) => {
    // A night-step link belongs to one seat; the server rejects send_info/prompt for another seat.
    setComposer((c) => ({ ...c, ...patch, info: patch.info ?? (patch.seat !== undefined && patch.seat !== c.seat ? withoutStep(c.info) : c.info) }));
    setTab('tools');
    setTools(true);
  };
  const alerts = unseenAlerts(view.alerts, dismissedAlerts);

  if (!open)
    return (
      <div class={`cts-slim dock-${dock}`} role="region" aria-label="Storyteller (collapsed)">
        <div class="cts-slim-row">
          <button class="cts-slim-open" onClick={() => setOpen(true)} title="Open the Grimoire">
            ☾{alerts.length > 0 && <span class="cts-badge">{alerts.length}</span>}
          </button>
          <span class="cts-now-phase">{phaseTitle(view.phase, view.dayNumber)}</span>
          {view.phaseEndsAt !== null && <Countdown endsAt={view.phaseEndsAt} />}
          <NextButton view={view} send={send} goTab={(t) => { setTab(t); setOpen(true); }} />
          <button class="cts-icon" onClick={toggleDock} title={`Dock on the ${dock === 'left' ? 'right' : 'left'}`}>
            ⇆
          </button>
        </div>
        {error && (
          <div class="cts-error" role="alert">
            {error}
            <button class="cts-icon" onClick={() => setError(null)}>
              ✕
            </button>
          </div>
        )}
        <PickBanner />
      </div>
    );

  const offline = view.players.filter((x) => !x.connected);
  return (
    // Every character picker inside the panel lists this lobby's script first (ScriptCtx).
    <ScriptCtx.Provider value={lobby?.lobby.script}>
    <aside class={`cts dock-${dock} ${tools ? 'cts-mode-tools' : 'cts-mode-script'}${reducedMotion() ? ' cts-still' : ''}`} aria-label="Storyteller">
      <header class="cts-head">
        <span class="cts-title">Storyteller</span>
        <span class="cts-head-phase">{phaseTitle(view.phase, view.dayNumber)}</span>
        {view.phaseEndsAt !== null && <Countdown endsAt={view.phaseEndsAt} />}
        {view.timerHeld ? <span class="cts-chip">held</span> : view.timerPaused && <span class="cts-chip">paused (you were away)</span>}
        <span class="cts-spacer" />
        <button class="cts-undo" disabled={!view.canUndo} onClick={() => send({ type: 'undo_last' })} title={view.canUndo ? 'Undo the last game action' : 'Nothing to undo'}>
          ↶ Undo
        </button>
        <button class="cts-icon" onClick={toggleDock} title={`Dock on the ${dock === 'left' ? 'right' : 'left'}`} aria-label="Move the panel to the other side">
          ⇆
        </button>
        <button class="cts-icon" onClick={() => setOpen(false)} title="Collapse to a slim bar" aria-label="Collapse the panel">
          ▁
        </button>
      </header>
      <PhaseStageBar view={view} send={send} />
      {tools && view.visitingSeat !== null && (
        <div class="cts-visitbar">
          <span class="cts-chip visit">
            🕯 In the home of {seatLabel(view.players, view.visitingSeat)}{' '}
            <button class="cts-link" onClick={() => send({ type: 'leave_home' })} title="Step back outside">
              leave
            </button>
          </span>
        </div>
      )}
      {offline.length > 0 && <div class="cts-offline">offline: {offline.map((x) => x.name).join(', ')}</div>}
      <PickBanner />
      {error && (
        <div class="cts-error" role="alert">
          {error}
          <button class="cts-icon" onClick={() => setError(null)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
      {alerts.length > 0 && (
        <div class="cts-alerts">
          {alerts.slice(-3).map((a, i) => (
            <div key={`${view.alerts.length - alerts.length}-${i}`}>⚠ {a}</div>
          ))}
          <button class="cts-link" onClick={() => setDismissedAlerts([...view.alerts])}>
            dismiss
          </button>
        </div>
      )}
      {tools ? (
        <div class="cts-tools">
          <NowStrip view={view} send={send} goTab={setTab} />
          <PhaseControls view={view} send={send} />
          <StageBar view={view} send={send} />
          <nav class="cts-tabs">
            {(['setup', 'stage', 'grimoire', 'night', 'day', 'tools', 'log'] as Tab[])
              .filter((t) => t !== 'setup' || view.phase === 'setup')
              .map((t) => (
                <button key={t} class={tab === t || (t === 'stage' && tab === 'setup' && view.phase !== 'setup') ? 'on' : ''} onClick={() => setTab(t)}>
                  {t === 'night' ? 'Night order' : t[0]!.toUpperCase() + t.slice(1)}
                </button>
              ))}
          </nav>
          <div class="cts-body">
            {tab === 'setup' && view.phase === 'setup' && <SetupTab view={view} send={send} />}
            {(tab === 'stage' || (tab === 'setup' && view.phase !== 'setup')) && (
              <StageTab key={stageSeat.n} initialSelected={stageSeat.seat} view={view} send={send} openComposer={openComposer} />
            )}
            {tab === 'grimoire' && <GrimoireTab view={view} send={send} openComposer={openComposer} />}
            {tab === 'night' && <NightTab view={view} send={send} openComposer={openComposer} />}
            {tab === 'day' && <DayTab view={view} send={send} />}
            {tab === 'tools' && <ToolsTab view={view} send={send} composer={composer} setComposer={setComposer} />}
            {tab === 'log' && <LogTab view={view} />}
          </div>
        </div>
      ) : (
        <div class="cts-body">
          <ScriptView view={view} send={send} castOf={castOf} openTools={openTools} />
        </div>
      )}
      <button class={`cts-toolsbtn ${tools ? 'on' : ''}`} aria-expanded={tools} onClick={() => setTools(!tools)} title={tools ? 'Back to the simple script' : 'The full Grimoire, statuses, tools, log, stage map, doors…'}>
        {tools ? '◂ Back to the script' : '☰ Grimoire & tools'}
      </button>
    </aside>
    </ScriptCtx.Provider>
  );
}

/**
 * Alerts not yet dismissed. The server keeps a rolling window of the last 20 alerts (and undo can
 * shrink it), so match the dismissed snapshot's tail against the current list's head.
 */
function unseenAlerts(all: string[], seen: string[]): string[] {
  if (all.length <= seen.length && all.every((a, i) => a === seen[i])) return [];
  for (let k = Math.min(all.length, seen.length); k > 0; k--) {
    if (seen.slice(seen.length - k).every((a, i) => a === all[i])) return all.slice(k);
  }
  return all;
}

// --------------------------------------------------------------------------------- now strip

interface NextAction {
  label: string;
  run: () => void;
  confirm?: { ask: string; audience?: string; effects?: string[]; undo?: 'yes' | 'final' };
  hint?: string;
}

const UNFINISHED: readonly string[] = ['pending', 'visiting', 'prompted', 'answered'];

/** The single most likely next Storyteller action (advisory; every other control stays available). */
function nextAction(view: StorytellerGameView, send: Send, goTab: (t: Tab) => void): NextAction | null {
  const p = view.phase;
  const name = (seat: number) => view.players.find((x) => x.seat === seat)?.name ?? `Seat ${seat + 1}`;
  const pr = view.phase === 'finished' ? null : view.pendingResult;
  if (pr)
    return {
      label: `Confirm result: ${pr.winner === 'good' ? 'Good' : 'Evil'} wins`,
      run: () => send({ type: 'confirm_result' }),
      confirm: { ask: 'End the game now?', audience: 'Everyone sees the result and every character.', undo: 'final' },
      hint: 'or Override below to continue the game',
    };
  if (p === 'setup') {
    if (!view.charactersAssigned) return { label: 'Random setup', run: () => send({ type: 'random_setup' }), hint: 'or assign characters by hand in Setup' };
    return { label: 'Begin first night (ring the bell)', run: () => send({ type: 'advance_phase', to: 'bedtime' }), hint: 'players walk home; the first night falls when all are in' };
  }
  if (p === 'first_night' || p === 'night') {
    const step = view.nightQueue.find((x) => UNFINISHED.includes(x.status));
    if (!step) return { label: 'Dawn: review deaths', run: () => send({ type: 'advance_phase', to: 'dawn' }), hint: 'nothing is announced until you start the day' };
    const title = stepTitle(step);
    if (step.seat === null) return { label: `Resolve ${title}`, run: () => send({ type: 'resolve_step', stepId: step.id }) };
    const seat = step.seat;
    const who = name(seat);
    if (view.visitingSeat !== seat)
      return { label: `Visit ${who} (${title})`, run: () => send({ type: 'visit_home', seat }), hint: 'next in night order' };
    if (step.prompt && (step.status === 'pending' || step.status === 'visiting')) {
      const prompt = step.prompt;
      return { label: `Ask ${who}: ${prompt.title}`, run: () => send({ type: 'prompt_player', seat, prompt }), hint: `only ${who} sees the prompt` };
    }
    if (step.status === 'prompted') return { label: `Waiting for ${who}… (open night order)`, run: () => goTab('night'), hint: 'you can choose on their behalf there' };
    if (step.suggestedInfo) {
      const info = step.suggestedInfo;
      return {
        label: `Tell ${who}: ${info.text.length > 48 ? `${info.text.slice(0, 47)}…` : info.text}`,
        run: () => send({ type: 'send_info', seat, info: { ...info, stepId: step.id } }),
        confirm: { ask: `Send this to ${who}?`, audience: only(view.players, seat), effects: step.impaired ? ['They are impaired: you may change it to false info (Night order).'] : undefined },
      };
    }
    const g = view.grimoire.find((x) => x.seat === seat);
    if (TARGET_STEPS.includes(step.character) && g?.character !== 'drunk' && !step.response?.seats?.length)
      return { label: `Pick ${who}'s target (night order)`, run: () => goTab('night') };
    return { label: `Resolve ${title}`, run: () => send({ type: 'resolve_step', stepId: step.id }) };
  }
  if (p === 'dawn') {
    const n = view.pendingDeaths?.length ?? 0;
    return {
      label: n ? `Start the day (${n} death${n > 1 ? 's' : ''} announced)` : 'Start the day (nobody died)',
      run: () => send({ type: 'advance_phase', to: 'day' }),
      confirm: n ? { ask: 'Announce the night and start the day?', audience: EVERYONE, effects: view.pendingDeaths!.map((s) => `${name(s)} dies.`), undo: 'yes' } : undefined,
    };
  }
  if (p === 'day') {
    const d = view.day;
    const voting = d?.nominations.find((n) => n.status === 'voting');
    if (voting) return { label: 'Close vote (tally)', run: () => send({ type: 'close_vote', mode: 'tally' }), hint: `${voting.voteCount}/${voting.threshold} on ${name(voting.nomineeSeat)}` };
    const pending = d?.nominations.filter((n) => n.status === 'pending') ?? [];
    const nom = pending[pending.length - 1];
    if (nom) return { label: `Start vote on ${name(nom.nomineeSeat)}`, run: () => send({ type: 'force_vote', nominationId: nom.id }), hint: `nominated by ${name(nom.nominatorSeat)}` };
    if (!view.gathering && !d?.nominations.length && !d?.nominationsOpen && d?.executedSeat === null)
      return { label: 'Gather the circle', run: () => send({ type: 'gather', on: true }), hint: 'when discussion winds down; players walk to their seats' };
    if (d && !d.nominationsOpen && d.executedSeat === null && !d.nominations.length)
      return { label: 'Open nominations', run: () => send({ type: 'set_nominations_open', open: true }), hint: view.gathering ? 'the circle is gathered' : 'or gather the circle first (Stage)' };
    const block = d && d.executedSeat === null ? d.onTheBlock : null;
    return {
      label: 'Ring bedtime bell',
      run: () => send({ type: 'advance_phase', to: 'bedtime' }),
      confirm: {
        ask: block ? `End the day? ${name(block.seat)} is executed.` : 'End the day with no execution?',
        audience: EVERYONE,
        effects: block ? deathEffects(view, block.seat, 'execute') : noExecutionEffects(view),
        undo: 'yes',
      },
    };
  }
  if (p === 'bedtime') {
    const out = (view.stage?.players ?? []).filter((x) => x.presence !== 'home');
    if (out.length)
      return {
        label: `Walk ${out.length} straggler${out.length > 1 ? 's' : ''} home`,
        run: () => send({ type: 'walk_to', who: out.map((x) => x.seat), to: { kind: 'home' } }),
        hint: out.slice(0, 4).map((x) => name(x.seat)).join(', ') + (out.length > 4 ? '…' : ''),
      };
    const to = view.bedtimeFirstNight ? 'first_night' : 'night';
    return { label: 'Everyone is home: night now', run: () => send({ type: 'force_phase', to }) };
  }
  return null;
}

/** "Now" strip: phase, what is pending, and the single most likely next action. */
function NowStrip({ view, send, goTab }: { view: StorytellerGameView; send: Send; goTab: (t: Tab) => void }) {
  const next = nextAction(view, send, goTab);
  const p = view.phase;
  const items: { text: string; tone?: string; tab?: Tab }[] = [];
  const stepsLeft = view.nightQueue.filter((x) => UNFINISHED.includes(x.status)).length;
  if ((p === 'first_night' || p === 'night' || p === 'dawn') && stepsLeft) items.push({ text: `${stepsLeft} night step${stepsLeft > 1 ? 's' : ''} left`, tab: 'night' });
  if (view.pendingResult) items.push({ text: 'game end to confirm', tone: 'bad' });
  if ((p === 'night' || p === 'first_night' || p === 'dawn') && view.pendingDeaths?.length)
    items.push({ text: `dies at dawn: ${view.pendingDeaths.map((s) => nameOfSeat(view, s)).join(', ')}`, tone: 'bad' });
  if (p === 'day' && view.day) {
    const voting = view.day.nominations.find((n) => n.status === 'voting');
    const pend = view.day.nominations.filter((n) => n.status === 'pending').length;
    if (voting) items.push({ text: `vote on ${nameOfSeat(view, voting.nomineeSeat)}: ${voting.voteCount}/${voting.threshold}`, tone: 'warn', tab: 'stage' });
    if (pend) items.push({ text: `${pend} nomination${pend > 1 ? 's' : ''} pending`, tone: 'warn', tab: 'day' });
    if (view.day.onTheBlock && view.day.executedSeat === null) items.push({ text: `⚖ ${nameOfSeat(view, view.day.onTheBlock.seat)} on the block`, tab: 'stage' });
    if (view.day.executedSeat !== null) items.push({ text: `executed: ${nameOfSeat(view, view.day.executedSeat)}` });
  }
  const stage = view.stage?.players ?? [];
  if (p === 'bedtime') {
    const out = stage.filter((x) => x.presence !== 'home');
    items.push(out.length ? { text: `${out.length} not home: ${out.map((x) => nameOfSeat(view, x.seat)).join(', ')}`, tone: 'warn', tab: 'stage' } : { text: 'everyone home', tone: 'ok' });
  }
  if (view.gathering && p === 'day') {
    const out = stage.filter((x) => x.presence !== 'seated');
    items.push(out.length ? { text: `${out.length} not seated: ${out.map((x) => nameOfSeat(view, x.seat)).join(', ')}`, tone: 'warn', tab: 'stage' } : { text: 'everyone seated', tone: 'ok' });
  }
  const frozen = stage.filter((x) => x.frozen).length;
  if (frozen) items.push({ text: `❄ ${frozen} frozen`, tab: 'stage' });
  const offline = view.players.filter((x) => !x.connected);
  if (offline.length) items.push({ text: `offline: ${offline.map((x) => x.name).join(', ')}`, tone: 'bad' });
  return (
    <div class="cts-now">
      <div class="cts-now-top">
        <span class="cts-now-phase">{phaseTitle(p, view.dayNumber)}</span>
        {view.phaseEndsAt !== null && <Countdown endsAt={view.phaseEndsAt} />}
        {view.timerHeld ? (
          <span class="cts-chip">Countdown held</span>
        ) : (
          view.timerPaused && <span class="cts-chip">paused (you were away)</span>
        )}
      </div>
      {items.length > 0 && (
        <div class="cts-now-items">
          {items.map((it) =>
            it.tab ? (
              <button key={it.text} class={`cts-now-item ${it.tone ?? ''}`} onClick={() => goTab(it.tab!)}>
                {it.text}
              </button>
            ) : (
              <span key={it.text} class={`cts-now-item ${it.tone ?? ''}`}>
                {it.text}
              </span>
            ),
          )}
        </div>
      )}
      {next && (
        <div class="cts-now-next">
          <NextActionButton next={next} />
          {next.hint && <small class="muted">{next.hint}</small>}
        </div>
      )}
    </div>
  );
}

function NextActionButton({ next, slim }: { next: NextAction; slim?: boolean }) {
  const cls = `cts-now-btn primary${slim ? ' slim' : ''}`;
  return next.confirm ? (
    <ConfirmButton class={cls} ask={next.confirm.ask} audience={next.confirm.audience} effects={next.confirm.effects} undo={next.confirm.undo} onConfirm={next.run} title={next.hint}>
      ▶ {next.label}
    </ConfirmButton>
  ) : (
    <button class={cls} onClick={next.run} title={next.hint}>
      ▶ {next.label}
    </button>
  );
}

/** The next-action button alone (collapsed panel). */
function NextButton({ view, send, goTab }: { view: StorytellerGameView; send: Send; goTab: (t: Tab) => void }) {
  const next = nextAction(view, send, goTab);
  return next ? <NextActionButton next={next} slim /> : null;
}

function nameOfSeat(view: StorytellerGameView, seat: number): string {
  return view.players.find((x) => x.seat === seat)?.name ?? `Seat ${seat + 1}`;
}

// ---------------------------------------------------------------------------- phase controls

function PhaseControls({ view, send }: { view: StorytellerGameView; send: Send }) {
  const p = view.phase;
  const pending = view.pendingDeaths ?? [];
  const voteRunning = p === 'day' && !!view.day?.nominations.some((n) => n.status === 'voting');
  const pr = view.phase === 'finished' ? null : view.pendingResult;
  if (pr)
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
        <span class="muted">Or undo (↶) the last action if it was a mistake.</span>
      </div>
    );
  const block = p === 'day' && view.day && view.day.executedSeat === null ? view.day.onTheBlock : null;
  return (
    <div class="cts-controls">
      {block && (
        <span class="cts-warn">
          {seatLabel(view.players, block.seat)} is on the block and will be executed when the day ends.
        </span>
      )}
      {p === 'setup' && (
        <button
          class="primary"
          disabled={!view.charactersAssigned}
          onClick={() => send({ type: 'advance_phase', to: 'bedtime' })}
          title="The bell rings: players walk home; the first night falls once everyone is in"
        >
          Begin first night (ring the bell)
        </button>
      )}
      {p === 'setup' && (
        <ConfirmButton
          disabled={!view.charactersAssigned}
          ask="Night now? Anyone not home is teleported to bed."
          audience={EVERYONE}
          undo="yes"
          onConfirm={() => send({ type: 'begin_first_night' })}
          title="Prop: skip the walk home"
        >
          Force night now
        </ConfirmButton>
      )}
      {(p === 'first_night' || p === 'night') && (
        <button class="primary" onClick={() => send({ type: 'advance_phase', to: 'dawn' })} title="Review the night; nothing is announced yet">
          Dawn: review deaths
        </button>
      )}
      {p === 'dawn' && (
        <button class="primary" onClick={() => send({ type: 'advance_phase', to: 'day' })}>
          Start the day{pending.length ? ` (${pending.length} death${pending.length > 1 ? 's' : ''} announced)` : ''}
        </button>
      )}
      {p === 'day' && (
        <button class="primary" onClick={() => send({ type: 'advance_phase', to: 'bedtime' })} title={voteRunning ? 'A vote is running: close it first (Stage)' : undefined}>
          Ring bedtime bell
        </button>
      )}
      {(p === 'day' || p === 'bedtime') && (
        <button onClick={() => send({ type: 'advance_phase', to: 'night' })} title={voteRunning ? 'A vote is running: close it first (Stage)' : undefined}>
          Night now
        </button>
      )}
      {voteRunning && <span class="muted">Vote in progress…</span>}
      {p === 'finished' && <span class="muted">Game over — the result is final and recorded. Start a rematch from the lobby.</span>}
    </div>
  );
}

// ------------------------------------------------------------------------------------- setup

function SetupTab({ view, send }: { view: StorytellerGameView; send: Send }) {
  const fromGrimoire = () => Object.fromEntries(view.players.map((p) => [p.seat, view.grimoire.find((g) => g.seat === p.seat)?.character ?? ''])) as Record<number, CharacterId | ''>;
  const [assign, setAssign] = useState<Record<number, CharacterId | ''>>(fromGrimoire);
  const [drunkBelieves, setDrunkBelieves] = useState<CharacterId | ''>('');
  const [redHerring, setRedHerring] = useState<number | ''>('');
  const [bluffs, setBluffs] = useState<(CharacterId | '')[]>(['', '', '']);
  const [nonstandard, setNonstandard] = useState(false);
  const chosen = Object.values(assign).filter((c): c is CharacterId => !!c);
  const counts: Record<CharacterType, number> = {
    townsfolk: 0,
    outsider: 0,
    minion: 0,
    demon: 0,
    traveller: 0,
    fabled: 0,
  };
  for (const c of chosen) counts[CHARACTER_INFO[c].type]++;
  const base = view.setupCounts;
  const viewHasBaron = view.grimoire.some((g) => g.character === 'baron');
  const formHasBaron = chosen.includes('baron');
  const want = base && {
    townsfolk: base.townsfolk + (viewHasBaron === formHasBaron ? 0 : formHasBaron ? -2 : 2),
    outsiders: base.outsiders + (viewHasBaron === formHasBaron ? 0 : formHasBaron ? 2 : -2),
    minions: base.minions,
    demons: base.demons,
  };
  const dupes = chosen.filter((c, i) => chosen.indexOf(c) !== i);
  const submit = () => {
    const assignments = view.players
      .map((p) => ({ seat: p.seat, character: assign[p.seat] }))
      .filter((a): a is { seat: number; character: CharacterId } => !!a.character);
    const cmd: Extract<Cmd, { type: 'assign_characters' }> = {
      type: 'assign_characters',
      assignments,
      demonBluffs: bluffs.filter((b): b is CharacterId => !!b),
      allowNonstandard: nonstandard,
    };
    if (drunkBelieves && chosen.includes('drunk') && !chosen.includes(drunkBelieves)) cmd.drunkBelievesSeatCharacter = drunkBelieves;
    const rh = redHerring === '' ? undefined : assign[redHerring];
    if (redHerring !== '' && rh && CHARACTER_INFO[rh].alignment === 'good') cmd.redHerringSeat = redHerring;
    send(cmd);
  };
  return (
    <div class="cts-setup">
      <div class="cts-row">
        <button class="primary" onClick={() => send({ type: 'random_setup' })}>
          Random setup
        </button>
        <button disabled={!view.charactersAssigned} onClick={() => setAssign(fromGrimoire())}>
          Load current Grimoire
        </button>
      </div>
      {want && (
        <p class="muted">
          Standard for {view.players.length}: {want.townsfolk} Townsfolk · {want.outsiders} Outsiders · {want.minions} Minions · 1 Demon. Chosen:{' '}
          <span class={counts.townsfolk === want.townsfolk && counts.outsider === want.outsiders && counts.minion === want.minions && counts.demon === 1 ? 'cts-ok' : 'cts-warn'}>
            {counts.townsfolk}/{counts.outsider}/{counts.minion}/{counts.demon}
          </span>
          {dupes.length > 0 && <span class="cts-warn"> duplicates: {[...new Set(dupes)].map(charName).join(', ')}</span>}
        </p>
      )}
      <table class="cts-table">
        <tbody>
          {view.players.map((p) => (
            <tr key={p.seat}>
              <td>{p.seat + 1}</td>
              <td>{p.name}</td>
              <td>
                <CharacterSelect value={assign[p.seat] ?? ''} allowEmpty onChange={(c) => setAssign((a) => ({ ...a, [p.seat]: c }))} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {chosen.includes('drunk') && (
        <label class="cts-field">
          Drunk believes they are
          <CharacterSelect
            value={drunkBelieves}
            allowEmpty
            onChange={setDrunkBelieves}
            only={scriptPool(lobbyScript).filter((c) => CHARACTER_INFO[c].type === 'townsfolk' && !chosen.includes(c))}
          />
          <small class="muted">(empty = random)</small>
        </label>
      )}
      <label class="cts-field">
        Fortune Teller red herring
        <select value={redHerring} onChange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; setRedHerring(v === '' ? '' : Number(v)); }}>
          <option value="">random good player</option>
          {view.players
            .filter((p) => assign[p.seat] && CHARACTER_INFO[assign[p.seat] as CharacterId].alignment === 'good')
            .map((p) => (
              <option key={p.seat} value={p.seat}>
                {seatLabel(view.players, p.seat)}
              </option>
            ))}
        </select>
      </label>
      <div class="cts-field">
        Demon bluffs (empty = random):
        {bluffs.map((b, i) => (
          <CharacterSelect
            key={i}
            value={b}
            allowEmpty
            only={scriptPool(lobbyScript).filter(
              (c) => CHARACTER_INFO[c].alignment === 'good' && !chosen.includes(c) && (c === b || !bluffs.includes(c)),
            )}
            onChange={(c) => setBluffs((x) => x.map((y, j) => (j === i ? c : y)))}
          />
        ))}
      </div>
      <label class="cts-check">
        <input type="checkbox" checked={nonstandard} onChange={(e) => setNonstandard((e.currentTarget as HTMLInputElement).checked)} /> Allow a nonstandard distribution
      </label>
      <div class="cts-row">
        <button class="primary" disabled={chosen.length !== view.players.length} onClick={submit}>
          Assign characters
        </button>
      </div>
      {view.charactersAssigned && (
        <>
          <h4>Current Grimoire</h4>
          <GrimoireSummary view={view} />
        </>
      )}
    </div>
  );
}

function GrimoireSummary({ view }: { view: StorytellerGameView }) {
  return (
    <div>
      <ul class="cts-list">
        {view.grimoire.map((g) => (
          <li key={g.seat}>
            {g.seat + 1}. {g.name}: <span class={`cts-${g.alignment}`}>{charName(g.character)}</span>
            {g.character !== g.believedCharacter && <span class="muted"> (thinks {charName(g.believedCharacter)})</span>}
            {g.isRedHerring && <span class="cts-chip">red herring</span>}
          </li>
        ))}
      </ul>
      <p class="muted">Bluffs: {view.demonBluffs.map(charName).join(', ') || '—'}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------------- grimoire

function GrimoireTab({ view, send, openComposer }: { view: StorytellerGameView; send: Send; openComposer: (p: Partial<ComposerState>) => void }) {
  if (!view.charactersAssigned) return <p class="muted">Assign characters first (Setup).</p>;
  return (
    <div>
      <p class="muted">
        Bluffs: {view.demonBluffs.map(charName).join(', ') || '—'} · Travel ×{view.travelSpeedMult}
      </p>
      {view.grimoire.map((g) => (
        <GrimoireRow key={g.seat} g={g} view={view} send={send} openComposer={openComposer} />
      ))}
    </div>
  );
}

function GrimoireRow({ g, view, send, openComposer }: { g: GrimoireEntry; view: StorytellerGameView; send: Send; openComposer: (p: Partial<ComposerState>) => void }) {
  const [editing, setEditing] = useState(false);
  const [newChar, setNewChar] = useState<CharacterId | ''>(g.character);
  const [newAlign, setNewAlign] = useState<'good' | 'evil'>(g.alignment);
  const [notify, setNotify] = useState(true);
  const [reminder, setReminder] = useState('');
  const pendingDeath = g.publicAlive === true && !g.alive;
  const night = view.phase === 'night' || view.phase === 'first_night' || view.phase === 'dawn';
  const over = view.phase === 'finished';
  return (
    <div class={`cts-grim ${g.alive ? '' : 'dead'} ${view.visitingSeat === g.seat ? 'visiting' : ''}`}>
      <div class="cts-grim-head">
        <span class="cts-seat">{g.seat + 1}</span>
        <span class="cts-name">{g.name}</span>
        <span class={`cts-char cts-${g.alignment}`}>{charName(g.character)}</span>
        {g.character !== g.believedCharacter && <span class="muted">thinks {charName(g.believedCharacter)}</span>}
        <span class="cts-spacer" />
        <StatusBadges g={g} />
        <span class={`cts-chip ${g.alive ? 'ok' : 'dead'}`}>{g.alive ? 'alive' : pendingDeath ? 'dies at dawn' : 'dead'}</span>
      </div>
      <div class="cts-grim-flags">
        <Toggle on={g.poisoned} label="Poisoned" disabled={over} onClick={() => send({ type: 'set_status', seat: g.seat, poisoned: !g.poisoned })} />
        <Toggle on={g.drunk} label="Drunk" disabled={over || g.character === 'drunk'} onClick={() => send({ type: 'set_status', seat: g.seat, drunk: !g.drunk })} />
        <Toggle on={g.protectedTonight} label="Protected" disabled={over} onClick={() => send({ type: 'set_status', seat: g.seat, protectedTonight: !g.protectedTonight })} />
        <Toggle on={g.ghostVoteAvailable} label="Ghost vote" disabled={over} onClick={() => send({ type: 'set_ghost_vote', seat: g.seat, available: !g.ghostVoteAvailable })} />
        {g.reminders.map((r) => (
          <span class="cts-chip rem" key={r}>
            {r}
            <button class="cts-x" title="Remove reminder" disabled={over} onClick={() => send({ type: 'remove_reminder', seat: g.seat, token: r })}>
              ×
            </button>
          </span>
        ))}
      </div>
      <div class="cts-grim-actions">
        <button onClick={() => send({ type: 'visit_home', seat: g.seat })} title="Fast-travel into this home">
          Visit
        </button>
        <button disabled={over} onClick={() => openComposer({ seat: g.seat, mode: 'info' })}>
          Info
        </button>
        <button disabled={over} onClick={() => openComposer({ seat: g.seat, mode: 'prompt' })}>
          Prompt
        </button>
        {g.alive ? (
          <ConfirmButton
            class="danger"
            disabled={over || view.phase === 'setup'}
            ask={`Kill ${g.name}?`}
            audience={night ? 'Announced at dawn: everyone will see it then.' : EVERYONE}
            effects={deathEffects(view, g.seat, 'kill')}
            undo="yes"
            onConfirm={() => send({ type: 'kill', seat: g.seat, announce: !night })}
          >
            Kill
          </ConfirmButton>
        ) : (
          <>
            <button disabled={over} onClick={() => send({ type: 'set_alive', seat: g.seat, alive: true })}>
              Revive
            </button>
            {!g.ghostVoteAvailable && (
              <button disabled={over} onClick={() => send({ type: 'set_alive', seat: g.seat, alive: true, restoreGhostVote: true })} title="Also give back their spent ghost vote">
                Revive + vote back
              </button>
            )}
          </>
        )}
        <button disabled={over} onClick={() => setEditing(!editing)}>{editing ? 'Cancel' : 'Change…'}</button>
      </div>
      {editing && !over && (
        <div class="cts-grim-edit">
          <CharacterSelect value={newChar} onChange={(c) => { setNewChar(c); if (c) setNewAlign(CHARACTER_INFO[c].alignment); }} />
          <select value={newAlign} onChange={(e) => setNewAlign((e.currentTarget as HTMLSelectElement).value as 'good' | 'evil')}>
            <option value="good">good</option>
            <option value="evil">evil</option>
          </select>
          <label class="cts-check">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify((e.currentTarget as HTMLInputElement).checked)} /> tell them
          </label>
          <button
            class="primary"
            disabled={!newChar}
            onClick={() => {
              if (!newChar) return;
              send({ type: 'change_character', seat: g.seat, character: newChar, alignment: newAlign, notify });
              setEditing(false);
            }}
          >
            Apply
          </button>
          {g.alive ? (
            <ConfirmButton class="cts-link" ask={`Mark ${g.name} dead (no triggers)?`} audience={night ? 'Players learn of it at dawn.' : EVERYONE} undo="yes" onConfirm={() => send({ type: 'set_alive', seat: g.seat, alive: false })}>
              Force dead (no triggers)
            </ConfirmButton>
          ) : (
            <button class="cts-link" onClick={() => send({ type: 'set_alive', seat: g.seat, alive: true })}>
              Force alive (no triggers)
            </button>
          )}
          {g.alignment === 'good' && !g.isRedHerring && view.phase !== 'setup' && (
            <button class="cts-link" onClick={() => send({ type: 'set_red_herring', seat: g.seat })} title="Fortune Teller's red herring">
              Make red herring
            </button>
          )}
          {g.character === 'drunk' && (
            <CharacterSelect
              value={g.believedCharacter}
              only={scriptPool(lobbyScript).filter((c) => CHARACTER_INFO[c].type === 'townsfolk')}
              onChange={(c) => c && CHARACTER_INFO[c].type === 'townsfolk' && send({ type: 'set_drunk_belief', seat: g.seat, character: c })}
            />
          )}
        </div>
      )}
      {!over && (
      <form
        class="cts-rem-add"
        onSubmit={(e) => {
          e.preventDefault();
          const t = reminder.trim();
          if (t) send({ type: 'add_reminder', seat: g.seat, token: t.slice(0, 40) });
          setReminder('');
        }}
      >
        <input value={reminder} maxLength={40} placeholder="add reminder…" onInput={(e) => setReminder((e.currentTarget as HTMLInputElement).value)} />
      </form>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------- night

function NightTab({ view, send, openComposer }: { view: StorytellerGameView; send: Send; openComposer: (p: Partial<ComposerState>) => void }) {
  if (!view.nightQueue.length) return <p class="muted">The night order appears when night falls.</p>;
  const done = view.nightQueue.filter((s) => s.status === 'resolved' || s.status === 'skipped').length;
  return (
    <div>
      <p class="muted">
        {done}/{view.nightQueue.length} steps done. Walk to a home (or use Visit) to wake its occupant.
      </p>
      <ol class="cts-steps">
        {view.nightQueue.map((s) => (
          <NightStep key={s.id} step={s} view={view} send={send} openComposer={openComposer} />
        ))}
      </ol>
    </div>
  );
}

function stepTitle(s: NightStepView): string {
  if (s.character === 'minion_info') return 'Minion info';
  if (s.character === 'demon_info') return 'Demon info';
  if (s.character === 'dusk') return 'Dusk';
  if (s.character === 'dawn') return 'Dawn';
  return charName(s.character);
}

/** Steps whose resolve applies an effect to a chosen target (server: "No target chosen yet" without one). */
const TARGET_STEPS: readonly string[] = ['monk', 'poisoner', 'imp', 'butler'];

function NightStep({ step, view, send, openComposer }: { step: NightStepView; view: StorytellerGameView; send: Send; openComposer: (p: Partial<ComposerState>) => void }) {
  const [override, setOverride] = useState<number | ''>('');
  const [starpass, setStarpass] = useState<number | ''>('');
  const [redirect, setRedirect] = useState<number | ''>('');
  const [infoText, setInfoText] = useState(step.suggestedInfo?.text ?? '');
  // Follow a fresh engine suggestion (e.g. after a status change) unless the ST is editing.
  const sugText = step.suggestedInfo?.text ?? '';
  useEffect(() => setInfoText(sugText), [sugText]);
  const finished = step.status === 'resolved' || step.status === 'skipped';
  const visited = step.status === 'visiting' || step.status === 'prompted' || step.status === 'answered' || step.status === 'resolved';
  const g = step.seat === null ? undefined : view.grimoire.find((x) => x.seat === step.seat);
  const minions = view.grimoire.filter((x) => x.alive && CHARACTER_INFO[x.character].type === 'minion');
  const needsTarget = TARGET_STEPS.includes(step.character) && g?.character !== 'drunk';
  const hasTarget = override !== '' || (step.response?.seats?.length ?? 0) > 0;
  // Choices the player could make themselves (the server's Monk/Butler also refuse self-targets).
  const overrideOptions = view.players.filter(
    (p) =>
      (step.prompt?.allowSelf !== false || p.seat !== step.seat) &&
      (step.prompt?.allowDead !== false || view.grimoire.find((x) => x.seat === p.seat)?.alive !== false),
  );
  const resolve = () => {
    const cmd: Extract<Cmd, { type: 'resolve_step' }> = { type: 'resolve_step', stepId: step.id };
    if (override !== '') cmd.seats = [override];
    if (starpass !== '') cmd.starpassSeat = starpass;
    if (redirect !== '') cmd.redirectSeat = redirect;
    send(cmd);
  };
  return (
    <li class={`cts-step ${step.status} ${step.seat !== null && view.visitingSeat === step.seat ? 'visiting' : ''}`}>
      <div class="cts-step-head">
        <span class={`cts-status ${step.status}`}>{step.status === 'resolved' ? '✓ done' : step.status}</span>
        <b>{stepTitle(step)}</b>
        {g && <span>— {seatLabel(view.players, g.seat)}</span>}
        {step.seat !== null && step.status !== 'skipped' && (
          <span class={`cts-visited ${visited ? 'yes' : ''}`}>{visited ? '✓ visited' : 'not visited'}</span>
        )}
        {step.impaired && (
          <span class="cts-chip cts-impaired" title="Their ability does nothing tonight; you may give false info">
            {g?.poisoned ? 'poisoned' : 'drunk'}: false info OK
          </span>
        )}
      </div>
      {step.suggestion && (
        <div class="cts-sugg">
          <span class="muted">{step.suggestedInfo ? 'Learns: ' : 'Suggested: '}</span>
          {step.suggestion}
        </div>
      )}
      {step.notes?.map((n, i) => (
        <div class={`cts-note ${step.impaired && /poisoned|drunk/i.test(n) ? 'cts-warn' : ''}`} key={i}>
          {n}
        </div>
      ))}
      {step.character === 'imp' && g && (override === g.seat || (override === '' && step.response?.seats?.includes(g.seat))) && (
        <div class="cts-note cts-warn">⚠ The Imp chose themself: star-pass — a Minion becomes the Imp (pick below, or auto).</div>
      )}
      {!finished && step.suggestedInfo && step.seat !== null && (
        <form
          class="cts-row cts-wrap"
          onSubmit={(e) => {
            e.preventDefault();
            const text = infoText.trim();
            if (text) send({ type: 'send_info', seat: step.seat!, info: { ...step.suggestedInfo!, text: text.slice(0, 500), stepId: step.id } });
          }}
        >
          <input class="cts-grow" value={infoText} maxLength={500} onInput={(e) => setInfoText((e.currentTarget as HTMLInputElement).value)} title="Edit before sending" />
          <button type="submit" class="primary" disabled={!infoText.trim()}>
            Send info
          </button>
          <small class="muted">{only(view.players, step.seat)}</small>
        </form>
      )}
      {step.response && (
        <div class="cts-resp">
          Answer:{' '}
          {step.response.seats?.map((s) => seatLabel(view.players, s)).join(', ')}
          {step.response.character && charName(step.response.character)}
          {step.response.yes !== undefined && (step.response.yes ? 'yes' : 'no')}
        </div>
      )}
      {!finished && (
        <div class="cts-step-actions">
          {step.seat !== null && <button onClick={() => send({ type: 'visit_home', seat: step.seat! })}>Visit</button>}
          {step.prompt && step.seat !== null && (
            <button onClick={() => send({ type: 'prompt_player', seat: step.seat!, prompt: step.prompt! })}>
              {step.status === 'prompted' ? 'Re-prompt' : 'Prompt'}
            </button>
          )}
          {step.seat !== null && (
            <button onClick={() => openComposer({ seat: step.seat, mode: 'info', info: { ...(step.suggestedInfo ?? EMPTY_INFO), stepId: step.id } })}>
              Edit info…
            </button>
          )}
          {TARGET_STEPS.includes(step.character) && step.seat !== null && (
            <select value={override} title="Choose on the player's behalf" onChange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; setOverride(v === '' ? '' : Number(v)); }}>
              <option value="">(use answer)</option>
              {overrideOptions.map((p) => (
                <option key={p.seat} value={p.seat}>
                  {seatLabel(view.players, p.seat)}
                </option>
              ))}
            </select>
          )}
          {step.character === 'imp' && (
            <>
              <select value={starpass} title="If the Imp picks themself: which Minion becomes the Imp" onChange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; setStarpass(v === '' ? '' : Number(v)); }}>
                <option value="">star-pass: auto</option>
                {minions.map((m) => (
                  <option key={m.seat} value={m.seat}>
                    → {seatLabel(view.players, m.seat)}
                  </option>
                ))}
              </select>
              <select value={redirect} title="Mayor bounce: who dies instead" onChange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; setRedirect(v === '' ? '' : Number(v)); }}>
                <option value="">no Mayor bounce</option>
                {view.grimoire.filter((x) => x.alive).map((x) => (
                  <option key={x.seat} value={x.seat}>
                    bounce → {seatLabel(view.players, x.seat)}
                  </option>
                ))}
              </select>
            </>
          )}
          <button
            class="primary"
            disabled={needsTarget && !hasTarget}
            title={needsTarget && !hasTarget ? "Wait for the player's answer or choose on their behalf" : undefined}
            onClick={resolve}
          >
            Resolve
          </button>
          <button onClick={() => send({ type: 'skip_step', stepId: step.id })}>Skip</button>
        </div>
      )}
    </li>
  );
}

// ------------------------------------------------------------------------------------ day

function DayTab({ view, send }: { view: StorytellerGameView; send: Send }) {
  const [execSeat, setExecSeat] = useState<number | ''>('');
  const [nomBy, setNomBy] = useState<number | ''>('');
  const [nomOf, setNomOf] = useState<number | ''>('');
  const [nomStart, setNomStart] = useState(true);
  const d = view.day;
  if (!d) return <p class="muted">Day controls appear during the day.</p>;
  const isDay = view.phase === 'day';
  const voting = isDay ? d.nominations.find((n) => n.status === 'voting') : undefined;
  // Re-opening nominations after today's execution is rejected by the server.
  const executed = d.executedSeat !== null;
  return (
    <div>
      <div class="cts-row">
        <label class="cts-check">
          <input
            type="checkbox"
            checked={d.nominationsOpen}
            disabled={!isDay || (executed && !d.nominationsOpen)}
            onChange={(e) => send({ type: 'set_nominations_open', open: (e.currentTarget as HTMLInputElement).checked })}
          />{' '}
          Nominations open
        </label>
        {!isDay && <span class="muted">Day is over: execution buttons here force it (no rules).</span>}
      </div>
      {d.nominations.length === 0 && <p class="muted">No nominations yet.</p>}
      <ul class="cts-list">
        {d.nominations.map((n) => (
          <li key={n.id}>
            {seatLabel(view.players, n.nominatorSeat)} → <b>{seatLabel(view.players, n.nomineeSeat)}</b>{' '}
            <span class="cts-chip">{n.status}</span>
            {(n.status === 'tallied' || n.status === 'voting') && (
              <span>
                {' '}
                {n.voteCount}/{n.threshold}
              </span>
            )}
            {isDay && n.status === 'pending' && (
              <button
                class="primary"
                onClick={() => send(voting ? { type: 'force_vote', nominationId: n.id } : { type: 'start_vote', nominationId: n.id })}
                title={voting ? 'Replaces the running vote' : undefined}
              >
                Start vote
              </button>
            )}
            {(n.status === 'tallied' || n.status === 'cancelled') && (
              <ConfirmButton class="cts-link" ask="Re-run this vote (votes reset)?" audience={EVERYONE} undo="yes" onConfirm={() => send({ type: 'force_vote', nominationId: n.id })}>
                re-vote
              </ConfirmButton>
            )}
            {(n.status === 'pending' || n.status === 'voting') && (
              <ConfirmButton ask="Cancel this nomination?" audience={EVERYONE} undo="yes" onConfirm={() => send({ type: 'cancel_nomination', nominationId: n.id })}>
                Cancel
              </ConfirmButton>
            )}
            {isDay && (n.status === 'tallied' || n.status === 'voting') && Object.entries(n.votes).some(([, v]) => v) && (
              <div class="cts-row">
                <span class="muted">Votes:</span>
                {Object.entries(n.votes)
                  .filter(([, v]) => v)
                  .map(([seat]) => (
                    <ConfirmButton
                      key={seat}
                      class="cts-link"
                      title="Strike this vote (e.g. a Butler who voted without their master)"
                      ask={`Strike the vote of ${seatLabel(view.players, Number(seat))}?`}
                      audience={EVERYONE}
                      undo="yes"
                      onConfirm={() => send({ type: 'strike_vote', nominationId: n.id, seat: Number(seat) })}
                    >
                      {seatLabel(view.players, Number(seat))} ✕
                    </ConfirmButton>
                  ))}
              </div>
            )}
          </li>
        ))}
      </ul>
      <div class="cts-row cts-wrap">
        <span class="muted">New nomination:</span>
        <select value={nomBy} onChange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; setNomBy(v === '' ? '' : Number(v)); }}>
          <option value="">nominator…</option>
          {view.players.map((p) => (
            <option key={p.seat} value={p.seat}>
              {seatLabel(view.players, p.seat)}
            </option>
          ))}
        </select>
        →
        <select value={nomOf} onChange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; setNomOf(v === '' ? '' : Number(v)); }}>
          <option value="">nominee…</option>
          {view.players.map((p) => (
            <option key={p.seat} value={p.seat}>
              {seatLabel(view.players, p.seat)}
            </option>
          ))}
        </select>
        <label class="cts-check">
          <input type="checkbox" checked={nomStart} onChange={(e) => setNomStart((e.currentTarget as HTMLInputElement).checked)} /> start vote
        </label>
        <button
          disabled={nomBy === '' || nomOf === ''}
          onClick={() => {
            if (nomBy === '' || nomOf === '') return;
            send({ type: 'create_nomination', nominatorSeat: nomBy, nomineeSeat: nomOf, startVote: nomStart });
            setNomBy('');
            setNomOf('');
          }}
          title="Create a nomination regardless of the rules"
        >
          Create
        </button>
      </div>
      {voting && (
        <div class="cts-center">
          <VoteClock nom={voting} players={view.players} size={170} />
        </div>
      )}
      {voting && (
        <div class="cts-row cts-wrap cts-center">
          <button class="primary" onClick={() => send({ type: 'close_vote', mode: 'tally' })}>
            Close vote (tally)
          </button>
          <ConfirmButton ask="Discard this vote?" audience={EVERYONE} undo="yes" onConfirm={() => send({ type: 'close_vote', mode: 'cancel' })}>
            Cancel vote
          </ConfirmButton>
        </div>
      )}
      <div class="cts-block">
        {d.executedSeat !== null ? (
          <span>Executed today: {seatLabel(view.players, d.executedSeat)}</span>
        ) : d.onTheBlock ? (
          <>
            <span>
              On the block: <b>{seatLabel(view.players, d.onTheBlock.seat)}</b> ({d.onTheBlock.votes} votes)
            </span>
            <ConfirmButton
              class="danger"
              ask={`Execute ${seatLabel(view.players, d.onTheBlock.seat)}?`}
              audience={EVERYONE}
              effects={deathEffects(view, d.onTheBlock.seat, 'execute')}
              undo="yes"
              onConfirm={() => send(isDay && !voting ? { type: 'execute', seat: d.onTheBlock!.seat } : { type: 'force_execute', seat: d.onTheBlock!.seat })}
            >
              Execute
            </ConfirmButton>
          </>
        ) : (
          <span class="muted">Nobody is on the block.</span>
        )}
      </div>
      {d.executedSeat === null && (
        <div class="cts-row">
          <select value={execSeat} onChange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; setExecSeat(v === '' ? '' : Number(v)); }}>
            <option value="">execute someone else…</option>
            {view.players.map((p) => (
              <option key={p.seat} value={p.seat}>
                {seatLabel(view.players, p.seat)}
              </option>
            ))}
          </select>
          <ConfirmButton
            class="danger"
            disabled={execSeat === ''}
            ask={execSeat === '' ? undefined : `Execute ${seatLabel(view.players, execSeat)}?`}
            audience={EVERYONE}
            effects={execSeat === '' ? undefined : deathEffects(view, execSeat, 'execute')}
            undo="yes"
            onConfirm={() => execSeat !== '' && send(isDay && !voting ? { type: 'execute', seat: execSeat } : { type: 'force_execute', seat: execSeat })}
          >
            Execute
          </ConfirmButton>
          <ConfirmButton ask="Declare no execution today?" audience={EVERYONE} effects={noExecutionEffects(view)} undo="yes" onConfirm={() => send(isDay && !voting ? { type: 'execute', seat: null } : { type: 'force_execute', seat: null })}>
            No execution
          </ConfirmButton>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------------- tools

function ToolsTab({ view, send, composer, setComposer }: { view: StorytellerGameView; send: Send; composer: ComposerState; setComposer: (f: (c: ComposerState) => ComposerState) => void }) {
  const [announce, setAnnounce] = useState('');
  const [winReason, setWinReason] = useState('');
  const [bed, setBed] = useState(view.bedtimeSeconds ?? 45);
  const over = view.phase === 'finished';
  return (
    <div>
      <Composer view={view} send={send} composer={composer} setComposer={setComposer} />
      <h4>Announce</h4>
      <form
        class="cts-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (announce.trim()) send({ type: 'announce', text: announce.trim().slice(0, 300) });
          setAnnounce('');
        }}
      >
        <input class="cts-grow" value={announce} maxLength={300} placeholder="Public announcement…" onInput={(e) => setAnnounce((e.currentTarget as HTMLInputElement).value)} />
        <button type="submit">Announce</button>
      </form>
      <small class="muted">📢 {EVERYONE}</small>
      <h4>Travel & timers</h4>
      <label class="cts-field">
        Travel speed ×{view.travelSpeedMult}
        <input
          type="range"
          min={1}
          max={4}
          step={0.5}
          value={view.travelSpeedMult}
          onChange={(e) => send({ type: 'set_travel_speed', mult: Number((e.currentTarget as HTMLInputElement).value) })}
        />
      </label>
      <form
        class="cts-row"
        onSubmit={(e) => {
          e.preventDefault();
          send({ type: 'set_bedtime_seconds', seconds: Number.isFinite(bed) ? Math.min(300, Math.max(10, Math.round(bed))) : (view.bedtimeSeconds ?? 45) });
        }}
      >
        <label>
          Bedtime countdown{' '}
          <input type="number" min={10} max={300} value={bed} style={{ width: '70px' }} onInput={(e) => setBed(Number((e.currentTarget as HTMLInputElement).value))} /> s
        </label>
        <button type="submit" disabled={over}>
          Set
        </button>
      </form>
      <h4>Declare winner</h4>
      <div class="cts-row">
        <input class="cts-grow" value={winReason} maxLength={200} placeholder="Reason (optional)" onInput={(e) => setWinReason((e.currentTarget as HTMLInputElement).value)} />
        <ConfirmButton
          class="cts-good-btn"
          disabled={over}
          ask="Declare GOOD the winner?"
          audience="Everyone sees the result and every character."
          undo="final"
          onConfirm={() => send({ type: 'declare_winner', winner: 'good', reason: winReason || 'Declared by the Storyteller.' })}
        >
          Good wins
        </ConfirmButton>
        <ConfirmButton
          class="cts-evil-btn"
          disabled={over}
          ask="Declare EVIL the winner?"
          audience="Everyone sees the result and every character."
          undo="final"
          onConfirm={() => send({ type: 'declare_winner', winner: 'evil', reason: winReason || 'Declared by the Storyteller.' })}
        >
          Evil wins
        </ConfirmButton>
      </div>
    </div>
  );
}

function Composer({ view, send, composer, setComposer }: { view: StorytellerGameView; send: Send; composer: ComposerState; setComposer: (f: (c: ComposerState) => ComposerState) => void }) {
  const set = (patch: Partial<ComposerState>) => setComposer((c) => ({ ...c, ...patch }));
  const setPrompt = (patch: Partial<PromptSpecInput>) => setComposer((c) => ({ ...c, prompt: { ...c.prompt, ...patch } }));
  const setInfo = (patch: Partial<InfoSpecInput>) => setComposer((c) => ({ ...c, info: { ...c.info, ...patch } }));
  const { prompt, info } = composer;
  const infoSeats = info.seats ?? [];
  const infoChars = info.characters ?? [];
  const promptChars = prompt.characterOptions ?? [];
  const over = view.phase === 'finished'; // server: the game is over (no prompts/info)
  const canSend =
    !over && composer.seat !== null && (composer.mode === 'prompt' ? prompt.title.trim().length > 0 : info.text.trim().length > 0);
  const count = (v: string, fallback: number) => {
    const n = Math.round(Number(v));
    return v === '' || !Number.isFinite(n) ? fallback : Math.max(0, Math.min(15, n));
  };
  const recipients = useMemo(() => view.players, [view.players]);
  const doSend = () => {
    if (composer.seat === null) return;
    if (composer.mode === 'prompt') {
      // Only send the fields that belong to the chosen kind (an empty option list is rejected).
      const out: PromptSpecInput = { kind: prompt.kind, title: prompt.title.trim() };
      if (prompt.body) out.body = prompt.body;
      if (prompt.kind === 'choose_players') {
        out.minTargets = prompt.minTargets ?? 1;
        out.maxTargets = prompt.maxTargets ?? out.minTargets;
        out.allowSelf = prompt.allowSelf ?? true;
        out.allowDead = prompt.allowDead ?? true;
      }
      if (prompt.kind === 'choose_character' && promptChars.length) out.characterOptions = promptChars;
      send({ type: 'prompt_player', seat: composer.seat, prompt: out });
    }
    else {
      const out: InfoSpecInput = { text: info.text.trim() };
      if (infoSeats.length) out.seats = infoSeats;
      if (infoChars.length) out.characters = infoChars;
      if (info.number !== undefined) out.number = info.number;
      if (info.yes !== undefined) out.yes = info.yes;
      if (info.stepId) out.stepId = info.stepId;
      send({ type: 'send_info', seat: composer.seat, info: out });
      setInfo({ text: '', seats: [], characters: [], number: undefined, yes: undefined, stepId: undefined });
    }
  };
  return (
    <div class="cts-composer">
      <h4>Private message to a player</h4>
      <div class="cts-row">
        <select
          value={composer.seat ?? ''}
          onChange={(e) => {
            const v = (e.currentTarget as HTMLSelectElement).value;
            const seat = v === '' ? null : Number(v);
            setComposer((c) => ({ ...c, seat, info: seat === c.seat ? c.info : withoutStep(c.info) }));
          }}
        >
          <option value="">to…</option>
          {recipients.map((p) => (
            <option key={p.seat} value={p.seat}>
              {seatLabel(view.players, p.seat)}
            </option>
          ))}
        </select>
        <button class={composer.mode === 'info' ? 'on' : ''} onClick={() => set({ mode: 'info' })}>
          Info
        </button>
        <button class={composer.mode === 'prompt' ? 'on' : ''} onClick={() => set({ mode: 'prompt' })}>
          Prompt
        </button>
      </div>
      {composer.mode === 'info' ? (
        <>
          <textarea rows={2} maxLength={500} value={info.text} placeholder="What they learn…" onInput={(e) => setInfo({ text: (e.currentTarget as HTMLTextAreaElement).value })} />
          <div class="cts-row cts-wrap">
            <SeatMulti view={view} value={infoSeats} onChange={(seats) => setInfo({ seats })} />
            <CharacterSelect value="" allowEmpty onChange={(c) => c && !infoChars.includes(c) && setInfo({ characters: [...infoChars, c] })} />
            {infoChars.map((c) => (
              <span class="cts-chip rem" key={c}>
                {charName(c)}
                <button class="cts-x" onClick={() => setInfo({ characters: infoChars.filter((x) => x !== c) })}>
                  ×
                </button>
              </span>
            ))}
            <input
              type="number"
              min={0}
              max={99}
              placeholder="#"
              style={{ width: '56px' }}
              value={info.number ?? ''}
              onInput={(e) => {
                const v = (e.currentTarget as HTMLInputElement).value;
                setInfo({ number: v === '' ? undefined : Math.max(0, Math.min(99, Number(v))) });
              }}
            />
            <select value={info.yes === undefined ? '' : info.yes ? 'y' : 'n'} onChange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; setInfo({ yes: v === '' ? undefined : v === 'y' }); }}>
              <option value="">yes/no?</option>
              <option value="y">Yes</option>
              <option value="n">No</option>
            </select>
          </div>
          {info.stepId && <small class="muted">Linked to night step {info.stepId} (sending completes it).</small>}
        </>
      ) : (
        <>
          <div class="cts-row">
            <select value={prompt.kind} onChange={(e) => setPrompt({ kind: (e.currentTarget as HTMLSelectElement).value as PromptKind })}>
              {PROMPT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k.replace('_', ' ')}
                </option>
              ))}
            </select>
            <input class="cts-grow" maxLength={120} value={prompt.title} onInput={(e) => setPrompt({ title: (e.currentTarget as HTMLInputElement).value })} />
          </div>
          <textarea rows={2} maxLength={500} value={prompt.body ?? ''} placeholder="Details (optional)" onInput={(e) => setPrompt({ body: (e.currentTarget as HTMLTextAreaElement).value || undefined })} />
          {prompt.kind === 'choose_players' && (
            <div class="cts-row cts-wrap">
              <label>
                min <input type="number" min={0} max={15} style={{ width: '48px' }} value={prompt.minTargets ?? 1} onInput={(e) => setPrompt({ minTargets: count((e.currentTarget as HTMLInputElement).value, 1) })} />
              </label>
              <label>
                max <input type="number" min={1} max={15} style={{ width: '48px' }} value={prompt.maxTargets ?? 1} onInput={(e) => setPrompt({ maxTargets: count((e.currentTarget as HTMLInputElement).value, 1) })} />
              </label>
              <label class="cts-check">
                <input type="checkbox" checked={prompt.allowSelf ?? true} onChange={(e) => setPrompt({ allowSelf: (e.currentTarget as HTMLInputElement).checked })} /> self
              </label>
              <label class="cts-check">
                <input type="checkbox" checked={prompt.allowDead ?? true} onChange={(e) => setPrompt({ allowDead: (e.currentTarget as HTMLInputElement).checked })} /> dead
              </label>
            </div>
          )}
          {prompt.kind === 'choose_character' && (
            <div class="cts-row cts-wrap">
              <span class="muted">Options (none = any):</span>
              <CharacterSelect
                value=""
                allowEmpty
                onChange={(c) => c && !promptChars.includes(c) && setPrompt({ characterOptions: [...promptChars, c] })}
              />
              {promptChars.map((c) => (
                <span class="cts-chip rem" key={c}>
                  {charName(c)}
                  <button class="cts-x" onClick={() => setPrompt({ characterOptions: promptChars.filter((x) => x !== c) })}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </>
      )}
      <div class="cts-row">
        <button class="primary" disabled={!canSend} onClick={doSend}>
          Send {composer.mode}
        </button>
        {composer.seat !== null && <small class="muted">🔒 {only(view.players, composer.seat)}</small>}
      </div>
    </div>
  );
}

function SeatMulti({ view, value, onChange }: { view: StorytellerGameView; value: number[]; onChange: (v: number[]) => void }) {
  return (
    <span class="cts-seatmulti">
      {view.players.map((p) => (
        <button key={p.seat} class={value.includes(p.seat) ? 'on' : ''} title={p.name} onClick={() => onChange(value.includes(p.seat) ? value.filter((x) => x !== p.seat) : [...value, p.seat])}>
          {p.seat + 1}
        </button>
      ))}
    </span>
  );
}

// ------------------------------------------------------------------------------------- log

function LogTab({ view }: { view: StorytellerGameView }) {
  return (
    <ol class="cts-log">
      {[...view.log].reverse().map((l, i) => (
        <li key={`${l.at}-${i}`}>
          <small class="muted">{new Date(l.at).toLocaleTimeString()}</small> {l.text}
        </li>
      ))}
    </ol>
  );
}
