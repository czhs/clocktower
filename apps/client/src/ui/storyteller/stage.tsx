// OWNED BY rules-storyteller. The Storyteller's "stage": the game as malleable props. Big obvious
// buttons (gather, force seats, votes, nightfall, walk / teleport / freeze everyone, force phase),
// the seat-circle diagram with per-player context actions, door overrides and the bedtime timer.
// The rules engine only advises: buttons are disabled only when the payload would be invalid.
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { townLayout } from '@ct/assets';
import {
  CHARACTER_INFO,
  FORCE_PHASES,
  type BuildingDef,
  type C2SPayload,
  type CharacterId,
  type ForcePhase,
  type GrimoireEntry,
  type NominationView,
  type PublicPlayerView,
  type StagePlayerView,
  type StageTarget,
  type StorytellerGameView,
} from '@ct/protocol';
import { useStore } from '../../net/store';
import { stagePick } from '../../game/gameplay/pick';
import { charName, CharacterSelect, Countdown, nameOf, seatLabel } from '../hud/shared';

type Cmd = C2SPayload<'st:command'>;
export type Send = (c: Cmd) => void;
type Who = number[] | 'all';
export type OpenComposer = (p: { seat: number; mode: 'info' | 'prompt' }) => void;

// ------------------------------------------------------------------------------ helpers

/**
 * Two-click inline confirm (never window.confirm): first click arms, second click acts. The armed
 * step can say who will see the effect (`audience`), what the rules say will follow (`effects`,
 * advisory only) and whether Undo can revert it (`undo`).
 */
export function ConfirmButton(props: {
  children: ComponentChildren;
  onConfirm: () => void;
  ask?: string;
  class?: string;
  title?: string;
  disabled?: boolean;
  audience?: string;
  effects?: string[];
  undo?: 'yes' | 'final';
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 6000);
    return () => clearTimeout(t);
  }, [armed]);
  if (armed)
    return (
      <span class="cts-confirm" role="group">
        <span class="cts-confirm-ask">{props.ask ?? 'Are you sure?'}</span>
        {(props.audience || props.effects?.length || props.undo) && (
          <span class="cts-confirm-more">
            {props.effects?.map((e) => (
              <span class="cts-confirm-effect" key={e}>
                ⚠ {e}
              </span>
            ))}
            {props.audience && <span class="cts-confirm-aud">👁 {props.audience}</span>}
            {props.undo === 'yes' && <span class="muted">↶ Undo can revert this.</span>}
            {props.undo === 'final' && <span class="cts-confirm-effect">Final: cannot be undone.</span>}
          </span>
        )}
        <button
          class="danger"
          onClick={() => {
            setArmed(false);
            props.onConfirm();
          }}
        >
          Yes
        </button>
        <button onClick={() => setArmed(false)}>No</button>
      </span>
    );
  return (
    <button class={props.class} title={props.title} disabled={props.disabled} onClick={() => setArmed(true)}>
      {props.children}
    </button>
  );
}

const FORCE_LABEL: Record<ForcePhase, string> = {
  setup: 'Setup',
  first_night: 'First night',
  day: 'Day',
  gather: 'Gather',
  bedtime: 'Bedtime',
  night: 'Night',
  dawn: 'Dawn',
};

function buildingById(id: string | null): BuildingDef | undefined {
  return id ? townLayout.buildings.find((b) => b.id === id) : undefined;
}

function buildingLabel(b: BuildingDef, players: PublicPlayerView[]): string {
  if (b.houseIndex !== null) {
    const p = players.find((x) => x.seat === b.houseIndex);
    return p ? `${b.name} (${p.seat + 1}. ${p.name})` : b.name;
  }
  return b.name;
}

/** Buildings: public places first, then homes of seated players (by seat), then empty homes. */
function sortedBuildings(players: PublicPlayerView[]): BuildingDef[] {
  const rank = (b: BuildingDef) =>
    b.houseIndex === null ? -1 : players.some((p) => p.seat === b.houseIndex) ? b.houseIndex : 100 + b.houseIndex;
  return [...townLayout.buildings].sort((a, b) => rank(a) - rank(b));
}

function describeTarget(t: StageTarget): string {
  switch (t.kind) {
    case 'seat':
      return 'their circle seat';
    case 'home':
      return 'home';
    case 'square':
      return 'the square';
    case 'storyteller':
      return 'you';
    case 'building':
      return buildingById(t.buildingId)?.name ?? t.buildingId;
    case 'point':
      return `map point (${Math.round(t.x)}, ${Math.round(t.y)})`;
  }
}

export const EVERYONE = 'Everyone will see this.';
export const only = (players: PublicPlayerView[], seat: number) => `Only ${nameOf(players, seat)} will see this.`;

/**
 * Advisory "what happens if" for a death (rules hints only; the Storyteller decides, and every
 * detected game end still waits for Confirm / Override).
 */
