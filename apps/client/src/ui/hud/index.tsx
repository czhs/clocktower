// OWNED BY rules-storyteller. (gameplay) "The world does the talking": the player HUD is mostly
// collapsed — a tiny phase pill (top-right), a character/house chip (top-left) that expands on hover
// or click, one fading context hint, and prompt / vote cards docked on the right only while
// actionable. The Storyteller's view lives in the ST panel (this HUD only adds toasts + endgame).
// Player HUD: phase/countdown, own role card, Alive/Dead, May nominate?,
// ghost vote, player list, nominations + clock-hand voting, ST prompts, private info log,
// announcements and the endgame reveal. All text is rendered through Preact (auto-escaped).
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  CHARACTER_INFO,
  type AccountView,
  type AnnouncementView,
  type CharacterId,
  type GameResult,
  type NominationView,
  type PlayerGameView,
  type PromptView,
  type PublicPlayerView,
} from '@ct/protocol';
import type { RoomConnection } from '../../net/room';
import { useStore, useStoreSelector } from '../../net/store';
import { townSays } from '../clock/logic';
import { charName, CharacterSelect, Countdown, friendlyError, goHome, nameOf, PHASE_LABEL, phaseTitle, seatLabel, VoteClock } from './shared';
import { homeOf, MoveHint } from './hints';
import { chooseLine, ownOutcome, shortcutAllowed, storedPttCode, voteMark } from './logic';
import './hud.css';

