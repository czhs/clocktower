// OWNED BY rules-storyteller. (v2.2) "How do you want to deal?" — the Storyteller's dealing modes:
//   Random          the server deals a legal setup (random_setup)
//   Storyline       a preset storyline, dealt at random onto the players (deal_preset)
//   Pick characters the Storyteller fills a bag; the server shuffles it onto the players (deal_bag)
//   By hand         every seat chosen by the Storyteller (the existing Setup tab, assign_characters)
// After any deal the grimoire shows the result; seats can still be tweaked (Setup tab: "Load current
// Grimoire" -> edit -> Assign) and the cast can be re-dealt (a confirm guards an existing deal).
// Nothing here reveals anything to players: they only ever see their own character, at nightfall.
import { useState } from 'preact/hooks';
import { CHARACTER_INFO, type CharacterId, type CharacterType, type StorylineId, type StorytellerGameView } from '@ct/protocol';
import { charName, CharacterSelect } from '../hud/shared';
import { ConfirmButton, type Send } from './stage';
import { charactersOf, checkBag, coreLine, countsLine, storylineOptions, storylineTitle, TYPE_ORDER } from './dealLogic';

export type DealMode = 'random' | 'storyline' | 'bag' | 'hand';

const MODES: { id: DealMode; label: string; icon: string; hint: string }[] = [
  { id: 'random', label: 'Random', icon: '🎲', hint: 'A legal Trouble Brewing setup, dealt at random' },
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
  const n = view.players.length;
  const [bag, setBag] = useState<CharacterId[]>([]);
  const [nonstandard, setNonstandard] = useState(false);
  const [drunkBelieves, setDrunkBelieves] = useState<CharacterId | ''>('');
  const check = checkBag(bag, n);
  const toggle = (c: CharacterId) => setBag((b) => (b.includes(c) ? b.filter((x) => x !== c) : [...b, c]));
  const want = check.want;
  const typeCount: Record<CharacterType, [number, number | null]> = {
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
      ...(drunkBelieves && bag.includes('drunk') && !bag.includes(drunkBelieves) ? { drunkBelieves } : {}),
    });
  const canDeal = check.ready && (check.standard || nonstandard);
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
            {charactersOf(t).map((c) => (
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
      {bag.includes('drunk') && (
        <label class="cts-field">
          The Drunk believes they are
          <CharacterSelect value={drunkBelieves} allowEmpty onChange={setDrunkBelieves} only={charactersOf('townsfolk').filter((c) => !bag.includes(c))} />
          <small class="muted">(empty = random)</small>
        </label>
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
      <p class="muted cts-script-note">Red herring and bluffs are drawn at random; change them in the Grimoire afterwards.</p>
    </div>
  );
}

/** The script panel's Setup step: choose how to deal (default view the Storyteller sees). */
export function DealChooser({ view, send, openHand }: { view: StorytellerGameView; send: Send; openHand: () => void }) {
  const dealt = !!view.charactersAssigned;
  const [mode, setMode] = useState<DealMode>(view.deal?.method === 'storyline' ? 'storyline' : view.deal?.method === 'bag' ? 'bag' : 'random');
  const [story, setStory] = useState<StorylineId | null>(view.deal?.storyline ?? null);
  const n = view.players.length;
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
        modes={MODES}
        value={mode}
        label="How to deal"
        onPick={(m) => {
          if (m === 'hand') openHand();
          else setMode(m);
        }}
      />
      {mode === 'random' && dealButton(dealt ? '↻ Deal again (random)' : '🎲 Random setup', () => send({ type: 'random_setup' }))}
      {mode === 'storyline' && (
        <>
          <StorylineCards n={n} value={story} onPick={setStory} />
          {dealButton(story ? `📜 Deal “${storylineTitle(story)}”${dealt ? ' again' : ''}` : 'Pick a storyline', () => story && send({ type: 'deal_preset', storyline: story }), !storyOk)}
        </>
      )}
      {mode === 'bag' && <BagBuilder view={view} send={send} confirmRedeal={dealt} />}
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