export function deathEffects(view: StorytellerGameView, seat: number, how: 'execute' | 'kill'): string[] {
  const g = view.grimoire.find((x) => x.seat === seat);
  if (!g || !g.alive) return [];
  const out: string[] = [];
  const alive = view.grimoire.filter((x) => x.alive);
  const impaired = g.poisoned || g.drunk;
  if (how === 'execute' && g.character === 'saint')
    out.push(impaired ? 'The Saint is poisoned/drunk: no effect, the game goes on.' : 'Executing the Saint: Evil wins (you can still override).');
  if (CHARACTER_INFO[g.character].type === 'demon') {
    const otherDemon = alive.some((x) => x.seat !== seat && CHARACTER_INFO[x.character].type === 'demon');
    const sw = alive.find((x) => x.seat !== seat && x.character === 'scarlet_woman' && !x.poisoned);
    if (sw && alive.length >= 5) out.push(`Scarlet Woman ${sw.name} becomes the Imp (${alive.length} alive).`);
    else if (!otherDemon) out.push('No Demon left: Good wins (you can still override).');
  } else if (alive.length === 3) out.push('Only 2 players will be left alive: Evil wins if the Demon lives.');
  if (how === 'kill' && g.character === 'mayor' && !impaired && view.phase !== 'day')
    out.push('Mayor: at night another player may die instead (bounce in the Imp step).');
  if (how === 'kill' && g.character === 'soldier' && !impaired) out.push('The Soldier cannot be killed by the Demon (a Storyteller kill still works).');
  return out;
}

/** Unfinished night steps (warning when ending the night early). */
export function nightLeft(view: StorytellerGameView): string[] {
  const left = view.nightQueue.filter((s) => s.status !== 'resolved' && s.status !== 'skipped').length;
  return left ? [`${left} night step${left === 1 ? '' : 's'} not done yet.`] : [];
}

/** Advisory effects of declaring no execution today. */
export function noExecutionEffects(view: StorytellerGameView): string[] {
  const alive = view.grimoire.filter((x) => x.alive);
  const mayor = alive.find((x) => x.character === 'mayor' && !x.poisoned && !x.drunk);
  return alive.length === 3 && mayor ? [`Mayor (${mayor.name}) with 3 alive and no execution: Good wins at day's end.`] : [];
}

function whoLabel(who: Who, players: PublicPlayerView[]): string {
  if (who === 'all') return 'everyone';
  return who.map((s) => nameOf(players, s)).join(', ');
}

/** Enter "click a point on the map" mode; the town layer calls back with world px. */
function pickPoint(label: string, then: (t: StageTarget) => void): void {
  stagePick.set({
    label,
    onPick: (x, y) => then({ kind: 'point', x: Math.max(0, Math.min(4096, Math.round(x))), y: Math.max(0, Math.min(4096, Math.round(y))) }),
  });
}

function presenceText(p: StagePlayerView | undefined): string {
  if (!p) return '';
  switch (p.presence) {
    case 'home':
      return '⌂ home';
    case 'seated':
      return '✓ seated';
    case 'walking':
      return 'walking';
    case 'escorted':
      return 'escorted';
    case 'outdoors':
      return 'outdoors';
    case 'inside':
      return `in ${buildingById(p.building)?.name ?? 'a building'}`;
  }
}

/** The vote currently running (any phase: a stale 'voting' row can still be closed). */
function runningVote(view: StorytellerGameView): NominationView | undefined {
  return view.day?.nominations.find((n) => n.status === 'voting');
}

/** Nomination the "Start vote" button targets by default: latest pending, else latest. */
function defaultNomination(noms: NominationView[]): NominationView | undefined {
  const pending = noms.filter((n) => n.status === 'pending');
  return pending[pending.length - 1] ?? noms[noms.length - 1];
}

// ----------------------------------------------------------------------- target picker

/** Buttons for every StageTarget kind. `seat`/`home` need a player context (always valid for all). */
function TargetPicker({ view, verb, onPick, mapLabel }: { view: StorytellerGameView; verb: string; onPick: (t: StageTarget) => void; mapLabel: string }) {
  const [bld, setBld] = useState('');
  return (
    <div class="cts-targets">
      <span class="muted">{verb} →</span>
      <button onClick={() => onPick({ kind: 'seat' })}>Seat</button>
      <button onClick={() => onPick({ kind: 'home' })}>Home</button>
      <button onClick={() => onPick({ kind: 'square' })}>Square</button>
      <button onClick={() => onPick({ kind: 'storyteller' })}>To me</button>
      <select value={bld} onChange={(e) => setBld((e.currentTarget as HTMLSelectElement).value)} title="Building">
        <option value="">building…</option>
        {sortedBuildings(view.players).map((b) => (
          <option key={b.id} value={b.id}>
            {buildingLabel(b, view.players)}
          </option>
        ))}
      </select>
      <button disabled={!bld} onClick={() => bld && onPick({ kind: 'building', buildingId: bld })}>
        Go
      </button>
      <button onClick={() => pickPoint(mapLabel, onPick)} title="Click a point on the map (Esc cancels)">
        ⌖ Map point
      </button>
    </div>
  );
}

/** Teleport everyone: choose a target, then confirm. */
function TeleportAll({ view, send, onDone }: { view: StorytellerGameView; send: Send; onDone: () => void }) {
  const [target, setTarget] = useState<StageTarget | null>(null);
  if (target)
    return (
      <div class="cts-targets">
        <span>
          Teleport <b>everyone</b> → {describeTarget(target)}?
        </span>
        <button
          class="danger"
          onClick={() => {
            send({ type: 'teleport', who: 'all', to: target });
            setTarget(null);
            onDone();
          }}
        >
          Yes, teleport
        </button>
        <button onClick={() => setTarget(null)}>No</button>
      </div>
    );
  return <TargetPicker view={view} verb="Teleport everyone" onPick={setTarget} mapLabel="Click the map: teleport everyone there" />;
}

// -------------------------------------------------------------------------- stage bar