export function Hud({ conn }: { conn: RoomConnection; account: AccountView }) {
  const view = useStore(conn.gameView);
  // (qol) Only "may I start another game?" from the lobby view: no re-render on chat / members.
  const canRematch = useStoreSelector(conn.lobbyView, (l) => {
    const me = l?.members.find((m) => m.pid === l.youPid);
    return !!me && (me.role === 'storyteller' || me.isHost);
  });
  if (!view) return null;
  return (
    <div class="cth">
      <Toasts conn={conn} />
      {view.kind === 'player' && <PlayerHud view={view} conn={conn} />}
      {view.result && (
        <Endgame result={view.result} key={view.result.reason} seat={view.kind === 'player' ? view.you.seat : null} canRematch={canRematch} />
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------- phase bar

/** Tiny phase / time pill (e.g. "Day 2 ☼", "Bedtime 🔔 0:23"). */
function PhaseBar({ view }: { view: PlayerGameView }) {
  const night = view.phase === 'night' || view.phase === 'first_night';
  return (
    <div class={`cth-phase cth-phase-${view.phase}`} title={view.gathering && view.phase === 'day' ? 'The town is gathered in the circle' : undefined}>
      <span class="cth-phase-name">{phaseTitle(view.phase, view.dayNumber)}</span>
      <span class="cth-phase-icon" aria-hidden="true">
        {night ? '☾' : view.phase === 'bedtime' ? '🔔' : view.phase === 'dawn' ? '☀' : view.phase === 'day' ? (view.gathering ? '◯' : '☼') : '✦'}
      </span>
      {view.phaseEndsAt !== null && <Countdown endsAt={view.phaseEndsAt} />}
      {view.storytellerVisitingYou && <span class="cth-visit" title="The Storyteller is in your home: private">🕯</span>}
    </div>
  );
}

/** Short-lived announcement toasts (public cues) + rejected player actions. */
function Toasts({ conn }: { conn: RoomConnection }) {
  const [items, setItems] = useState<{ id: string; kind: string; text: string }[]>([]);
  useEffect(() => {
    let seq = 0;
    const push = (item: { id: string; kind: string; text: string }) => {
      setItems((x) => [...x.filter((y) => y.id !== item.id).slice(-2), item]);
      // (qol) refusals linger a little longer: they explain why a tap did nothing
      setTimeout(() => setItems((x) => x.filter((y) => y.id !== item.id)), item.kind === 'error' ? 9000 : 7000);
    };
    const offA = conn.events.on('announcement', (a: AnnouncementView) => push({ id: a.id, kind: a.kind, text: a.text }));
    const offE = conn.events.on('error', (e) => {
      if (e.for?.startsWith('game:')) push({ id: `err${++seq}`, kind: 'error', text: friendlyError(e.message) });
    });
    return () => {
      offA();
      offE();
    };
  }, [conn]);
  if (!items.length) return null;
  return (
    <div class="cth-toasts" aria-live="polite">
      {items.map((a) => (
        <div class={`cth-toast cth-toast-${a.kind}`} key={a.id} role={a.kind === 'error' ? 'alert' : undefined}>
          <span>{a.text}</span>
          {/* (qol) a toast can cover the clock / vote cards: tap ✕ to clear it right away */}
          <button class="cth-toast-x" aria-label="Dismiss" onClick={() => setItems((x) => x.filter((y) => y.id !== a.id))}>
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------------------ player HUD

type Tab = 'players' | 'info' | 'town' | 'grimoire';

function PlayerHud({ view, conn }: { view: PlayerGameView; conn: RoomConnection }) {
  const [pinned, setPinned] = useState(false);
  const pinnedRef = useRef(pinned);
  pinnedRef.current = pinned;
  const [hover, setHover] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const open = pinned || hover;
  const [tab, setTab] = useState<Tab>('players');
  const you = view.you;
  const lastInfo = view.info.length;
  const [seenInfo, setSeenInfo] = useState(lastInfo);
  useEffect(() => {
    if (tab === 'info') setSeenInfo(lastInfo);
  }, [tab, lastInfo]);
  const unread = lastInfo - seenInfo;
  // Nominations/votes only act during the day (the day view lingers into bedtime/finished, where a
  // pending or interrupted 'voting' nomination can no longer be voted on or started).
  const activeNom =
    view.phase === 'day' ? view.day?.nominations.find((n) => n.status === 'voting' || n.status === 'pending') : undefined;

  const home = homeOf(you.seat);
  const me = you.seat;
  const locked = !!activeNom && me in activeNom.votes;

  // (qol) C toggles the character card (your ability, team, Town list) from anywhere in the town.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyC') return;
      const modalOpen = !!document.querySelector('[aria-modal="true"]');
      if (!shortcutAllowed(e, document.activeElement as HTMLElement | null, { modalOpen, pttCode: storedPttCode() })) return;
      e.preventDefault();
      const next = !pinnedRef.current;
      setPinned(next);
      if (!next) setHover(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <>
      <MoveHint view={view} conn={conn} />
      <aside
        class={`cth-card${open ? '' : ' cth-card-closed'}`}
        onMouseEnter={() => {
          if (leaveTimer.current) clearTimeout(leaveTimer.current);
          setHover(true);
        }}
        onMouseLeave={() => {
          // Small grace period (native selects / brief slips off the edge).
          leaveTimer.current = setTimeout(() => setHover(false), 350);
        }}
      >
        <button
          class="cth-card-head"
          onClick={() => {
            // Hover opens it; a click pins it open; a second click collapses it.
            if (pinned) {
              setPinned(false);
              setHover(false);
            } else setPinned(true);
          }}
          aria-expanded={open}
          title={pinned ? 'Collapse (C)' : 'Your character and house (click or press C to keep open)'}
        >
          <RoleBadge view={view} />
          {home && <span class="cth-chip cth-house">⌂ {home.name}</span>}
          {!you.alive && <span class="cth-chip dead">{you.ghostVoteAvailable ? 'Dead · 👻 1 vote' : 'Dead'}</span>}
          {unread > 0 && <span class="cth-badge" title="New private notes">{unread}</span>}
          {pinned && <span class="cth-pin" aria-hidden="true">▴</span>}
        </button>
        {open && (
          <>
            <RoleCard view={view} />
            <div class="cth-status">
              <span class={`cth-chip ${you.alive ? 'ok' : 'dead'}`}>{you.alive ? 'Alive' : 'Dead'}</span>
              <span class="cth-chip" title="Your seat in the circle">Seat {you.seat + 1}</span>
              <span class={`cth-chip ${you.canNominate ? 'ok' : ''}`}>May nominate? {you.canNominate ? 'Yes' : 'No'}</span>
              <span
                class={`cth-chip ${you.ghostVoteAvailable ? 'ok' : 'dead'}`}
                title={you.alive ? 'Living players vote freely; once dead you get one ghost vote.' : undefined}
              >
                Ghost vote {you.ghostVoteAvailable ? 'available' : 'spent'}
              </span>
            </div>
            <nav class="cth-tabs" aria-label="Character card sections">
              <button class={tab === 'players' ? 'on' : ''} aria-pressed={tab === 'players'} onClick={() => setTab('players')} title="Everyone in the circle: nominate from here">
                Town
              </button>
              <button class={tab === 'info' ? 'on' : ''} aria-pressed={tab === 'info'} onClick={() => setTab('info')} title="What the Storyteller told only you">
                Notes{unread > 0 && <span class="cth-badge">{unread}</span>}
              </button>
              <button class={tab === 'town' ? 'on' : ''} aria-pressed={tab === 'town'} onClick={() => setTab('town')} title="Public announcements so far">
                Crier
              </button>
              {view.spyGrimoire && (
                <button class={tab === 'grimoire' ? 'on' : ''} aria-pressed={tab === 'grimoire'} onClick={() => setTab('grimoire')}>
                  Grimoire
                </button>
              )}
            </nav>
            <div class="cth-tabbody">
              {tab === 'players' && <PlayerList view={view} conn={conn} />}
              {tab === 'info' && <InfoLog view={view} />}
              {tab === 'town' && <AnnouncementLog items={view.announcements} />}
              {tab === 'grimoire' && view.spyGrimoire && <SpyGrimoire view={view} />}
            </div>
          </>
        )}
      </aside>
      <div class="cth-dock">
        <PhaseBar view={view} />
        {view.prompts.length > 0 && <PromptCard key={view.prompts[0]!.id} prompt={view.prompts[0]!} view={view} conn={conn} />}
        {activeNom && <VotePanel key={`${activeNom.id}-${activeNom.status}-${locked}`} nom={activeNom} view={view} conn={conn} />}
        {!activeNom && <RecentVote view={view} />}
        {!activeNom && view.day?.onTheBlock && view.phase === 'day' && (
          <div class="cth-block">
            ⚖ <b>{nameOf(view.players, view.day.onTheBlock.seat)}</b> is on the block ({view.day.onTheBlock.votes})
          </div>
        )}
      </div>
    </>
  );
}

function RoleBadge({ view }: { view: PlayerGameView }) {
  const role = view.you.role;
  if (!role) return <span class="cth-role-name muted">Awaiting your character…</span>;
  return (
    <span class={`cth-role-name cth-${role.alignment}`}>
      {charName(role.character)} <small>({role.characterType})</small>
    </span>
  );
}

function RoleCard({ view }: { view: PlayerGameView }) {
  const role = view.you.role;
  if (!role) return <p class="cth-ability muted">{townSays('The Storyteller is preparing the Grimoire. Your character arrives with the first night.', view.storytellerMode)}</p>;
  const team = view.you.evilTeam;
  return (
    <div class="cth-rolecard">
      <p class="cth-ability">{CHARACTER_INFO[role.character].ability}</p>
      <p class={`cth-align cth-${role.alignment}`}>You are {role.alignment === 'good' ? 'Good' : 'Evil'}.</p>
      {view.you.butlerMasterSeat !== undefined && view.you.butlerMasterSeat !== null && (
        <p class="cth-note">Your master: {seatLabel(view.players, view.you.butlerMasterSeat)}</p>
      )}
      {team && (
        <div class="cth-evil">
          <div>
            Demon: {team.demonSeats.map((s) => seatLabel(view.players, s)).join(', ') || '—'}
          </div>
          <div>
            Minions: {team.minionSeats.map((s) => seatLabel(view.players, s)).join(', ') || '—'}
          </div>
          {team.bluffs.length > 0 && <div>Not in play (bluffs): {team.bluffs.map(charName).join(', ')}</div>}
        </div>
      )}
    </div>
  );
}

/**
 * (qol) Two-step button for irreversible actions: the first tap arms it ("Confirm" + ✕), the second
 * sends. It disarms by itself after a few seconds, on ✕ or on Escape.
 */
function ArmButton(props: { label: string; confirmLabel: string; armedAria: string; onConfirm: () => void; disabled?: boolean; title?: string }) {
  const [armed, setArmed] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  // Focus moves to Confirm only for keyboard users (a mouse/touch click has detail >= 1): a later
  // Enter meant for the chat must not confirm a nomination by accident.
  const byKeyboard = useRef(false);
  useEffect(() => {
    if (!armed) return;
    if (byKeyboard.current) confirmRef.current?.focus({ preventScroll: true });
    const t = setTimeout(() => setArmed(false), 6000);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), setArmed(false));
    window.addEventListener('keydown', esc, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', esc, true);
    };
  }, [armed]);
  useEffect(() => {
    if (props.disabled) setArmed(false);
  }, [props.disabled]);
  if (!armed)
    return (
      <button
        class="cth-small"
        disabled={props.disabled}
        title={props.title}
        onClick={(e) => {
          byKeyboard.current = e.detail === 0;
          setArmed(true);
        }}
      >
        {props.label}
      </button>
    );
  return (
    <span class="cth-arm" role="group" aria-label={props.armedAria}>
      <button
        ref={confirmRef}
        class="cth-small primary"
        aria-label={props.armedAria}
        onClick={() => {
          setArmed(false);
          props.onConfirm();
        }}
      >
        {props.confirmLabel}
      </button>
      <button class="cth-small" aria-label="Cancel" onClick={() => setArmed(false)}>
        ✕
      </button>
    </span>
  );
}

const MARK: Record<'yes' | 'no' | 'raised', { glyph: string; title: string }> = {
  yes: { glyph: '✓', title: 'Voted yes' },
  no: { glyph: '·', title: 'Hand down: no vote' },
  raised: { glyph: '✋', title: 'Hand raised' },
};

function PlayerList({ view, conn }: { view: PlayerGameView; conn: RoomConnection }) {
  const [shootAt, setShootAt] = useState<number | null>(null);
  const nominationsOpen = view.day?.nominationsOpen ?? false;
  const active = view.phase === 'day' ? view.day?.nominations.find((n) => n.status === 'voting' || n.status === 'pending') : undefined;
  const busy = !!active;
  const canNominate = view.phase === 'day' && view.you.canNominate && nominationsOpen && !busy;
  return (
    <div>
      {active && (
        <p class="cth-note cth-listvote">
          ⚖ Vote on <b>{nameOf(view.players, active.nomineeSeat)}</b>: {active.voteCount} / {active.threshold}
        </p>
      )}
      <ul class="cth-players">
        {view.players.map((p) => {
          const mark = voteMark(active, p.seat);
          return (
            <li key={p.seat} class={`${p.alive ? '' : 'dead'} ${p.seat === view.you.seat ? 'me' : ''}`}>
              <span class="cth-seat">{p.seat + 1}</span>
              <span class="cth-pname">
                {p.name}
                {p.seat === view.you.seat && <span class="muted"> (you)</span>}
              </span>
              {!p.alive && <span title={p.ghostVoteAvailable ? 'Dead — ghost vote available' : 'Dead — ghost vote spent'}>{p.ghostVoteAvailable ? '👻' : '☠'}</span>}
              {!p.connected && <span class="muted" title="Disconnected">⚡</span>}
              {p.nominatedToday && <span class="cth-mini" title="Has nominated today">N</span>}
              {p.wasNominatedToday && <span class="cth-mini" title="Was nominated today">⚖</span>}
              {mark && (
                <span class={`cth-vmark ${mark}`} title={MARK[mark].title} aria-label={MARK[mark].title}>
                  {MARK[mark].glyph}
                </span>
              )}
              <span class="cth-spacer" />
              {canNominate && !p.wasNominatedToday && (
                <ArmButton
                  label="Nominate"
                  confirmLabel="Confirm"
                  armedAria={`Confirm nominating ${p.name}`}
                  title={`Nominate ${p.name} (you can nominate once per day)`}
                  onConfirm={() => conn.send('game:nominate', { nomineeSeat: p.seat })}
                />
              )}
            </li>
          );
        })}
      </ul>
      {view.phase === 'day' && view.you.canNominate && nominationsOpen && busy && (
        <p class="muted cth-note">You can nominate once this vote is over.</p>
      )}
      {view.phase === 'day' && view.you.canSlayerShot && (
        <div class="cth-slayer">
          <span>Public Slayer shot:</span>
          <select
            value={shootAt ?? ''}
            onChange={(e) => {
              const v = (e.currentTarget as HTMLSelectElement).value;
              setShootAt(v === '' ? null : Number(v));
            }}
          >
            <option value="">choose…</option>
            {view.players
              .filter((p) => p.alive)
              .map((p) => (
                <option value={p.seat} key={p.seat}>
                  {seatLabel(view.players, p.seat)}
                </option>
              ))}
          </select>
          <ArmButton
            label="Shoot"
            confirmLabel="Shoot — one shot only"
            armedAria={shootAt === null ? 'Shoot' : `Publicly claim Slayer and shoot ${nameOf(view.players, shootAt)}: you only get one shot`}
            disabled={shootAt === null}
            onConfirm={() => {
              if (shootAt === null) return;
              conn.send('game:slayerShot', { targetSeat: shootAt });
              setShootAt(null);
            }}
          />
        </div>
      )}
      {view.phase === 'day' && !nominationsOpen && (
        <p class="muted cth-note">{view.storytellerMode === 'auto' ? 'Nominations are closed: the town clock opens them.' : 'Nominations are closed: the Storyteller opens them.'}</p>
      )}
      {view.phase !== 'day' && view.phase !== 'finished' && <p class="muted cth-note">Nominations happen during the day.</p>}
    </div>
  );
}

function InfoLog({ view }: { view: PlayerGameView }) {
  if (!view.info.length) return <p class="muted">No private information yet.</p>;
  return (
    <ol class="cth-log">
      {[...view.info].reverse().map((i) => (
        <li key={i.id}>
          <small class="muted">{i.phase === 'day' || i.phase === 'bedtime' ? `Day ${i.day}` : PHASE_LABEL[i.phase]}</small>
          <div>{i.text}</div>
          {(i.seats?.length || i.characters?.length || i.number !== undefined || i.yes !== undefined) && (
            <div class="cth-infodata">
              {i.seats?.map((s) => (
                <span class="cth-chip" key={`s${s}`}>
                  {seatLabel(view.players, s)}
                </span>
              ))}
              {i.characters?.map((c) => (
                <span class="cth-chip" key={`c${c}`}>
                  {charName(c)}
                </span>
              ))}
              {i.number !== undefined && <span class="cth-chip">{i.number}</span>}
              {i.yes !== undefined && <span class="cth-chip">{i.yes ? 'Yes' : 'No'}</span>}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

function AnnouncementLog({ items }: { items: AnnouncementView[] }) {
  if (!items.length) return <p class="muted">Nothing announced yet.</p>;
  return (
    <ol class="cth-log">
      {[...items].reverse().map((a) => (
        <li key={a.id} class={`cth-ann-${a.kind}`}>
          {a.text}
        </li>
      ))}
    </ol>
  );
}

function SpyGrimoire({ view }: { view: PlayerGameView }) {
  const g = view.spyGrimoire!;
  return (
    <div>
      <p class="muted">As seen on night {g.night}.</p>
      <table class="cth-table">
        <tbody>
          {g.entries.map((e) => (
            <tr key={e.seat} class={e.alive ? '' : 'dead'}>
              <td>{e.seat + 1}</td>
              <td>{e.name}</td>
              <td class={`cth-${e.alignment}`}>{charName(e.character)}</td>
              <td>
                {e.poisoned && <span class="cth-chip">poisoned</span>}
                {e.drunk && <span class="cth-chip">drunk</span>}
                {e.reminders.map((r) => (
                  <span class="cth-chip" key={r}>
                    {r}
                  </span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --------------------------------------------------------------------------------- prompts

function PromptCard({ prompt, view, conn }: { prompt: PromptView; view: PlayerGameView; conn: RoomConnection }) {
  const [seats, setSeats] = useState<number[]>([]);
  const [character, setCharacter] = useState<CharacterId | ''>('');
  const min = prompt.minTargets ?? 1;
  const max = prompt.maxTargets ?? min;
  // Mirrors the server check: a missing allowSelf/allowDead means "not allowed"; dead = publicly dead.
  const eligible = (p: PublicPlayerView) =>
    (!!prompt.allowSelf || p.seat !== view.you.seat) && (!!prompt.allowDead || p.alive);
  const toggle = (s: number) =>
    setSeats((x) => (x.includes(s) ? x.filter((y) => y !== s) : max === 1 ? [s] : x.length >= max ? x : [...x, s]));
  // (qol) One answer per prompt: buttons lock after a tap until the prompt goes away (the card is
  // keyed by prompt id) — or come back after a refusal / a slow server, so nothing double-sends.
  const [sent, setSent] = useState(false);
  useEffect(() => {
    if (!sent) return;
    const t = setTimeout(() => setSent(false), 6000);
    const off = conn.events.on('error', (e) => e.for === 'game:promptResponse' && setSent(false));
    return () => {
      clearTimeout(t);
      off();
    };
  }, [sent, conn]);
  const answer = (body: { seats?: number[]; character?: CharacterId; yes?: boolean }) => {
    if (sent) return;
    setSent(true);
    conn.send('game:promptResponse', { promptId: prompt.id, ...body });
  };
  return (
    <div class="cth-prompt" role="dialog" aria-label={prompt.title} aria-busy={sent}>
      <h3>{prompt.title}</h3>
      {prompt.body && <p>{prompt.body}</p>}
      {prompt.kind === 'choose_players' && (
        <>
          <p class="muted">{chooseLine(min, max, seats.length)}</p>
          <div class="cth-choices">
            {view.players.filter(eligible).map((p) => (
              <button key={p.seat} class={seats.includes(p.seat) ? 'on' : ''} aria-pressed={seats.includes(p.seat)} disabled={sent} onClick={() => toggle(p.seat)}>
                {seatLabel(view.players, p.seat)}
                {p.seat === view.you.seat ? ' (you)' : ''}
              </button>
            ))}
          </div>
          <button class="primary" disabled={sent || seats.length < min || seats.length > max} onClick={() => answer({ seats })}>
            Confirm
          </button>
        </>
      )}
      {prompt.kind === 'choose_character' && (
        <>
          <CharacterSelect value={character} onChange={setCharacter} allowEmpty only={prompt.characterOptions} />
          <button class="primary" disabled={sent || !character} onClick={() => character && answer({ character })}>
            Confirm
          </button>
        </>
      )}
      {prompt.kind === 'yes_no' && (
        <div class="cth-row">
          <button class="primary" disabled={sent} onClick={() => answer({ yes: true })}>
            Yes
          </button>
          <button disabled={sent} onClick={() => answer({ yes: false })}>
            No
          </button>
        </div>
      )}
      {prompt.kind === 'acknowledge' && (
        <button class="primary" disabled={sent} onClick={() => answer({})}>
          OK
        </button>
      )}
      {sent && <p class="muted" role="status">Sent…</p>}
      {view.prompts.length > 1 && <p class="muted">+{view.prompts.length - 1} more after this</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------------- voting

function VoteSummary({ nom, players, me }: { nom: NominationView; players: PublicPlayerView[]; me?: number }) {
  const reached = nom.voteCount >= nom.threshold;
  return (
    <div class="cth-vote-sum">
      <div>
        <b>{nameOf(players, nom.nominatorSeat)}</b> nominated <b class="cth-nominee">{nameOf(players, nom.nomineeSeat)}</b>
      </div>
      {nom.status === 'pending' ? (
        <div class="muted">Vote soon: raise your hand now if you want to vote</div>
      ) : (
        <>
          <div class={`cth-tally${reached ? ' reached' : ''}`}>
            {nom.voteCount} / {nom.threshold} votes {reached ? '— enough for the block' : 'needed'}
          </div>
          {nom.currentVoterSeat !== null && (
            <div class={nom.currentVoterSeat === me ? 'cth-yourturn' : 'muted'}>
              {nom.currentVoterSeat === me ? 'The clock hand is on you' : `Clock hand: ${nameOf(players, nom.currentVoterSeat)}`}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function VotePanel({ nom, view, conn }: { nom: NominationView; view: PlayerGameView; conn: RoomConnection }) {
  const me = view.you.seat;
  const locked = me in nom.votes;
  const raised = (nom.handsRaised ?? []).includes(me);
  const canVote = view.you.alive || view.you.ghostVoteAvailable;
  const isButler = view.you.role?.character === 'butler';
  // Seats until the clock hand reaches you (clockwise by seat number), `stepMs` per seat.
  const order = [...view.players].map((p) => p.seat).sort((a, b) => a - b);
  const cur = nom.currentVoterSeat === null ? -1 : order.indexOf(nom.currentVoterSeat);
  const mine = order.indexOf(me);
  const away = cur >= 0 && mine >= 0 ? (mine - cur + order.length) % order.length : null;
  const stepS = (nom.stepMs ?? 3000) / 1000;
  // Expanded while the vote needs you (pending or running, your seat not locked yet); otherwise a pill.
  const [manual, setManual] = useState<boolean | null>(null);
  const expanded = manual ?? (!locked && canVote);
  // (qol) H raises / lowers your hand without reaching for the mouse (until the hand passes you).
  const live = (nom.status === 'voting' || nom.status === 'pending') && !locked && canVote;
  useEffect(() => {
    if (!live) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyH') return;
      const modalOpen = !!document.querySelector('[aria-modal="true"]');
      if (!shortcutAllowed(e, document.activeElement as HTMLElement | null, { modalOpen, pttCode: storedPttCode() })) return;
      e.preventDefault();
      conn.send('game:vote', { nominationId: nom.id, vote: !raised });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [live, raised, nom.id, conn]);
  if (!expanded)
    return (
      <button class="cth-vote-pill" onClick={() => setManual(true)} title="Show the vote">
        ⚖ {nameOf(view.players, nom.nomineeSeat)}
        {nom.status === 'pending' ? ' nominated · waiting' : ` · ${nom.voteCount}/${nom.threshold}`}
        {locked && (nom.votes[me] ? ' · ✓ your vote counted' : ' · not counted')}
      </button>
    );
  return (
    <div class="cth-vote">
      {manual && (
        <button class="cth-vote-hide" onClick={() => setManual(false)} title="Collapse">
          ▴
        </button>
      )}
      <VoteSummary nom={nom} players={view.players} me={me} />
      {nom.status === 'voting' && <VoteClock nom={nom} players={view.players} />}
      {nom.status === 'voting' && nom.clockPaused && <span class="cth-chip">❚❚ clock paused</span>}
      {(nom.status === 'voting' || nom.status === 'pending') && (
        <div class="cth-vote-actions">
          {locked ? (
            <span class={`cth-chip ${nom.votes[me] ? 'ok' : ''}`}>{nom.votes[me] ? '✓ Your vote counted' : 'Not counted (hand down)'}</span>
          ) : canVote ? (
            <button
              class={`cth-hand${raised ? ' primary' : ''}`}
              aria-pressed={raised}
              onClick={() => conn.send('game:vote', { nominationId: nom.id, vote: !raised })}
              title="Shortcut: H"
            >
              {raised ? 'Lower hand' : view.you.alive ? 'Raise hand' : 'Raise hand (uses ghost vote)'}
            </button>
          ) : (
            <span class="muted">Your ghost vote is spent.</span>
          )}
          {!locked && nom.status === 'pending' && canVote && <small class="muted">The clock hasn't started: you can raise your hand already.</small>}
          {!locked && nom.status === 'voting' && away !== null && (
            <small class={away === 0 && !nom.clockPaused ? 'cth-yourturn' : 'muted'}>
              {nom.clockPaused
                ? `Clock paused · ${away} seat${away === 1 ? '' : 's'} before you`
                : away === 0
                  ? 'Locking your vote now…'
                  : `Clock reaches you in ~${Math.ceil(away * stepS)}s (${away} seat${away > 1 ? 's' : ''})`}
            </small>
          )}
          {!locked && raised && <small class="cth-ok">✋ Hand raised: it counts when the clock reaches you.</small>}
          {isButler && !locked && <small class="muted">Butler: only vote if your master votes.</small>}
        </div>
      )}
    </div>
  );
}

/** After a tally: "✓ your vote counted" stays visible for 10 s (or until the next nomination). */
function RecentVote({ view }: { view: PlayerGameView }) {
  const noms = view.day?.nominations ?? [];
  const last = noms[noms.length - 1];
  const nom = last && last.status === 'tallied' ? last : undefined;
  const [shownFor, setShownFor] = useState<string | null>(null);
  useEffect(() => {
    if (!nom) return;
    setShownFor(nom.id);
    const t = setTimeout(() => setShownFor(null), 10000);
    return () => clearTimeout(t);
  }, [nom?.id]);
  if (!nom || shownFor !== nom.id) return null;
  const me = view.you.seat;
  const mine = nom.votes[me];
  return (
    <div class="cth-vote-pill" role="status">
      ⚖ {nameOf(view.players, nom.nomineeSeat)}: {nom.voteCount} vote{nom.voteCount === 1 ? '' : 's'} (needed {nom.threshold})
      {mine === true ? ' · ✓ your vote counted' : mine === false ? ' · your hand was down: not counted' : ''}
    </div>
  );
}

// -------------------------------------------------------------------------------- endgame

function Endgame({ result, seat, canRematch }: { result: GameResult; seat: number | null; canRematch: boolean }) {
  const [hidden, setHidden] = useState(false);
  const rows = useMemo(() => [...result.reveal].sort((a, b) => a.seat - b.seat), [result]);
  const mine = ownOutcome(result, seat);
  const box = useRef<HTMLDivElement>(null);
  // (qol) Escape closes the reveal (the town stays explorable; "Show results" brings it back). Focus
  // moves to the dialog itself (not a button: Enter must not leave the game by accident).
  useEffect(() => {
    if (hidden) return;
    box.current?.focus({ preventScroll: true });
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('[aria-modal="true"]')) return;
      e.stopPropagation();
      setHidden(true);
    };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, [hidden]);
  if (hidden)
    return (
      <button class="cth-endgame-reopen" onClick={() => setHidden(false)}>
        Show results
      </button>
    );
  return (
    <div class="cth-endgame" role="dialog" aria-label="Game results" tabIndex={-1} ref={box}>
      <h2 class={`cth-${result.winner}`}>{result.winner === 'good' ? 'Good wins' : 'Evil wins'}</h2>
      {mine && (
        <p class={`cth-outcome ${mine.won ? 'won' : 'lost'}`}>
          {mine.won ? 'You won' : 'You lost'} — you were {mine.alignment === 'good' ? 'Good' : 'Evil'}.
        </p>
      )}
      <p>{result.reason}</p>
      <table class="cth-table">
        <tbody>
          {rows.map((r) => (
            <tr key={r.seat} class={`${r.alive ? '' : 'dead'}${r.seat === seat ? ' me' : ''}`}>
              <td>{r.seat + 1}</td>
              <td>
                {r.name}
                {r.seat === seat && <span class="muted"> (you)</span>}
              </td>
              <td class={`cth-${r.alignment}`}>{charName(r.character)}</td>
              <td>{r.alive ? 'alive' : 'dead'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p class="muted cth-note">
        {canRematch ? 'Press Play again (top right) to bring everyone back to the waiting room.' : 'Stay for another round: the host can start the next game from here.'}
      </p>
      <div class="cth-row">
        <button class="primary" onClick={goHome}>
          Back to lobbies
        </button>
        <button onClick={() => setHidden(true)} title="Close (Esc): look around the town">
          Close
        </button>
      </div>
    </div>
  );
}
