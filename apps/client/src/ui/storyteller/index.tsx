// OWNED BY rules-storyteller. Storyteller overlay: setup (random/manual, drunk, red herring,
// bluffs), Grimoire with status toggles & reminders, night-order checklist with engine
// suggestions, visits (fast travel), prompt/info composer, phase/nomination/execution controls,
// kill/revive, travel speed, announcements, declare winner, undo, alerts and log.
// Rendered only for the seated Storyteller (the server sends a StorytellerGameView only to them).
import { useEffect, useMemo, useState } from 'preact/hooks';
import {
  CHARACTER_INFO,
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
import { charName, CharacterSelect, Countdown, phaseTitle, seatLabel, VoteClock } from '../hud/shared';
import './storyteller.css';

type Cmd = C2SPayload<'st:command'>;
type Send = (c: Cmd) => void;
type Tab = 'setup' | 'grimoire' | 'night' | 'day' | 'tools' | 'log';

interface ComposerState {
  seat: number | null;
  mode: 'info' | 'prompt';
  prompt: PromptSpecInput;
  info: InfoSpecInput;
}

const EMPTY_PROMPT: PromptSpecInput = { kind: 'choose_players', title: 'Choose a player', minTargets: 1, maxTargets: 1, allowSelf: true, allowDead: true };
const EMPTY_INFO: InfoSpecInput = { text: '' };

export function StorytellerPanel({ conn }: { conn: RoomConnection; account: AccountView }) {
  const view = useStore(conn.gameView);
  if (!view || view.kind !== 'storyteller') return null;
  return <StPanel view={view} conn={conn} />;
}

function StPanel({ view, conn }: { view: StorytellerGameView; conn: RoomConnection }) {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<Tab>(view.phase === 'setup' ? 'setup' : 'grimoire');
  const [error, setError] = useState<string | null>(null);
  const [dismissedAlerts, setDismissedAlerts] = useState(0);
  const [composer, setComposer] = useState<ComposerState>({ seat: null, mode: 'info', prompt: EMPTY_PROMPT, info: EMPTY_INFO });
  const send: Send = (c) => {
    setError(null);
    conn.send('st:command', c);
  };
  useEffect(
    () =>
      conn.events.on('error', (e) => {
        if (e.for === 'st:command') setError(e.message);
      }),
    [conn],
  );
  // Follow the phase: setup -> grimoire; night -> checklist; day -> day controls.
  useEffect(() => {
    if (view.phase === 'setup') setTab('setup');
    else if (view.phase === 'first_night' || view.phase === 'night') setTab('night');
    else if (view.phase === 'day') setTab('day');
  }, [view.phase]);

  const openComposer = (patch: Partial<ComposerState>) => {
    setComposer((c) => ({ ...c, ...patch }));
    setTab('tools');
  };
  const alerts = view.alerts.slice(dismissedAlerts);

  if (!open)
    return (
      <button class="cts-tab-closed" onClick={() => setOpen(true)} title="Open the Grimoire">
        ☾ Grimoire{alerts.length > 0 && <span class="cts-badge">{alerts.length}</span>}
      </button>
    );

  return (
    <aside class="cts">
      <header class="cts-head">
        <span class="cts-title">Storyteller</span>
        <span class="cts-phase">{phaseTitle(view.phase, view.dayNumber)}</span>
        {view.phaseEndsAt !== null && <Countdown endsAt={view.phaseEndsAt} />}
        {view.visitingSeat !== null && <span class="cts-chip visit">In home of {seatLabel(view.players, view.visitingSeat)}</span>}
        <span class="cts-spacer" />
        <button class="cts-icon" disabled={!view.canUndo} onClick={() => send({ type: 'undo_last' })} title="Undo the last action">
          ↶
        </button>
        <button class="cts-icon" onClick={() => setOpen(false)} title="Collapse">
          ✕
        </button>
      </header>
      <PhaseControls view={view} send={send} />
      {error && (
        <div class="cts-error" role="alert">
          {error}
          <button class="cts-icon" onClick={() => setError(null)}>
            ✕
          </button>
        </div>
      )}
      {alerts.length > 0 && (
        <div class="cts-alerts">
          {alerts.slice(-3).map((a, i) => (
            <div key={`${dismissedAlerts}-${i}`}>⚠ {a}</div>
          ))}
          <button class="cts-link" onClick={() => setDismissedAlerts(view.alerts.length)}>
            dismiss
          </button>
        </div>
      )}
      <nav class="cts-tabs">
        {(['setup', 'grimoire', 'night', 'day', 'tools', 'log'] as Tab[])
          .filter((t) => t !== 'setup' || view.phase === 'setup')
          .map((t) => (
            <button key={t} class={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
              {t === 'night' ? 'Night order' : t[0]!.toUpperCase() + t.slice(1)}
            </button>
          ))}
      </nav>
      <div class="cts-body">
        {tab === 'setup' && <SetupTab view={view} send={send} />}
        {tab === 'grimoire' && <GrimoireTab view={view} send={send} openComposer={openComposer} />}
        {tab === 'night' && <NightTab view={view} send={send} openComposer={openComposer} />}
        {tab === 'day' && <DayTab view={view} send={send} />}
        {tab === 'tools' && <ToolsTab view={view} send={send} composer={composer} setComposer={setComposer} />}
        {tab === 'log' && <LogTab view={view} />}
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------- phase controls

function PhaseControls({ view, send }: { view: StorytellerGameView; send: Send }) {
  const p = view.phase;
  const pending = view.pendingDeaths ?? [];
  return (
    <div class="cts-controls">
      {p === 'setup' && (
        <button class="primary" disabled={!view.charactersAssigned} onClick={() => send({ type: 'begin_first_night' })}>
          Begin first night
        </button>
      )}
      {(p === 'first_night' || p === 'night') && (
        <button onClick={() => send({ type: 'advance_phase', to: 'dawn' })}>Dawn (review)</button>
      )}
      {(p === 'first_night' || p === 'night' || p === 'dawn') && (
        <button class="primary" onClick={() => send({ type: 'advance_phase', to: 'day' })}>
          Day{pending.length ? ` (${pending.length} death${pending.length > 1 ? 's' : ''} announced)` : ''}
        </button>
      )}
      {p === 'day' && (
        <button class="primary" onClick={() => send({ type: 'advance_phase', to: 'bedtime' })}>
          Ring bedtime bell
        </button>
      )}
      {(p === 'day' || p === 'bedtime') && <button onClick={() => send({ type: 'advance_phase', to: 'night' })}>Night now</button>}
      {p === 'finished' && <span class="muted">Game over — use Tools to change the declared winner.</span>}
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
  const counts = { townsfolk: 0, outsider: 0, minion: 0, demon: 0 };
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
    if (drunkBelieves) cmd.drunkBelievesSeatCharacter = drunkBelieves;
    if (redHerring !== '') cmd.redHerringSeat = redHerring;
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
            only={(Object.keys(CHARACTER_INFO) as CharacterId[]).filter((c) => CHARACTER_INFO[c].type === 'townsfolk' && !chosen.includes(c))}
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
            only={(Object.keys(CHARACTER_INFO) as CharacterId[]).filter((c) => CHARACTER_INFO[c].alignment === 'good' && !chosen.includes(c))}
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
  return (
    <div class={`cts-grim ${g.alive ? '' : 'dead'} ${view.visitingSeat === g.seat ? 'visiting' : ''}`}>
      <div class="cts-grim-head">
        <span class="cts-seat">{g.seat + 1}</span>
        <span class="cts-name">{g.name}</span>
        <span class={`cts-char cts-${g.alignment}`}>{charName(g.character)}</span>
        {g.character !== g.believedCharacter && <span class="muted">thinks {charName(g.believedCharacter)}</span>}
        <span class="cts-spacer" />
        <span class={`cts-chip ${g.alive ? 'ok' : 'dead'}`}>{g.alive ? 'alive' : pendingDeath ? 'dies at dawn' : 'dead'}</span>
      </div>
      <div class="cts-grim-flags">
        <Toggle on={g.poisoned} label="Poisoned" onClick={() => send({ type: 'set_status', seat: g.seat, poisoned: !g.poisoned })} />
        <Toggle on={g.drunk} label="Drunk" disabled={g.character === 'drunk'} onClick={() => send({ type: 'set_status', seat: g.seat, drunk: !g.drunk })} />
        <Toggle on={g.protectedTonight} label="Protected" onClick={() => send({ type: 'set_status', seat: g.seat, protectedTonight: !g.protectedTonight })} />
        <Toggle on={g.ghostVoteAvailable} label="Ghost vote" onClick={() => send({ type: 'set_ghost_vote', seat: g.seat, available: !g.ghostVoteAvailable })} />
        {g.isRedHerring && <span class="cts-chip">red herring</span>}
        {g.isButlerMaster && <span class="cts-chip">master</span>}
        {g.abilityUsed && <span class="cts-chip">ability used</span>}
        {g.reminders.map((r) => (
          <span class="cts-chip rem" key={r}>
            {r}
            <button class="cts-x" title="Remove reminder" onClick={() => send({ type: 'remove_reminder', seat: g.seat, token: r })}>
              ×
            </button>
          </span>
        ))}
      </div>
      <div class="cts-grim-actions">
        <button onClick={() => send({ type: 'visit_home', seat: g.seat })} title="Fast-travel into this home">
          Visit
        </button>
        <button onClick={() => openComposer({ seat: g.seat, mode: 'info' })}>Info</button>
        <button onClick={() => openComposer({ seat: g.seat, mode: 'prompt' })}>Prompt</button>
        {g.alive ? (
          <button
            class="danger"
            onClick={() => {
              if (confirm(`Kill ${g.name}? ${night ? 'The death is announced at dawn.' : 'The death is announced now.'}`))
                send({ type: 'kill', seat: g.seat, announce: !night });
            }}
          >
            Kill
          </button>
        ) : (
          <button onClick={() => send({ type: 'set_alive', seat: g.seat, alive: true })}>Revive</button>
        )}
        <button onClick={() => setEditing(!editing)}>{editing ? 'Cancel' : 'Change…'}</button>
      </div>
      {editing && (
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
          <button class="cts-link" onClick={() => send({ type: 'set_alive', seat: g.seat, alive: !g.alive })}>
            Force {g.alive ? 'dead' : 'alive'} (no triggers)
          </button>
        </div>
      )}
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
    </div>
  );
}

function Toggle({ on, label, onClick, disabled }: { on: boolean; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button class={`cts-toggle ${on ? 'on' : ''}`} disabled={disabled} onClick={onClick} aria-pressed={on}>
      {label}
    </button>
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

function NightStep({ step, view, send, openComposer }: { step: NightStepView; view: StorytellerGameView; send: Send; openComposer: (p: Partial<ComposerState>) => void }) {
  const [override, setOverride] = useState<number | ''>('');
  const [starpass, setStarpass] = useState<number | ''>('');
  const [redirect, setRedirect] = useState<number | ''>('');
  const finished = step.status === 'resolved' || step.status === 'skipped';
  const g = step.seat === null ? undefined : view.grimoire.find((x) => x.seat === step.seat);
  const minions = view.grimoire.filter((x) => x.alive && CHARACTER_INFO[x.character].type === 'minion');
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
        <span class={`cts-status ${step.status}`}>{step.status}</span>
        <b>{stepTitle(step)}</b>
        {g && (
          <span>
            — {seatLabel(view.players, g.seat)}
            {step.impaired && <span class="cts-warn"> (impaired)</span>}
          </span>
        )}
      </div>
      {step.suggestion && <div class="cts-sugg">{step.suggestion}</div>}
      {step.notes?.map((n, i) => (
        <div class="cts-note" key={i}>
          {n}
        </div>
      ))}
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
          {step.suggestedInfo && step.seat !== null && (
            <button onClick={() => send({ type: 'send_info', seat: step.seat!, info: step.suggestedInfo! })} title={step.suggestedInfo.text}>
              Send suggested
            </button>
          )}
          {step.seat !== null && (
            <button onClick={() => openComposer({ seat: step.seat, mode: 'info', info: { ...(step.suggestedInfo ?? EMPTY_INFO), stepId: step.id } })}>
              Edit info…
            </button>
          )}
          {step.prompt && step.seat !== null && (
            <select value={override} title="Choose on the player's behalf" onChange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; setOverride(v === '' ? '' : Number(v)); }}>
              <option value="">(use answer)</option>
              {view.players.map((p) => (
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
          <button class="primary" onClick={resolve}>
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
  const d = view.day;
  if (!d) return <p class="muted">Day controls appear during the day.</p>;
  const voting = d.nominations.find((n) => n.status === 'voting');
  return (
    <div>
      <div class="cts-row">
        <label class="cts-check">
          <input
            type="checkbox"
            checked={d.nominationsOpen}
            disabled={view.phase !== 'day'}
            onChange={(e) => send({ type: 'set_nominations_open', open: (e.currentTarget as HTMLInputElement).checked })}
          />{' '}
          Nominations open
        </label>
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
            {n.status === 'pending' && (
              <button class="primary" disabled={!!voting} onClick={() => send({ type: 'start_vote', nominationId: n.id })}>
                Start vote
              </button>
            )}
            {(n.status === 'pending' || n.status === 'voting') && (
              <button onClick={() => send({ type: 'cancel_nomination', nominationId: n.id })}>Cancel</button>
            )}
          </li>
        ))}
      </ul>
      {voting && (
        <div class="cts-center">
          <VoteClock nom={voting} players={view.players} size={170} />
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
            <button class="danger" disabled={!!voting} onClick={() => send({ type: 'execute', seat: d.onTheBlock!.seat })}>
              Execute
            </button>
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
          <button class="danger" disabled={execSeat === '' || !!voting} onClick={() => execSeat !== '' && send({ type: 'execute', seat: execSeat })}>
            Execute
          </button>
          <button disabled={!!voting} onClick={() => send({ type: 'execute', seat: null })}>
            No execution
          </button>
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
          send({ type: 'set_bedtime_seconds', seconds: Math.min(300, Math.max(10, Math.round(bed))) });
        }}
      >
        <label>
          Bedtime countdown{' '}
          <input type="number" min={10} max={300} value={bed} style={{ width: '70px' }} onInput={(e) => setBed(Number((e.currentTarget as HTMLInputElement).value))} /> s
        </label>
        <button type="submit">Set</button>
      </form>
      <h4>Declare winner</h4>
      <div class="cts-row">
        <input class="cts-grow" value={winReason} maxLength={200} placeholder="Reason (optional)" onInput={(e) => setWinReason((e.currentTarget as HTMLInputElement).value)} />
        <button
          class="cts-good-btn"
          onClick={() => confirm('Declare GOOD the winner?') && send({ type: 'declare_winner', winner: 'good', reason: winReason || 'Declared by the Storyteller.' })}
        >
          Good wins
        </button>
        <button
          class="cts-evil-btn"
          onClick={() => confirm('Declare EVIL the winner?') && send({ type: 'declare_winner', winner: 'evil', reason: winReason || 'Declared by the Storyteller.' })}
        >
          Evil wins
        </button>
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
  const canSend = composer.seat !== null && (composer.mode === 'prompt' ? prompt.title.trim().length > 0 : info.text.trim().length > 0);
  const recipients = useMemo(() => view.players, [view.players]);
  const doSend = () => {
    if (composer.seat === null) return;
    if (composer.mode === 'prompt') send({ type: 'prompt_player', seat: composer.seat, prompt: { ...prompt, title: prompt.title.trim() } });
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
        <select value={composer.seat ?? ''} onChange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; set({ seat: v === '' ? null : Number(v) }); }}>
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
                min <input type="number" min={1} max={15} style={{ width: '48px' }} value={prompt.minTargets ?? 1} onInput={(e) => setPrompt({ minTargets: Number((e.currentTarget as HTMLInputElement).value) })} />
              </label>
              <label>
                max <input type="number" min={1} max={15} style={{ width: '48px' }} value={prompt.maxTargets ?? 1} onInput={(e) => setPrompt({ maxTargets: Number((e.currentTarget as HTMLInputElement).value) })} />
              </label>
              <label class="cts-check">
                <input type="checkbox" checked={prompt.allowSelf ?? true} onChange={(e) => setPrompt({ allowSelf: (e.currentTarget as HTMLInputElement).checked })} /> self
              </label>
              <label class="cts-check">
                <input type="checkbox" checked={prompt.allowDead ?? true} onChange={(e) => setPrompt({ allowDead: (e.currentTarget as HTMLInputElement).checked })} /> dead
              </label>
            </div>
          )}
        </>
      )}
      <button class="primary" disabled={!canSend} onClick={doSend}>
        Send {composer.mode}
      </button>
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