/** Compact always-visible stage controls under the phase controls. */
export function StageBar({ view, send }: { view: StorytellerGameView; send: Send }) {
  const [open, setOpen] = useState(true);
  const [teleporting, setTeleporting] = useState(false);
  const [forcing, setForcing] = useState(false);
  const p = view.phase;
  if (p === 'finished') return null;
  const night = p === 'night' || p === 'first_night' || p === 'dawn';
  const noms = view.day?.nominations ?? [];
  const voting = runningVote(view);
  const frozen = view.stage?.players.filter((x) => x.frozen).length ?? 0;
  return (
    <section class="cts-stage">
      <header class="cts-stage-head">
        <button class="cts-icon" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? '▾' : '▸'}
        </button>
        <span class="cts-stage-title">Stage</span>
        {view.gathering && <span class="cts-chip ok">circle gathered</span>}
        {frozen > 0 && <span class="cts-chip">❄ {frozen} frozen</span>}
        {voting && (
          <span class="cts-chip visit">
            vote: {nameOf(view.players, voting.nomineeSeat)} {voting.voteCount}/{voting.threshold}
          </span>
        )}
      </header>
      {open && (
        <div class="cts-stage-body">
          <div class="cts-bigrow">
            {p === 'day' ? (
              <button class={`cts-big ${view.gathering ? 'on' : ''}`} onClick={() => send({ type: 'gather', on: !view.gathering })}>
                {view.gathering ? 'Dissolve circle' : 'Gather circle'}
              </button>
            ) : (
              <ConfirmButton class="cts-big" ask="Jump to day and gather?" audience={EVERYONE} undo="yes" onConfirm={() => send({ type: 'force_phase', to: 'gather' })}>
                Gather (→ day)
              </ConfirmButton>
            )}
            <ConfirmButton class="cts-big" ask="Teleport everyone to their seat?" audience={EVERYONE} onConfirm={() => send({ type: 'teleport', who: 'all', to: { kind: 'seat' } })}>
              Force seats
            </ConfirmButton>
            {night && (
              <ConfirmButton class="cts-big primary" ask="End the night now (→ day)?" audience="Everyone will see this; tonight's deaths are announced." effects={nightLeft(view)} undo="yes" onConfirm={() => send({ type: 'force_phase', to: 'day' })}>
                End night
              </ConfirmButton>
            )}
            {p === 'day' && (
              <button class="cts-big primary" onClick={() => send({ type: 'advance_phase', to: 'bedtime' })} title="Ends the day (the player on the block is executed)">
                Ring bedtime bell
              </button>
            )}
            {p === 'setup' && (
              <button class="cts-big primary" onClick={() => send({ type: 'advance_phase', to: 'bedtime' })} title="Players walk home; the first night falls when everyone is in">
                Ring bedtime bell (→ first night)
              </button>
            )}
          </div>
          {p === 'bedtime' && <BedtimeTimer view={view} send={send} />}
          <div class="cts-bigrow">
            <StartVote view={view} noms={noms} send={send} />
            {voting && (
              <>
                <button class="cts-big primary" onClick={() => send({ type: 'close_vote', mode: 'tally' })} title="Lock every remaining hand and count">
                  Close vote (tally)
                </button>
                <ConfirmButton class="cts-big" ask="Discard this vote?" audience={EVERYONE} undo="yes" onConfirm={() => send({ type: 'close_vote', mode: 'cancel' })}>
                  Cancel vote
                </ConfirmButton>
              </>
            )}
          </div>
          <div class="cts-bigrow">
            <button class="cts-big" onClick={() => send({ type: 'walk_to', who: 'all', to: { kind: 'home' } })} title="Everyone walks home at normal speed">
              Walk everyone home
            </button>
            <ConfirmButton class="cts-big" ask="Teleport everyone home?" audience={EVERYONE} onConfirm={() => send({ type: 'teleport', who: 'all', to: { kind: 'home' } })}>
              Bring everyone home
            </ConfirmButton>
            <button class={`cts-big ${teleporting ? 'on' : ''}`} onClick={() => setTeleporting(!teleporting)}>
              Teleport…
            </button>
            <button class="cts-big" onClick={() => send({ type: 'freeze', who: 'all', frozen: true })}>
              ❄ Freeze all
            </button>
            <button class="cts-big" onClick={() => send({ type: 'freeze', who: 'all', frozen: false })}>
              Unfreeze all
            </button>
            <button onClick={() => send({ type: 'walk_to', who: 'all', to: null })} title="Stop every server-driven walk">
              Stop walks
            </button>
            <label class="cts-setting" title="Players' icons hang on the door of the building they are in (daytime only; never the Storyteller)">
              <input
                type="checkbox"
                checked={view.settings?.doorTags ?? true}
                onChange={(e) => send({ type: 'set_setting', settings: { doorTags: (e.currentTarget as HTMLInputElement).checked } })}
              />{' '}
              Door tags
            </label>
          </div>
          {teleporting && <TeleportAll view={view} send={send} onDone={() => setTeleporting(false)} />}
          <div class="cts-row cts-wrap">
            <button class={`cts-link ${forcing ? 'on' : ''}`} onClick={() => setForcing(!forcing)}>
              {forcing ? '▾' : '▸'} Force phase
            </button>
            {forcing &&
              FORCE_PHASES.map((to) => (
                <ConfirmButton key={to} ask={`Force ${FORCE_LABEL[to]}?`} audience={EVERYONE} undo="yes" onConfirm={() => send({ type: 'force_phase', to })} title="Jump straight there (no block execution, no checks)">
                  {FORCE_LABEL[to]}
                </ConfirmButton>
              ))}
          </div>
        </div>
      )}
    </section>
  );
}

