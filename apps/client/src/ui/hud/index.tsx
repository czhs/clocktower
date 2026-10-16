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
import { useStore } from '../../net/store';
import { townSays } from '../clock/logic';
import { charName, CharacterSelect, Countdown, friendlyError, goHome, nameOf, PHASE_LABEL, phaseTitle, seatLabel, VoteClock } from './shared';
import { homeOf, MoveHint } from './hints';
import './hud.css';

export function Hud({ conn }: { conn: RoomConnection; account: AccountView }) {
  const view = useStore(conn.gameView);
  if (!view) return null;
  return (
    <div class="cth">
      <Toasts conn={conn} />
      {view.kind === 'player' && <PlayerHud view={view} conn={conn} />}
      {view.result && <Endgame result={view.result} key={view.result.reason} />}
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
      setItems((x) => [...x.slice(-2), item]);
      setTimeout(() => setItems((x) => x.filter((y) => y.id !== item.id)), 7000);
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
        <div class={`cth-toast cth-toast-${a.kind}`} key={a.id}>
          {a.text}
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------------------ player HUD

type Tab = 'players' | 'info' | 'town' | 'grimoire';

function PlayerHud({ view, conn }: { view: PlayerGameView; conn: RoomConnection }) {
  const [pinned, setPinned] = useState(false);
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
          title={pinned ? 'Collapse' : 'Your character and house (click to keep open)'}
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
            <nav class="cth-tabs">
              <button class={tab === 'players' ? 'on' : ''} onClick={() => setTab('players')}>
                Town
              </button>
              <button class={tab === 'info' ? 'on' : ''} onClick={() => setTab('info')}>
                Notes{unread > 0 && <span class="cth-badge">{unread}</span>}
              </button>
              <button class={tab === 'town' ? 'on' : ''} onClick={() => setTab('town')}>
                Crier
              </button>
              {view.spyGrimoire && (
                <button class={tab === 'grimoire' ? 'on' : ''} onClick={() => setTab('grimoire')}>
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

function PlayerList({ view, conn }: { view: PlayerGameView; conn: RoomConnection }) {
  const [shootAt, setShootAt] = useState<number | null>(null);
  const nominationsOpen = view.day?.nominationsOpen ?? false;
  const busy = view.day?.nominations.some((n) => n.status === 'voting' || n.status === 'pending') ?? false;
  const canNominate = view.phase === 'day' && view.you.canNominate && nominationsOpen && !busy;
  return (
    <div>
      <ul class="cth-players">
        {view.players.map((p) => (
          <li key={p.seat} class={`${p.alive ? '' : 'dead'} ${p.seat === view.you.seat ? 'me' : ''}`}>
            <span class="cth-seat">{p.seat + 1}</span>
            <span class="cth-pname">{p.name}</span>
            {!p.alive && <span title={p.ghostVoteAvailable ? 'Dead — ghost vote available' : 'Dead — ghost vote spent'}>{p.ghostVoteAvailable ? '👻' : '☠'}</span>}
            {!p.connected && <span class="muted" title="Disconnected">⚡</span>}
            {p.nominatedToday && <span class="cth-mini" title="Has nominated today">N</span>}
            {p.wasNominatedToday && <span class="cth-mini" title="Was nominated today">✋</span>}
            <span class="cth-spacer" />
            {canNominate && !p.wasNominatedToday && (
              <button class="cth-small" onClick={() => conn.send('game:nominate', { nomineeSeat: p.seat })}>
                Nominate
              </button>
            )}
          </li>
        ))}
      </ul>
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
          <button
            class="cth-small"
            disabled={shootAt === null}
            onClick={() => {
              if (shootAt === null) return;
              if (confirm(`Publicly claim Slayer and shoot ${nameOf(view.players, shootAt)}? You only get one shot.`)) {
                conn.send('game:slayerShot', { targetSeat: shootAt });
                setShootAt(null);
              }
            }}
          >
            Shoot
          </button>
        </div>
      )}
      {view.phase === 'day' && !nominationsOpen && <p class="muted cth-note">Nominations are closed.</p>}
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
  return (
    <div class="cth-prompt" role="dialog" aria-label={prompt.title}>
      <h3>{prompt.title}</h3>
      {prompt.body && <p>{prompt.body}</p>}
      {prompt.kind === 'choose_players' && (
        <>
          <p class="muted">
            Choose {min === max ? min : `${min}–${max}`} player{max === 1 ? '' : 's'}.
          </p>
          <div class="cth-choices">
            {view.players.filter(eligible).map((p) => (
              <button key={p.seat} class={seats.includes(p.seat) ? 'on' : ''} onClick={() => toggle(p.seat)}>
                {seatLabel(view.players, p.seat)}
              </button>
            ))}
          </div>
          <button
            class="primary"
            disabled={seats.length < min || seats.length > max}
            onClick={() => conn.send('game:promptResponse', { promptId: prompt.id, seats })}
          >
            Confirm
          </button>
        </>
      )}
      {prompt.kind === 'choose_character' && (
        <>
          <CharacterSelect value={character} onChange={setCharacter} allowEmpty only={prompt.characterOptions} />
          <button
            class="primary"
            disabled={!character}
            onClick={() => character && conn.send('game:promptResponse', { promptId: prompt.id, character })}
          >
            Confirm
          </button>
        </>
      )}
      {prompt.kind === 'yes_no' && (
        <div class="cth-row">
          <button class="primary" onClick={() => conn.send('game:promptResponse', { promptId: prompt.id, yes: true })}>
            Yes
          </button>
          <button onClick={() => conn.send('game:promptResponse', { promptId: prompt.id, yes: false })}>No</button>
        </div>
      )}
      {prompt.kind === 'acknowledge' && (
        <button class="primary" onClick={() => conn.send('game:promptResponse', { promptId: prompt.id })}>
          OK
        </button>
      )}
      {view.prompts.length > 1 && <p class="muted">+{view.prompts.length - 1} more</p>}
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

function Endgame({ result }: { result: GameResult }) {
  const [hidden, setHidden] = useState(false);
  const rows = useMemo(() => [...result.reveal].sort((a, b) => a.seat - b.seat), [result]);
  if (hidden)
    return (
      <button class="cth-endgame-reopen" onClick={() => setHidden(false)}>
        Show results
      </button>
    );
  return (
    <div class="cth-endgame" role="dialog" aria-label="Game results">
      <h2 class={`cth-${result.winner}`}>{result.winner === 'good' ? 'Good wins' : 'Evil wins'}</h2>
      <p>{result.reason}</p>
      <table class="cth-table">
        <tbody>
          {rows.map((r) => (
            <tr key={r.seat} class={r.alive ? '' : 'dead'}>
              <td>{r.seat + 1}</td>
              <td>{r.name}</td>
              <td class={`cth-${r.alignment}`}>{charName(r.character)}</td>
              <td>{r.alive ? 'alive' : 'dead'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div class="cth-row">
        <button class="primary" onClick={goHome}>
          Back to lobbies
        </button>
        <button onClick={() => setHidden(true)}>Close</button>
      </div>
    </div>
  );
}
