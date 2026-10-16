// OWNED BY rules-storyteller. (v2.2) "Prepare" mode: the seated Storyteller's tools in the waiting
// room, so they can get used to the panel before the game.
//   * Real pre-game settings (StCommand 'prepare', stored server-side for this lobby, applied when the
//     game starts): how to deal at the start (by hand in the game / random / a storyline, dealt
//     automatically), bedtime countdown, vote clock speed, door tags, daily pamphlets. Only the
//     Storyteller's own lobby view carries them (LobbyRoomView.stPrepare).
//   * PRACTICE: the real Storyteller panel over a fake deal built locally from the lobby members'
//     public names (dealLogic.ts). Never sent, never stored; banner "Practice — nothing here is sent".
import { useMemo, useState } from 'preact/hooks';
import { MAX_PLAYERS, MIN_PLAYERS, type PrepareDeal, type StPreparePatch, type StorylineId } from '@ct/protocol';
import type { RoomConnection } from '../../net/room';
import { useStore } from '../../net/store';
import { ModeSwitch, StorylineCards } from './deal';
import { practiceNames, practiceReduce, practiceStart, practiceView, storylineTitle, type PracticeState } from './dealLogic';
import { StPanel } from './index';
import { Toggle } from './stage';
import './storyteller.css';

const DEALS: { id: PrepareDeal; label: string; icon: string; hint: string }[] = [
  { id: 'manual', label: 'In the game', icon: '✎', hint: 'Deal when the game has started (Setup step): random, storyline, your characters or by hand' },
  { id: 'random', label: 'Random', icon: '🎲', hint: 'Deal a random legal setup as soon as the game starts' },
  { id: 'storyline', label: 'Storyline', icon: '📜', hint: 'Deal the chosen storyline at random as soon as the game starts' },
];

function Stepper({ label, value, unit, onStep, min, max }: { label: string; value: number; unit: string; onStep: (dir: 1 | -1) => void; min: number; max: number }) {
  return (
    <div class="cts-prep-step">
      <span class="cts-prep-label">{label}</span>
      <button aria-label={`Less ${label}`} disabled={value <= min} onClick={() => onStep(-1)}>
        −
      </button>
      <span class="cts-prep-val">
        {value}
        {unit}
      </span>
      <button aria-label={`More ${label}`} disabled={value >= max} onClick={() => onStep(1)}>
        +
      </button>
    </div>
  );
}

export function StPrepare({ conn, onClose }: { conn: RoomConnection; onClose: () => void }) {
  const view = useStore(conn.lobbyView);
  const [practice, setPractice] = useState<PracticeState | null>(null);
  const [pickStory, setPickStory] = useState(false);
  const prep = view?.stPrepare;
  const memberNames = useMemo(() => (view?.members ?? []).filter((m) => m.role === 'player').map((m) => m.displayName), [view?.members]);
  if (!view || !prep) return null;
  const n = memberNames.length;
  const send = (p: StPreparePatch) => conn.send('st:command', { type: 'prepare', prepare: p });

  if (practice) {
    const names = practiceNames(memberNames);
    return (
      <StPanel
        view={practiceView(names, practice)}
        conn={conn}
        practice={{ send: (c) => setPractice((ps) => (ps ? practiceReduce(ps, names, c) : ps)), note: practice.note, onExit: () => setPractice(null) }}
      />
    );
  }

  const dealMode: PrepareDeal = pickStory ? 'storyline' : prep.deal;
  const pickDeal = (d: PrepareDeal) => {
    if (d === 'storyline' && !prep.storyline) return setPickStory(true); // choose one first
    setPickStory(false);
    send({ deal: d });
  };
  const pick = (id: StorylineId) => {
    setPickStory(false);
    send({ deal: 'storyline', storyline: id });
  };
  const bed = prep.bedtimeSeconds;
  const vote = prep.settings.voteSeconds;
  return (
    <aside class="cts dock-right cts-mode-script cts-prep" aria-label="Prepare the game">
      <header class="cts-head">
        <span class="cts-title">Storyteller</span>
        <span class="cts-head-phase">Prepare the game</span>
        <span class="cts-spacer" />
        <button class="cts-icon" onClick={onClose} title="Close" aria-label="Close the Storyteller tools">
          ✕
        </button>
      </header>
      <div class="cts-body">
        <p class="muted cts-script-note">Only you see this. It carries into the game; the players are told nothing.</p>

        <h3 class="cts-script-h">When the game starts, deal…</h3>
        <ModeSwitch modes={DEALS} value={dealMode} onPick={pickDeal} label="How to deal at the start" />
        {dealMode === 'manual' && <p class="cts-script-note muted">You deal in the Setup step: random, a storyline, your own characters, or seat by seat.</p>}
        {dealMode === 'random' && <p class="cts-script-note muted">A random legal setup is dealt the moment you start. You can re-deal or tweak it before the first night.</p>}
        {dealMode === 'storyline' && (
          <>
            <p class="cts-script-note">
              {prep.storyline && !pickStory ? (
                <>
                  <b>{storylineTitle(prep.storyline)}</b> is dealt at random the moment you start.{' '}
                </>
              ) : (
                <>Pick a storyline. </>
              )}
              <span class="muted">{n >= MIN_PLAYERS ? `Shown for ${n} players (today's lobby).` : `Shown for ${MIN_PLAYERS} players; it is checked again at the start.`}</span>
            </p>
            <StorylineCards n={Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, n))} value={pickStory ? null : prep.storyline} onPick={pick} />
          </>
        )}

        <h3 class="cts-script-h">Timers & table rules</h3>
        <Stepper label="Bedtime" unit=" s" value={bed} min={10} max={300} onStep={(d) => send({ bedtimeSeconds: Math.max(10, Math.min(300, bed + d * 15)) })} />
        <Stepper label="Vote clock" unit=" s / seat" value={vote} min={0.5} max={15} onStep={(d) => send({ settings: { voteSeconds: Math.max(0.5, Math.min(15, vote + d * 0.5)) } })} />
        <div class="cts-bigrow">
          <Toggle on={prep.settings.doorTags} label="Door tags" onClick={() => send({ settings: { doorTags: !prep.settings.doorTags } })} />
          <Toggle on={!!prep.settings.pamphlets} label="Daily pamphlets" onClick={() => send({ settings: { pamphlets: !prep.settings.pamphlets } })} />
        </div>
        <p class="muted cts-script-note">Door tags: players' icons hang on the door of the building they are in (by day). Pamphlets: you may release a public summary of each day.</p>

        <h3 class="cts-script-h">Practise the panel</h3>
        <p class="cts-script-note">
          Try the real Storyteller panel on a pretend deal of this lobby{n < MIN_PLAYERS ? ' (sample townsfolk fill the empty seats)' : ''}. Nothing is sent to anyone.
        </p>
        <button class="cts-big cts-wide" onClick={() => setPractice(practiceStart((Math.random() * 0xffffffff) >>> 0))}>
          ▶ Practice
        </button>
      </div>
    </aside>
  );
}
