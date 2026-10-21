// OWNED BY rules-storyteller. (v2.2) "How do you want to deal?" — the Storyteller's dealing modes:
//   Random          the server deals a legal setup (random_setup)
//   Storyline       a preset storyline, dealt at random onto the players (deal_preset)
//   Pick characters the Storyteller fills a bag; the server shuffles it onto the players (deal_bag)
//   By hand         every seat chosen by the Storyteller (the existing Setup tab, assign_characters)
// After any deal the grimoire shows the result; seats can still be tweaked (Setup tab: "Load current
// Grimoire" -> edit -> Assign) and the cast can be re-dealt (a confirm guards an existing deal).
// Nothing here reveals anything to players: they only ever see their own character, at nightfall.
import { useContext, useEffect, useState } from 'preact/hooks';
import { CHARACTER_INFO, type CharacterId, type SeatedType, type StorylineId, type StorytellerGameView } from '@ct/protocol';
import { charName, CharacterSelect, ScriptCtx } from '../hud/shared';
import { ConfirmButton, type Send } from './stage';
import { charactersOf, checkBag, coreLine, countsLine, scriptDeals, storylineNamesDrunk, storylineOptions, storylineTitle, TYPE_ORDER } from './dealLogic';

export type DealMode = 'random' | 'storyline' | 'bag' | 'hand';

const MODES: { id: DealMode; label: string; icon: string; hint: string }[] = [
  { id: 'random', label: 'Random', icon: '🎲', hint: 'A legal setup for this script, dealt at random' },
  { id: 'storyline', label: 'Storyline', icon: '📜', hint: 'A preset story, dealt at random to the players' },
  { id: 'bag', label: 'Pick characters', icon: '⚱', hint: 'Choose which characters are in play; the server deals them at random' },
  { id: 'hand', label: 'By hand', icon: '✎', hint: 'Choose every player’s character yourself (Setup tab)' },
];

const LEVEL: Record<string, string> = { beginner: 'for new groups', standard: 'standard', tricky: 'tricky' };

/** The segmented mode switch (shared by the in-game chooser and the waiting-room preparation). */
export function ModeSwitch<T extends string>({ modes, value, onPick, label }: { modes: { id: T; label: string; icon: string; hint: string }[]; value: T; onPick: (m: T) => void; label: string }) {
  return (
    <div class="cts-dealmodes" role="radiogroup" aria-label={label}>
      {modes.map((m) => (
        <button key={m.id} role="radio" aria-checked={value === m.id} class={value === m.id ? 'on' : ''} title={m.hint} onClick={() => onPick(m.id)}>
          <span class="cts-dealmode-icon" aria-hidden="true">
            {m.icon}
          </span>
          {m.label}
        </button>
      ))}
    </div>
  );
}