function StartVote({ view, noms, send }: { view: StorytellerGameView; noms: NominationView[]; send: Send }) {
  const def = defaultNomination(noms);
  const [sel, setSel] = useState<string>('');
  const chosen = noms.find((n) => n.id === sel) ?? def;
  const label = (n: NominationView) => `${nameOf(view.players, n.nominatorSeat)} → ${nameOf(view.players, n.nomineeSeat)} (${n.status})`;
  if (!noms.length)
    return (
      <button class="cts-big" disabled title="No nomination yet (create one from a player in the circle or the Day tab)">
        Start vote
      </button>
    );
  const start = () => chosen && send({ type: 'force_vote', nominationId: chosen.id });
  const resets = chosen && chosen.status !== 'pending';
  return (
    <span class="cts-startvote">
      {resets ? (
        <ConfirmButton class="cts-big primary" ask="Re-run this vote (votes reset)?" audience={EVERYONE} undo="yes" onConfirm={start}>
          {chosen.status === 'voting' ? 'Restart vote' : 'Re-vote'}
        </ConfirmButton>
      ) : (
        <button class="cts-big primary" onClick={start}>
          Start vote
        </button>
      )}
      {noms.length > 1 ? (
        <select value={chosen?.id ?? ''} onChange={(e) => setSel((e.currentTarget as HTMLSelectElement).value)}>
          {[...noms].reverse().map((n) => (
            <option key={n.id} value={n.id}>
              {label(n)}
            </option>
          ))}
        </select>
      ) : (
        chosen && <span class="muted">{label(chosen)}</span>
      )}
    </span>
  );
}

function BedtimeTimer({ view, send }: { view: StorytellerGameView; send: Send }) {
  const held = !!view.timerHeld;
  const rem = view.bedtimeRemainingMs;
  const s = rem !== null && rem !== undefined ? Math.max(0, Math.ceil(rem / 1000)) : null;
  return (
    <div class="cts-timer">
      <span class="cts-timer-label">
        Bedtime{view.bedtimeFirstNight ? ' → first night' : ''}:
      </span>
      {view.bedtimeOvertime ? (
        <span class="cts-chip visit">escorting stragglers</span>
      ) : held || view.timerPaused ? (
        <span class="cts-chip">
          {held ? 'held' : 'paused'}
          {s !== null && ` ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`}
        </span>
      ) : (
        <Countdown endsAt={view.phaseEndsAt} />
      )}
      <span class="cts-spacer" />
      {held ? (
        <button onClick={() => send({ type: 'bedtime_timer', action: 'resume' })}>▶ Resume</button>
      ) : (
        <button onClick={() => send({ type: 'bedtime_timer', action: 'pause' })}>❚❚ Hold</button>
      )}
      <button onClick={() => send({ type: 'bedtime_timer', action: 'extend', seconds: 15 })}>+15s</button>
      <button onClick={() => send({ type: 'bedtime_timer', action: 'extend', seconds: 30 })}>+30s</button>
      <button onClick={() => send({ type: 'bedtime_timer', action: 'restart', seconds: view.bedtimeSeconds ?? 45 })} title="Restart the full countdown">
        ↻ Restart
      </button>
      <ConfirmButton ask="Night now?" audience="Everyone will see this; stragglers are sent home." undo="yes" onConfirm={() => send({ type: 'force_phase', to: view.bedtimeFirstNight ? 'first_night' : 'night' })}>
        Night now
      </ConfirmButton>
    </div>
  );
}

// ---------------------------------------------------------------------------- stage tab

export function StageTab({ view, send, openComposer }: { view: StorytellerGameView; send: Send; openComposer: OpenComposer }) {
  const [selected, setSelected] = useState<number | null>(null);
  const sel = selected !== null && view.players.some((p) => p.seat === selected) ? selected : null;
  return (
    <div>
      {!view.stage && <p class="muted">Positions are not available yet (presence shows once the town reports it).</p>}
      <SeatCircle view={view} selected={sel} onSelect={(s) => setSelected(s === sel ? null : s)} />
      <p class="muted cts-legend">Click a player for actions. ✓ seated · ⌂ home · ❄ frozen · 👻 ghost vote · ☠ no vote · ⚖ on the block</p>
      {sel !== null && <PlayerCard key={sel} seat={sel} view={view} send={send} openComposer={openComposer} onClose={() => setSelected(null)} />}
      <VoteBox view={view} send={send} />
      <Doors view={view} send={send} />
    </div>
  );
}

