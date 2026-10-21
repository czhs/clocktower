// Travellers and exile (Storyteller only). A Traveller is the Storyteller's manual pick for a player
// who cannot stay the whole game: they get a Traveller character and a secret alignment, sit outside
// the setup distribution (every deal skips them) and leave by EXILE, never execution.
//
//   TravellerSetup   make / change / (in setup) undo Travellers
//   ExileControls    the day's exile vote: call it, open it, set anyone's hand, tally or withdraw
import { useState } from 'preact/hooks';
import { CHARACTER_INFO, TRAVELLER_IDS, type CharacterId, type StorytellerGameView } from '@ct/protocol';
import { CharacterSelect, nameOf } from '../hud/shared';
import { ConfirmButton, EVERYONE, type Send } from './stage';

type Alignment = 'good' | 'evil';

function AlignmentToggle({ value, onPick }: { value: Alignment; onPick: (a: Alignment) => void }) {
  return (
    <span class="cts-seg" role="radiogroup" aria-label="Alignment (secret)">
      {(['good', 'evil'] as const).map((a) => (
        <button key={a} type="button" role="radio" aria-checked={value === a} class={value === a ? 'on' : ''} onClick={() => onPick(a)}>
          {a === 'good' ? 'Good' : 'Evil'}
        </button>
      ))}
    </span>
  );
}

export function TravellerSetup({ view, send }: { view: StorytellerGameView; send: Send }) {
  const travellers = view.travellers ?? [];
  const setup = view.phase === 'setup';
  const taken = new Set(travellers.map((t) => t.character));
  const free = TRAVELLER_IDS.filter((c) => !taken.has(c)) as CharacterId[];
  const candidates = view.players.filter((p) => !travellers.some((t) => t.seat === p.seat) && (setup || p.alive));
  const [seat, setSeat] = useState<number | ''>('');
  const [character, setCharacter] = useState<CharacterId | ''>('');
  const [alignment, setAlignment] = useState<Alignment>('good');
  const add = () => {
    if (seat === '' || !character) return;
    send({ type: 'set_traveller', seat, character, alignment });
    setSeat('');
    setCharacter('');
  };
  return (
    <details class="cts-travellers" open={travellers.length > 0}>
      <summary>
        Travellers {travellers.length > 0 && <span class="muted">({travellers.length})</span>}
      </summary>
      <p class="muted cts-script-note">
        For players who cannot stay: they sit outside the setup (deals skip them), everyone sees their character, only you know their alignment, and
        they leave by exile, never execution.
      </p>
      {travellers.length > 0 && (
        <ul class="cts-noms">
          {travellers.map((t) => (
            <li key={t.seat}>
              <span class="cts-grow">
                <b>{nameOf(view.players, t.seat)}</b>
              </span>
              <CharacterSelect
                script="custom"
                value={t.character}
                only={[t.character, ...free]}
                onChange={(c) => c && send({ type: 'set_traveller', seat: t.seat, character: c, alignment: t.alignment })}
              />
              <AlignmentToggle value={t.alignment} onPick={(a) => send({ type: 'set_traveller', seat: t.seat, character: t.character, alignment: a })} />
              {setup && (
                <button class="cts-icon" title="No longer a Traveller" aria-label={`${nameOf(view.players, t.seat)} is no longer a Traveller`} onClick={() => send({ type: 'set_traveller', seat: t.seat, character: null })}>
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {free.length > 0 && candidates.length > 0 && (
        <div class="cts-traveller-add">
          <select value={seat === '' ? '' : String(seat)} onChange={(e) => setSeat((e.currentTarget as HTMLSelectElement).value === '' ? '' : Number((e.currentTarget as HTMLSelectElement).value))} aria-label="Player">
            <option value="">Player…</option>
            {candidates.map((p) => (
              <option key={p.seat} value={p.seat}>
                {p.name}
              </option>
            ))}
          </select>
          <CharacterSelect script="custom" value={character} allowEmpty only={free} onChange={setCharacter} />
          <AlignmentToggle value={alignment} onPick={setAlignment} />
          {setup ? (
            <button class="primary" disabled={seat === '' || !character} onClick={add}>
              Make Traveller
            </button>
          ) : (
            <ConfirmButton
              class="primary"
              disabled={seat === '' || !character}
              ask={`Turn ${seat === '' ? 'this player' : nameOf(view.players, seat)} into a Traveller now?`}
              audience={EVERYONE}
              undo="yes"
              onConfirm={add}
            >
              Make Traveller
            </ConfirmButton>
          )}
        </div>
      )}
      {setup && view.charactersAssigned && travellers.length > 0 && <p class="muted cts-script-note">Changing who is a Traveller after the deal means dealing again.</p>}
    </details>
  );
}

export function ExileControls({ view, send }: { view: StorytellerGameView; send: Send }) {
  const ex = view.exile;
  const running = ex && (ex.status === 'pending' || ex.status === 'voting') ? ex : null;
  const exiled = new Set(view.players.filter((p) => p.exiled).map((p) => p.seat));
  // A dead Traveller may still be exiled (the engine allows it); only an exiled one is done.
  const open = (view.travellers ?? []).filter((t) => !exiled.has(t.seat));
  if (!running && !open.length) return null;
  if (running) {
    const who = nameOf(view.players, running.travellerSeat);
    const hands = new Set(running.hands);
    return (
      <div class="cts-votenow cts-exile" role="status">
        <div>
          Exile <b>{who}</b> <span class="muted">({CHARACTER_INFO[(view.travellers ?? []).find((t) => t.seat === running.travellerSeat)?.character ?? 'scapegoat'].name})</span>
        </div>
        <div class="cts-votecount">
          ✋ {running.hands.length} / {running.threshold}
          <span class="cts-votecount-t"> · everyone may vote, dead players keep their ghost vote</span>
        </div>
        {running.status === 'pending' ? (
          <div class="cts-bigrow">
            <button class="cts-big primary" onClick={() => send({ type: 'exile_start' })}>
              Open the exile vote
            </button>
          </div>
        ) : (
          <ul class="cts-exile-hands" aria-label="Hands (click to change)">
            {view.players
              .filter((p) => !exiled.has(p.seat))
              .map((p) => (
                <li key={p.seat}>
                  <button class={hands.has(p.seat) ? 'on' : ''} aria-pressed={hands.has(p.seat)} onClick={() => send({ type: 'exile_hand', seat: p.seat, vote: !hands.has(p.seat) })}>
                    {hands.has(p.seat) ? '✋ ' : ''}
                    {p.name}
                  </button>
                </li>
              ))}
          </ul>
        )}
        <div class="cts-bigrow">
          {running.status === 'voting' && (
            <button class="cts-big primary" onClick={() => send({ type: 'exile_tally' })} title="Lock every hand and count">
              Tally the exile
            </button>
          )}
          <ConfirmButton class="cts-big" ask="Withdraw this exile?" audience={EVERYONE} undo="yes" onConfirm={() => send({ type: 'exile_cancel' })}>
            Withdraw
          </ConfirmButton>
        </div>
      </div>
    );
  }
  return (
    <ul class="cts-noms cts-exile-call">
      {open.map((t) => (
        <li key={t.seat}>
          <span class="cts-grow">
            Traveller <b>{nameOf(view.players, t.seat)}</b> <span class="muted">({CHARACTER_INFO[t.character].name})</span>
          </span>
          <button onClick={() => send({ type: 'exile_call', seat: t.seat, startVote: true })} title="Everyone votes; at least half the living exiles them">
            Call for exile
          </button>
        </li>
      ))}
    </ul>
  );
}