/** Storyline cards for `n` players: title, blurb, the fixed core, supported counts; unsupported ones greyed out. */
export function StorylineCards({ n, value, onPick }: { n: number; value: StorylineId | null; onPick: (id: StorylineId) => void }) {
  return (
    <ul class="cts-stories" role="listbox" aria-label="Storylines">
      {storylineOptions(n).map(({ def, counts, supported, problem }) => (
        <li key={def.id}>
          <button
            role="option"
            aria-selected={value === def.id}
            class={`cts-story${value === def.id ? ' on' : ''}${supported ? '' : ' off'}`}
            disabled={!supported}
            title={supported ? def.blurb : `Not for ${n} players: ${problem}`}
            onClick={() => onPick(def.id)}
          >
            <span class="cts-story-head">
              <b class="cts-story-title">{def.title}</b>
              <span class={`cts-story-level ${def.level}`}>{LEVEL[def.level]}</span>
            </span>
            <span class="cts-story-blurb">{def.blurb}</span>
            <span class="cts-story-meta">
              Always: {coreLine(def)} · {counts} players{supported ? '' : ` — not ${n}`}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Pick the characters in play: toggle chips by type, live standard-count check. */
function BagBuilder({ view, send, confirmRedeal }: { view: StorytellerGameView; send: Send; confirmRedeal: boolean }) {
  const n = view.players.length - (view.travellers?.length ?? 0); // Travellers sit outside the distribution
  const script = useContext(ScriptCtx);
  const [bag, setBag] = useState<CharacterId[]>([]);
  const [nonstandard, setNonstandard] = useState(false);
  const [drunkBelieves, setDrunkBelieves] = useState<CharacterId | ''>('');
  const [drunkSeat, setDrunkSeat] = useState<number | ''>('');
  const check = checkBag(bag, n);
  const hasDrunk = bag.includes('drunk');
  const toggle = (c: CharacterId) => setBag((b) => (b.includes(c) ? b.filter((x) => x !== c) : [...b, c]));
  const want = check.want;
  const typeCount: Record<SeatedType, [number, number | null]> = {
    townsfolk: [check.counts.townsfolk, want?.townsfolk ?? null],
    outsider: [check.counts.outsiders, want?.outsiders ?? null],
    minion: [check.counts.minions, want?.minions ?? null],
    demon: [check.counts.demons, want?.demons ?? null],
  };
  const deal = () =>
    send({
      type: 'deal_bag',
      characters: bag,
      ...(nonstandard ? { allowNonstandard: true } : {}),
      ...(drunkBelieves && hasDrunk && !bag.includes(drunkBelieves) ? { drunkBelieves } : {}),
      ...(hasDrunk && drunkSeat !== '' ? { drunkSeat } : {}),
    });
  // Who the Drunk is is never left to chance: a bag with the Drunk needs its seat.
  const canDeal = check.ready && (check.standard || nonstandard) && (!hasDrunk || drunkSeat !== '');
  const label = `Deal these ${n} at random`;
  return (
    <div class="cts-bag">
      {TYPE_ORDER.map((t) => (
        <div key={t} class="cts-bag-type">
          <span class={`cts-bag-label ${typeCount[t][1] !== null && typeCount[t][0] === typeCount[t][1] ? 'cts-ok' : ''}`}>
            {t === 'townsfolk' ? 'Townsfolk' : t[0]!.toUpperCase() + t.slice(1) + 's'} {typeCount[t][0]}
            {typeCount[t][1] !== null && `/${typeCount[t][1]}`}
          </span>
          <span class="cts-bag-chips">
            {charactersOf(t, script).map((c) => (
              <button key={c} class={`cts-bagchip ${CHARACTER_INFO[c].alignment}${bag.includes(c) ? ' on' : ''}`} aria-pressed={bag.includes(c)} title={CHARACTER_INFO[c].ability} onClick={() => toggle(c)}>
                {charName(c)}
              </button>
            ))}
          </span>
        </div>
      ))}
      <p class="cts-script-note">
        {want ? (
          <>
            Standard for {n}
            {bag.includes('baron') ? ' (with the Baron)' : ''}: {countsLine(want)}.{' '}
            <span class={check.standard ? 'cts-ok' : 'cts-warn'}>{check.standard ? '✓ standard' : `${bag.length}/${n} picked`}</span>
          </>
        ) : (
          check.problems[0]
        )}
      </p>
      {check.problems.length > 0 && bag.length > 0 && <p class="cts-warn cts-script-note">{check.problems.join(' · ')}</p>}
      {hasDrunk && (
        <DrunkFields view={view} seat={drunkSeat} setSeat={setDrunkSeat} believes={drunkBelieves} setBelieves={setDrunkBelieves} notIn={bag} />
      )}
      {check.ready && !check.standard && (
        <label class="cts-check">
          <input type="checkbox" checked={nonstandard} onChange={(e) => setNonstandard((e.currentTarget as HTMLInputElement).checked)} /> Allow a nonstandard distribution
        </label>
      )}
      <div class="cts-bigrow">
        {confirmRedeal ? (
          <ConfirmButton class="cts-big primary" disabled={!canDeal} ask="Deal again? The current cast is replaced." undo="yes" onConfirm={deal}>
            ⚱ {label}
          </ConfirmButton>
        ) : (
          <button class="cts-big primary" disabled={!canDeal} onClick={deal}>
            ⚱ {label}
          </button>
        )}
        {bag.length > 0 && (
          <button class="cts-big" onClick={() => setBag([])}>
            Clear
          </button>
        )}
      </div>
      <p class="muted cts-script-note">Only the seats are shuffled. The red herring and bluffs are suggestions: change them below once dealt.</p>
    </div>
  );
}

/** Seats a deal fills (Travellers are the Storyteller's own pick, outside the deal). */
function dealtPlayers(view: StorytellerGameView) {
  const travellers = new Set((view.travellers ?? []).map((t) => t.seat));
  return view.players.filter((p) => !travellers.has(p.seat));
}

/** Who the Drunk is (the Storyteller's pick, never random) and what they believe they are. */
function DrunkFields(props: {
  view: StorytellerGameView;
  seat: number | '';
  setSeat: (s: number | '') => void;
  believes: CharacterId | '';
  setBelieves: (c: CharacterId | '') => void;
  /** Characters that will be in play (the belief must be a Townsfolk outside them). */
  notIn: readonly CharacterId[];
  /** Label for the empty seat option ('' = a seat is required). */
  none?: string;
  lead?: string;
}) {
  const script = useContext(ScriptCtx);
  return (
    <div class="cts-drunk">
      <label class="cts-field">
        {props.lead ?? 'The Drunk is'}
        <select value={props.seat === '' ? '' : String(props.seat)} onChange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; props.setSeat(v === '' ? '' : Number(v)); }}>
          <option value="">{props.none ?? 'choose a player…'}</option>
          {dealtPlayers(props.view).map((p) => (
            <option key={p.seat} value={p.seat}>
              {p.seat + 1}. {p.name}
            </option>
          ))}
        </select>
      </label>
      {props.seat !== '' && (
        <label class="cts-field">
          who believes they are
          <CharacterSelect value={props.believes} allowEmpty onChange={props.setBelieves} only={charactersOf('townsfolk', script).filter((c) => !props.notIn.includes(c))} />
          <small class="muted">(empty = suggest one)</small>
        </label>
      )}
    </div>
  );
}

// Characters this Storyteller removed from the random draw, remembered per script on this device.
const EXCLUDE_KEY = (script: string) => `ct.st.exclude.${script}`;
function loadExcluded(script: string): CharacterId[] {
  try {
    const raw = localStorage.getItem(EXCLUDE_KEY(script));
    const ids = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(ids) ? ids.filter((c): c is CharacterId => typeof c === 'string' && c in CHARACTER_INFO) : [];
  } catch {
    return [];
  }
}
function saveExcluded(script: string, ids: CharacterId[]) {
  try {
    localStorage.setItem(EXCLUDE_KEY(script), JSON.stringify(ids));
  } catch {
    /* private mode: kept for this session only */
  }
}

/** Random deal: what may be drawn (the Storyteller removes characters), and who the Drunk is. */
function RandomDeal({ view, send, dealButton }: { view: StorytellerGameView; send: Send; dealButton: (label: string, run: () => void, disabled?: boolean) => preact.JSX.Element }) {
  const script = useContext(ScriptCtx) ?? 'trouble-brewing';
  const [excluded, setExcluded] = useState<CharacterId[]>(() => loadExcluded(script));
  const [drunkSeat, setDrunkSeat] = useState<number | ''>('');
  const [drunkBelieves, setDrunkBelieves] = useState<CharacterId | ''>('');
  const [open, setOpen] = useState(excluded.length > 0);
  const drunkOnScript = charactersOf('outsider', script).includes('drunk');
  const toggle = (c: CharacterId) => {
    const next = excluded.includes(c) ? excluded.filter((x) => x !== c) : [...excluded, c];
    setExcluded(next);
    saveExcluded(script, next);
  };
  const dealt = !!view.charactersAssigned;
  const run = () =>
    send({
      type: 'random_setup',
      ...(excluded.length ? { exclude: excluded } : {}),
      ...(drunkSeat !== '' ? { drunkSeat, ...(drunkBelieves ? { drunkBelieves } : {}) } : {}),
    });
  return (
    <div class="cts-random">
      {drunkOnScript && (
        <DrunkFields view={view} seat={drunkSeat} setSeat={setDrunkSeat} believes={drunkBelieves} setBelieves={setDrunkBelieves} notIn={[]} lead="The Drunk" none="not in play" />
      )}
      <details class="cts-exclude" open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
        <summary>
          Characters that may be drawn{excluded.length ? ` · ${excluded.length} removed` : ' · all'}
        </summary>
        {TYPE_ORDER.map((t) => (
          <div key={t} class="cts-bag-type">
            <span class="cts-bag-label">{t === 'townsfolk' ? 'Townsfolk' : t[0]!.toUpperCase() + t.slice(1) + 's'}</span>
            <span class="cts-bag-chips">
              {charactersOf(t, script)
                .filter((c) => c !== 'drunk') // the Drunk is placed above, never drawn
                .map((c) => {
                  const on = !excluded.includes(c);
                  return (
                    <button key={c} class={`cts-bagchip ${CHARACTER_INFO[c].alignment}${on ? ' on' : ' cts-removed'}`} aria-pressed={on} title={`${on ? 'Click to remove from the draw' : 'Removed: click to put back'} — ${CHARACTER_INFO[c].ability}`} onClick={() => toggle(c)}>
                      {charName(c)}
                    </button>
                  );
                })}
            </span>
          </div>
        ))}
        {excluded.length > 0 && (
          <button class="cts-link" onClick={() => { setExcluded([]); saveExcluded(script, []); }}>
            Put every character back
          </button>
        )}
      </details>
      {dealButton(dealt ? '↻ Deal again (random)' : '🎲 Random setup', run)}
      <p class="muted cts-script-note">Random: which characters are dealt, and to whom. Yours: who the Drunk is, what may be drawn, the bluffs, the red herring and everything players are told.</p>
    </div>
  );
}

/** The Demon's bluffs: suggested at the deal, the Storyteller's to change before the Demon learns them. */
function BluffEditor({ view, send }: { view: StorytellerGameView; send: Send }) {
  const inPlay = view.grimoire.map((g) => g.character);
  const script = useContext(ScriptCtx);
  const [bluffs, setBluffs] = useState<(CharacterId | '')[]>(() => [0, 1, 2].map((i) => view.demonBluffs[i] ?? ''));
  const key = view.demonBluffs.join();
  useEffect(() => setBluffs([0, 1, 2].map((i) => view.demonBluffs[i] ?? '')), [key]);
  const good = (['townsfolk', 'outsider'] as const).flatMap((t) => charactersOf(t, script)).filter((c) => !inPlay.includes(c));
  const changed = bluffs.join() !== [0, 1, 2].map((i) => view.demonBluffs[i] ?? '').join();
  return (
    <div class="cts-field cts-bluffs">
      <span>Demon bluffs</span>
      {bluffs.map((b, i) => (
        <CharacterSelect key={i} value={b} allowEmpty only={good.filter((c) => c === b || !bluffs.includes(c))} onChange={(c) => setBluffs((x) => x.map((y, j) => (j === i ? c : y)))} />
      ))}
      <button class={changed ? 'primary' : ''} disabled={!changed} onClick={() => send({ type: 'set_demon_bluffs', bluffs: bluffs.filter((c): c is CharacterId => !!c) })}>
        Set bluffs
      </button>
    </div>
  );
}

/** The script panel's Setup step: choose how to deal (default view the Storyteller sees). */
export function DealChooser({ view, send, openHand }: { view: StorytellerGameView; send: Send; openHand: () => void }) {
  const dealt = !!view.charactersAssigned;
  const can = scriptDeals(useContext(ScriptCtx));
  const modes = MODES.filter((m) => (m.id === 'random' ? can.random : m.id === 'storyline' ? can.storyline : true));
  const [mode, setMode] = useState<DealMode>(view.deal?.method === 'storyline' ? 'storyline' : view.deal?.method === 'bag' || !can.random ? 'bag' : 'random');
  const [story, setStory] = useState<StorylineId | null>(view.deal?.storyline ?? null);
  const [storyDrunk, setStoryDrunk] = useState<number | ''>('');
  const storyNamesDrunk = !!story && storylineNamesDrunk(story);
  const n = view.players.length - (view.travellers?.length ?? 0); // Travellers sit outside the distribution
  const storyOk = !!story && storylineOptions(n).some((o) => o.def.id === story && o.supported);
  // (a plain function, not a component: the armed confirm must survive re-renders)
  const dealButton = (label: string, run: () => void, disabled = false) =>
    dealt ? (
      <ConfirmButton class="cts-big cts-wide" disabled={disabled} ask="Deal again? The current cast is replaced." audience="Players see nothing until the first night." undo="yes" onConfirm={run}>
        {label}
      </ConfirmButton>
    ) : (
      <button class="cts-big cts-wide primary" disabled={disabled} onClick={run}>
        {label}
      </button>
    );
  return (
    <div class="cts-deal">
      <p class="cts-deal-q">How do you want to deal?</p>
      <ModeSwitch
        modes={modes}
        value={mode}
        label="How to deal"
        onPick={(m) => {
          if (m === 'hand') openHand();
          else setMode(m);
        }}
      />
      {mode === 'random' && <RandomDeal view={view} send={send} dealButton={dealButton} />}
      {mode === 'storyline' && (
        <>
          <StorylineCards n={n} value={story} onPick={setStory} />
          {storyNamesDrunk && <DrunkFields view={view} seat={storyDrunk} setSeat={setStoryDrunk} believes="" setBelieves={() => undefined} notIn={[]} lead="If the Drunk is dealt, it is" />}
          {dealButton(
            story ? `📜 Deal “${storylineTitle(story)}”${dealt ? ' again' : ''}` : 'Pick a storyline',
            () => story && send({ type: 'deal_preset', storyline: story, ...(storyNamesDrunk && storyDrunk !== '' ? { drunkSeat: storyDrunk } : {}) }),
            !storyOk || (storyNamesDrunk && storyDrunk === ''),
          )}
        </>
      )}
      {mode === 'bag' && <BagBuilder view={view} send={send} confirmRedeal={dealt} />}
      {dealt && <BluffEditor view={view} send={send} />}
    </div>
  );
}

/** One line: how the current cast was dealt. */
export function dealSummary(view: StorytellerGameView): string | null {
  const d = view.deal;
  if (!view.charactersAssigned || !d) return null;
  switch (d.method) {
    case 'storyline':
      return `Storyline: ${storylineTitle(d.storyline) ?? d.storyline}`;
    case 'bag':
      return 'Your characters, dealt at random';
    case 'manual':
      return 'Assigned by hand';
    default:
      return 'Random setup';
  }
}