function SeatCircle({ view, selected, onSelect }: { view: StorytellerGameView; selected: number | null; onSelect: (seat: number) => void }) {
  const W = 380;
  const H = 320;
  const cx = W / 2;
  const cy = H / 2;
  const R = 100;
  const seats = [...view.players].sort((a, b) => a.seat - b.seat);
  const n = Math.max(1, seats.length);
  const nom = runningVote(view) ?? null;
  const block = view.day && view.day.executedSeat === null ? view.day.onTheBlock : null;
  const stage = new Map((view.stage?.players ?? []).map((p) => [p.seat, p]));
  const grim = new Map(view.grimoire.map((g) => [g.seat, g]));
  const raised = new Set(nom?.handsRaised ?? []);
  const pos = (i: number, r: number) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), cos: Math.cos(a), sin: Math.sin(a) };
  };
  const handIdx = nom && nom.currentVoterSeat !== null ? seats.findIndex((p) => p.seat === nom.currentVoterSeat) : -1;
  return (
    <svg class="cts-circle" viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Seat circle">
      <ellipse cx={cx} cy={cy} rx={R} ry={R} class="cts-c-ring" />
      {handIdx >= 0 && <line x1={cx} y1={cy} x2={pos(handIdx, R - 14).x} y2={pos(handIdx, R - 14).y} class="cts-c-hand" />}
      <circle cx={cx} cy={cy} r={5} class="cts-c-hub" />
      <text x={cx} y={cy + 22} class="cts-c-centre">
        {nom ? `${nom.voteCount} / ${nom.threshold}` : view.gathering ? 'gathered' : ''}
      </text>
      {nom && (
        <text x={cx} y={cy + 36} class="cts-c-centre small">
          on {nameOf(view.players, nom.nomineeSeat)}
        </text>
      )}
      {seats.map((p, i) => {
        const node = pos(i, R);
        const lab = pos(i, R + 22);
        const st = stage.get(p.seat);
        const g = grim.get(p.seat);
        const vote = nom?.votes[p.seat];
        const anchor = lab.cos > 0.3 ? 'start' : lab.cos < -0.3 ? 'end' : 'middle';
        const ly = lab.sin < -0.5 ? lab.y - 10 : lab.sin > 0.5 ? lab.y + 4 : lab.y - 3;
        const cls = [
          'cts-c-seat',
          p.alive ? '' : 'dead',
          g ? g.alignment : '',
          selected === p.seat ? 'sel' : '',
          nom?.currentVoterSeat === p.seat ? 'voter' : '',
          vote === true ? 'yes' : vote === false ? 'no' : raised.has(p.seat) ? 'raised' : '',
          nom?.nomineeSeat === p.seat ? 'nominee' : '',
        ].join(' ');
        const name = p.name.length > 11 ? `${p.name.slice(0, 10)}…` : p.name;
        return (
          <g
            key={p.seat}
            class="cts-c-player"
            tabIndex={0}
            role="button"
            aria-label={`${seatLabel(view.players, p.seat)} — ${presenceText(st) || 'unknown'}`}
            onClick={() => onSelect(p.seat)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect(p.seat))}
          >
            <title>
              {seatLabel(view.players, p.seat)}
              {g ? ` — ${charName(g.character)} (${g.alignment})` : ''}
              {p.connected ? '' : ' — disconnected'}
            </title>
            <circle cx={node.x} cy={node.y} r={14} class={cls} />
            <text x={node.x} y={node.y + 4} class="cts-c-num">
              {p.seat + 1}
            </text>
            {!p.alive && (
              <text x={node.x - 14} y={node.y - 10} class="cts-c-mark">
                {p.ghostVoteAvailable ? '👻' : '☠'}
              </text>
            )}
            {st?.frozen && (
              <text x={node.x + 14} y={node.y - 10} class="cts-c-mark">
                ❄
              </text>
            )}
            {block?.seat === p.seat && (
              <text x={node.x + 14} y={node.y + 18} class="cts-c-mark">
                ⚖
              </text>
            )}
            {vote === true && (
              <text x={node.x - 14} y={node.y + 18} class="cts-c-mark">
                ✋
              </text>
            )}
            <text x={lab.x} y={ly} text-anchor={anchor} class={`cts-c-name ${p.connected ? '' : 'off'}`}>
              {name}
            </text>
            <text x={lab.x} y={ly + 11} text-anchor={anchor} class={`cts-c-pres ${st?.presence ?? ''}`}>
              {presenceText(st)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function VoteBox({ view, send }: { view: StorytellerGameView; send: Send }) {
  const d = view.day;
  const [blockVotes, setBlockVotes] = useState('');
  if (!d) return null;
  const nom = runningVote(view);
  const block = d.executedSeat === null ? d.onTheBlock : null;
  return (
    <div class="cts-votebox">
      {nom ? (
        <>
          <div>
            <b>Vote:</b> {seatLabel(view.players, nom.nominatorSeat)} nominated <b>{seatLabel(view.players, nom.nomineeSeat)}</b>
          </div>
          <div>
            Hand at <b>{nom.currentVoterSeat !== null ? seatLabel(view.players, nom.currentVoterSeat) : '—'}</b> · {nom.voteCount} vote{nom.voteCount === 1 ? '' : 's'} of{' '}
            {nom.threshold} needed
            {nom.handsRaised && nom.handsRaised.length > 0 && <span class="muted"> · raised: {nom.handsRaised.map((s) => s + 1).join(', ')}</span>}
          </div>
          <div class="cts-row cts-wrap">
            <button class="primary" onClick={() => send({ type: 'close_vote', mode: 'tally' })}>
              Close vote (tally)
            </button>
            <ConfirmButton ask="Discard this vote?" audience={EVERYONE} undo="yes" onConfirm={() => send({ type: 'close_vote', mode: 'cancel' })}>
              Cancel vote
            </ConfirmButton>
            <span class="muted">Set single votes from a player's card.</span>
          </div>
        </>
      ) : (
        <div class="muted">No vote running.</div>
      )}
      <div class="cts-row cts-wrap">
        {d.executedSeat !== null ? (
          <span>Executed today: {seatLabel(view.players, d.executedSeat)}</span>
        ) : block ? (
          <>
            <span>
              ⚖ On the block: <b>{seatLabel(view.players, block.seat)}</b> ({block.votes})
            </span>
            <ConfirmButton class="danger" ask={`Execute ${nameOf(view.players, block.seat)} now?`} audience={EVERYONE} effects={deathEffects(view, block.seat, 'execute')} undo="yes" onConfirm={() => send({ type: 'force_execute', seat: block.seat })}>
              Execute now
            </ConfirmButton>
            <ConfirmButton ask="Clear the block?" audience={EVERYONE} undo="yes" onConfirm={() => send({ type: 'set_block', seat: null })}>
              Clear block
            </ConfirmButton>
          </>
        ) : (
          <span class="muted">Nobody is on the block.</span>
        )}
        <ConfirmButton ask="Declare no execution today?" audience={EVERYONE} effects={noExecutionEffects(view)} undo="yes" onConfirm={() => send({ type: 'force_execute', seat: null })}>
          No execution
        </ConfirmButton>
      </div>
      {block && (
        <form
          class="cts-row"
          onSubmit={(e) => {
            e.preventDefault();
            const v = Math.round(Number(blockVotes));
            if (blockVotes !== '' && Number.isFinite(v)) send({ type: 'set_block', seat: block.seat, votes: Math.max(0, Math.min(30, v)) });
            setBlockVotes('');
          }}
        >
          <span class="muted">Block votes:</span>
          <input type="number" min={0} max={30} style={{ width: '56px' }} value={blockVotes} placeholder={String(block.votes)} onInput={(e) => setBlockVotes((e.currentTarget as HTMLInputElement).value)} />
          <button type="submit" disabled={blockVotes === ''}>
            Set
          </button>
        </form>
      )}
    </div>
  );
}

function Doors({ view, send }: { view: StorytellerGameView; send: Send }) {
  const doors = view.stage?.doors ?? {};
  const overrides = Object.keys(doors).length;
  return (
    <details class="cts-doors">
      <summary>
        Doors{overrides > 0 && <span class="cts-chip">{overrides} overridden</span>}
      </summary>
      <ul class="cts-list">
        {sortedBuildings(view.players).map((b) => {
          const cur = doors[b.id];
          const state = cur === true ? 'locked' : cur === false ? 'unlocked' : 'default';
          return (
            <li key={b.id}>
              <span class="cts-grow">{buildingLabel(b, view.players)}</span>
              <span class="cts-seg">
                {(['locked', 'default', 'unlocked'] as const).map((s) => (
                  <button key={s} class={state === s ? 'on' : ''} onClick={() => state !== s && send({ type: 'door_lock', buildingId: b.id, lock: s })}>
                    {s === 'locked' ? '🔒 Locked' : s === 'unlocked' ? 'Open' : 'Default'}
                  </button>
                ))}
              </span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

// --------------------------------------------------------------------------- player card

function PlayerCard({ seat, view, send, openComposer, onClose }: { seat: number; view: StorytellerGameView; send: Send; openComposer: OpenComposer; onClose: () => void }) {
  const p = view.players.find((x) => x.seat === seat)!;
  const g: GrimoireEntry | undefined = view.grimoire.find((x) => x.seat === seat);
  const st = view.stage?.players.find((x) => x.seat === seat);
  const who: Who = [seat];
  const [moveMode, setMoveMode] = useState<'teleport' | 'walk' | null>(null);
  const [editing, setEditing] = useState(false);
  const [newChar, setNewChar] = useState<CharacterId | ''>(g?.character ?? '');
  const [newAlign, setNewAlign] = useState<'good' | 'evil'>(g?.alignment ?? 'good');
  const [notify, setNotify] = useState(true);
  const [reminder, setReminder] = useState('');
  const [other, setOther] = useState<number | ''>('');
  const [startNow, setStartNow] = useState(true);
  const [blockVotes, setBlockVotes] = useState('');
  const night = view.phase === 'night' || view.phase === 'first_night' || view.phase === 'dawn';
  const over = view.phase === 'finished';
  const noms = view.day?.nominations ?? [];
  const voteNom = runningVote(view) ?? noms[noms.length - 1];
  const myVote = voteNom?.votes[seat];
  const others = view.players.filter((x) => x.seat !== seat);
  const nominate = (nominatorSeat: number, nomineeSeat: number) =>
    send({ type: 'create_nomination', nominatorSeat, nomineeSeat, startVote: startNow });
  return (
    <div class="cts-pcard" role="dialog" aria-label={`Actions for ${p.name}`}>
      <div class="cts-pcard-head">
        <span class="cts-seat">{seat + 1}</span>
        <span class="cts-name">{p.name}</span>
        {g && <span class={`cts-char cts-${g.alignment}`}>{charName(g.character)}</span>}
        {g && g.character !== g.believedCharacter && <span class="muted">thinks {charName(g.believedCharacter)}</span>}
        {g && <StatusBadges g={g} />}
        <span class={`cts-chip ${p.alive ? 'ok' : 'dead'}`}>{(g?.alive ?? p.alive) ? 'alive' : 'dead'}</span>
        {st && <span class="cts-chip">{presenceText(st)}</span>}
        {st?.frozen && <span class="cts-chip">❄ frozen</span>}
        {!p.connected && <span class="cts-chip dead">offline</span>}
        <span class="cts-spacer" />
        <button class="cts-icon" onClick={onClose} title="Close">
          ✕
        </button>
      </div>

      <div class="cts-pcard-sec">
        <span class="cts-sec">Move</span>
        <button class={moveMode === 'teleport' ? 'on' : ''} onClick={() => setMoveMode(moveMode === 'teleport' ? null : 'teleport')}>
          Teleport…
        </button>
        <button class={moveMode === 'walk' ? 'on' : ''} onClick={() => setMoveMode(moveMode === 'walk' ? null : 'walk')}>
          Walk to…
        </button>
        {st?.presence === 'escorted' && <button onClick={() => send({ type: 'walk_to', who, to: null })}>Stop walk</button>}
        <button class={st?.frozen ? 'on' : ''} onClick={() => send({ type: 'freeze', who, frozen: !st?.frozen })}>
          {st?.frozen ? 'Unfreeze' : '❄ Freeze'}
        </button>
        <button onClick={() => send({ type: 'visit_home', seat })} title="Fast-travel yourself into their home">
          Visit home
        </button>
      </div>
      {moveMode && (
        <TargetPicker
          view={view}
          verb={moveMode === 'teleport' ? `Teleport ${p.name}` : `Walk ${p.name}`}
          mapLabel={`Click the map: ${moveMode === 'teleport' ? 'teleport' : 'walk'} ${whoLabel(who, view.players)} there`}
          onPick={(to) => {
            send(moveMode === 'teleport' ? { type: 'teleport', who, to } : { type: 'walk_to', who, to });
            setMoveMode(null);
          }}
        />
      )}

      {!over && (
        <div class="cts-pcard-sec">
          <span class="cts-sec">Life</span>
          {(g?.alive ?? p.alive) ? (
            <>
              <ConfirmButton
                class="danger"
                disabled={view.phase === 'setup'}
                ask={`Kill ${p.name}?`}
                audience={night ? 'Announced at dawn: everyone will see it then.' : EVERYONE}
                effects={deathEffects(view, seat, 'kill')}
                undo="yes"
                onConfirm={() => send({ type: 'kill', seat, announce: !night })}
              >
                Kill
              </ConfirmButton>
              <ConfirmButton ask={`Mark ${p.name} dead (no triggers)?`} audience={night ? 'Players learn of it at dawn.' : EVERYONE} undo="yes" onConfirm={() => send({ type: 'set_alive', seat, alive: false })}>
                Force dead
              </ConfirmButton>
            </>
          ) : (
            <>
              <button onClick={() => send({ type: 'set_alive', seat, alive: true })}>Revive</button>
              {!p.ghostVoteAvailable && <button onClick={() => send({ type: 'set_alive', seat, alive: true, restoreGhostVote: true })}>Revive + vote back</button>}
            </>
          )}
          {g && (
            <>
              <Toggle on={g.ghostVoteAvailable} label="Ghost vote" onClick={() => send({ type: 'set_ghost_vote', seat, available: !g.ghostVoteAvailable })} />
              <Toggle on={g.poisoned} label="Poisoned" onClick={() => send({ type: 'set_status', seat, poisoned: !g.poisoned })} />
              <Toggle on={g.drunk} label="Drunk" disabled={g.character === 'drunk'} onClick={() => send({ type: 'set_status', seat, drunk: !g.drunk })} />
              <Toggle on={g.protectedTonight} label="Protected" onClick={() => send({ type: 'set_status', seat, protectedTonight: !g.protectedTonight })} />
            </>
          )}
        </div>
      )}

      {g && !over && (
        <div class="cts-pcard-sec">
          <span class="cts-sec">Grimoire</span>
          <button class={editing ? 'on' : ''} onClick={() => setEditing(!editing)}>
            Change character…
          </button>
          {g.reminders.map((r) => (
            <span class="cts-chip rem" key={r}>
              {r}
              <button class="cts-x" title="Remove reminder" onClick={() => send({ type: 'remove_reminder', seat, token: r })}>
                ×
              </button>
            </span>
          ))}
          <form
            class="cts-inline"
            onSubmit={(e) => {
              e.preventDefault();
              const t = reminder.trim();
              if (t) send({ type: 'add_reminder', seat, token: t.slice(0, 40) });
              setReminder('');
            }}
          >
            <input value={reminder} maxLength={40} placeholder="+ reminder" onInput={(e) => setReminder((e.currentTarget as HTMLInputElement).value)} />
          </form>
        </div>
      )}
      {g && editing && !over && (
        <div class="cts-grim-edit">
          <CharacterSelect
            value={newChar}
            onChange={(c) => {
              setNewChar(c);
              if (c) setNewAlign(CHARACTER_INFO[c].alignment);
            }}
          />
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
              send({ type: 'change_character', seat, character: newChar, alignment: newAlign, notify });
              setEditing(false);
            }}
          >
            Apply
          </button>
        </div>
      )}

      {!over && (
        <div class="cts-pcard-sec">
          <span class="cts-sec">Tell</span>
          <button onClick={() => openComposer({ seat, mode: 'info' })}>Send info…</button>
          <button onClick={() => openComposer({ seat, mode: 'prompt' })}>Prompt…</button>
          <span class="muted">private: only {p.name} sees it</span>
        </div>
      )}
      {!over && g && ((g.sentPrompts?.length ?? 0) > 0 || (g.info?.length ?? 0) > 0) && (
        <div class="cts-resend">
          {g.openPrompts && g.openPrompts.length > 0 && <div class="muted">Open prompts: {g.openPrompts.map((x) => x.title).join(' · ')}</div>}
          {[...(g.sentPrompts ?? [])].slice(-4).reverse().map((sp) => (
            <div key={`p${sp.id}`} class="cts-resend-row">
              <span class="cts-chip">{sp.open ? 'open' : 'answered'}</span>
              <span class="cts-grow">Prompt: {sp.title}</span>
              <ConfirmButton class="cts-link" ask="Re-send this prompt?" audience={only(view.players, seat)} onConfirm={() => send({ type: 'resend_prompt', seat, promptId: sp.id })}>
                re-send
              </ConfirmButton>
            </div>
          ))}
          {[...(g.info ?? [])].slice(-4).reverse().map((i) => (
            <div key={`i${i.id}`} class="cts-resend-row">
              <span class="cts-chip">info</span>
              <span class="cts-grow" title={i.text}>
                {i.text.length > 60 ? `${i.text.slice(0, 59)}…` : i.text}
              </span>
              <ConfirmButton class="cts-link" ask="Re-send this info?" audience={only(view.players, seat)} onConfirm={() => send({ type: 'resend_info', seat, infoId: i.id })}>
                re-send
              </ConfirmButton>
            </div>
          ))}
        </div>
      )}

      {!over && view.phase !== 'setup' && (
        <>
          <div class="cts-pcard-sec">
            <span class="cts-sec">Nominate</span>
            <select value={other} onChange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; setOther(v === '' ? '' : Number(v)); }}>
              <option value="">other player…</option>
              {others.map((x) => (
                <option key={x.seat} value={x.seat}>
                  {seatLabel(view.players, x.seat)}
                </option>
              ))}
            </select>
            <button disabled={other === ''} onClick={() => other !== '' && nominate(seat, other)} title={`${p.name} nominates the chosen player`}>
              {p.name} nominates them
            </button>
            <button disabled={other === ''} onClick={() => other !== '' && nominate(other, seat)} title={`The chosen player nominates ${p.name}`}>
              They nominate {p.name}
            </button>
            <label class="cts-check">
              <input type="checkbox" checked={startNow} onChange={(e) => setStartNow((e.currentTarget as HTMLInputElement).checked)} /> start vote
            </label>
          </div>
          <div class="cts-pcard-sec">
            <span class="cts-sec">Block</span>
            <input type="number" min={0} max={30} style={{ width: '52px' }} placeholder="votes" value={blockVotes} onInput={(e) => setBlockVotes((e.currentTarget as HTMLInputElement).value)} />
            <ConfirmButton
              ask={`Put ${p.name} on the block?`}
              audience={EVERYONE}
              undo="yes"
              onConfirm={() => {
                const v = Math.round(Number(blockVotes));
                send(blockVotes !== '' && Number.isFinite(v) ? { type: 'set_block', seat, votes: Math.max(0, Math.min(30, v)) } : { type: 'set_block', seat });
              }}
            >
              Put on block
            </ConfirmButton>
            <ConfirmButton class="danger" ask={`Execute ${p.name} now?`} audience={EVERYONE} effects={deathEffects(view, seat, 'execute')} undo="yes" onConfirm={() => send({ type: 'force_execute', seat })}>
              Execute
            </ConfirmButton>
          </div>
          {voteNom && (
            <div class="cts-pcard-sec">
              <span class="cts-sec">Vote</span>
              <span class="muted">
                on {nameOf(view.players, voteNom.nomineeSeat)} ({voteNom.status}): {myVote === true ? 'yes' : myVote === false ? 'no' : '—'}
              </span>
              <button class={myVote === true ? 'on' : ''} onClick={() => send({ type: 'set_vote', nominationId: voteNom.id, seat, vote: true })}>
                Yes
              </button>
              <button class={myVote === false ? 'on' : ''} onClick={() => send({ type: 'set_vote', nominationId: voteNom.id, seat, vote: false })}>
                No
              </button>
              {myVote === true && (
                <ConfirmButton ask="Strike this vote?" audience={EVERYONE} undo="yes" onConfirm={() => send({ type: 'strike_vote', nominationId: voteNom.id, seat })}>
                  Strike
                </ConfirmButton>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function Toggle({ on, label, onClick, disabled }: { on: boolean; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button class={`cts-toggle ${on ? 'on' : ''}`} disabled={disabled} onClick={onClick} aria-pressed={on}>
      {label}
    </button>
  );
}

/** At-a-glance status badges (only the ones that are true). */
export function StatusBadges({ g }: { g: GrimoireEntry }) {
  return (
    <span class="cts-badges">
      {g.poisoned && <span class="cts-b poison" title="Poisoned">☠︎ poisoned</span>}
      {(g.drunk || g.character === 'drunk') && <span class="cts-b drunk" title="Drunk">🍺 drunk</span>}
      {g.protectedTonight && <span class="cts-b prot" title="Protected tonight (Monk)">🛡 protected</span>}
      {!g.alive && !g.ghostVoteAvailable && <span class="cts-b" title="Ghost vote spent">vote spent</span>}
      {g.isRedHerring && <span class="cts-b" title="Fortune Teller's red herring">red herring</span>}
      {g.isButlerMaster && <span class="cts-b" title="The Butler's master">master</span>}
      {g.abilityUsed && <span class="cts-b" title="Once-per-game ability used">used</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------- pick banner

/** Shown while the Storyteller is choosing a point on the map. */
export function PickBanner() {
  const pick = useStore(stagePick);
  if (!pick) return null;
  return (
    <div class="cts-pick" role="status">
      <span>⌖ {pick.label}</span>
      <span class="muted">(Esc cancels)</span>
      <button onClick={() => stagePick.set(null)}>Cancel</button>
    </div>
  );
}
