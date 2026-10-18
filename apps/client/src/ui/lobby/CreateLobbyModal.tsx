// The create-lobby dialog (lazy chunk of LobbyFinder, prefetched on idle; v3 WP6 split it out of the entry chunk).
// (v3 WP6) The "Town" choice (Classic (v2) / Hollowmere (v3), docs/v3/INTEGRATION.md §9.1 user decision) is sent
// as CreateLobbyRequest.world. The pre-selection is ONE constant, DEFAULT_WORLD (the user decides it at C3 / Q7);
// the dialog deliberately does not remember a previous pick, so flipping the constant reaches everyone.
import { useEffect, useState } from 'preact/hooks';
import { LOBBY_DESCRIPTION_MAX, LOBBY_NAME_MAX, LOBBY_NAME_MIN, MAX_PLAYERS, MIN_PLAYERS, SCRIPTS, type LobbySummary, type ScriptId, type StorytellerMode, type WorldId, wordLobbyName } from '@ct/protocol';
import { api } from '../../net/api';
import { ModeChoice, WORLD_BADGE } from './ModeSettings';
import { createLobbyBody, errorText, SCRIPT_LABEL } from './finder';

/** (v3) The two towns a lobby can be built in (fixed at creation). */
export const WORLD_COPY: Record<WorldId, { title: string; sub: string; line: string }> = {
  v2: { title: 'Classic', sub: WORLD_BADGE.v2.title, line: 'The 2D pixel town everyone knows. Runs on every device.' },
  v3: { title: 'Hollowmere', sub: WORLD_BADGE.v3.title, line: 'Drawn in 3D where the device can; others see it in Classic 2D.' },
};
/** Pre-selected town in the create dialog: the only source of the pre-selection (Q7 decides at C3 whether it becomes 'v3'). */
export const DEFAULT_WORLD: WorldId = 'v2';

/** Town choice for the create dialog (radio semantics, like ModeChoice). */
export function WorldChoice({ value, onChange, disabled, name = 'ct-world' }: { value: WorldId; onChange: (w: WorldId) => void; disabled?: boolean; name?: string }) {
  return (
    <div class="ct-modes ct-worlds" role="radiogroup" aria-label="Town">
      {(['v2', 'v3'] as const).map((w) => (
        <label key={w} class={`ct-mode-opt ct-world-opt-${w}${value === w ? ' on' : ''}${disabled ? ' disabled' : ''}`}>
          <input type="radio" name={name} value={w} checked={value === w} disabled={disabled} onChange={() => onChange(w)} />
          <span class="ct-mode-title">{WORLD_COPY[w].title}</span>
          <span class="ct-mode-sub">{WORLD_COPY[w].sub}</span>
          <span class="ct-mode-line">{WORLD_COPY[w].line}</span>
        </label>
      ))}
    </div>
  );
}

export function CreateLobbyModal({ onClose, onCreated }: { onClose: () => void; onCreated: (l: LobbySummary, takeStoryteller: boolean) => void }) {
  // (v2.2) prefilled with a simple-words name; ↻ suggests another; left blank -> the suggestion.
  const [suggested, setSuggested] = useState(wordLobbyName);
  const [name, setName] = useState(suggested);
  const [maxPlayers, setMaxPlayers] = useState(MAX_PLAYERS); // a full town by default (15)
  const [script, setScript] = useState<ScriptId>('trouble-brewing');
  const [description, setDescription] = useState('');
  const [takeSt, setTakeSt] = useState(true);
  const [mode, setMode] = useState<StorytellerMode>('human');
  const [world, setWorld] = useState<WorldId>(DEFAULT_WORLD);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e: Event) => {
    e.preventDefault();
    const finalName = name.trim() || suggested;
    if (finalName.length < LOBBY_NAME_MIN) return setError(`Name must be at least ${LOBBY_NAME_MIN} characters`);
    setBusy(true);
    setError(null);
    try {
      const body = createLobbyBody({ name: finalName, maxPlayers, script, description, takeStoryteller: takeSt, mode, world });
      const st = body.takeStoryteller === true;
      const { lobby } = await api.createLobby(body);
      onCreated(lobby, st);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <div class="ct-modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form class="panel ct-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="ct-create-title">
        <h2 id="ct-create-title">Create lobby</h2>
        <div class="ct-field">
          <label for="ct-create-name">Lobby name</label>
          <div class="ct-name-row">
            <input
              id="ct-create-name"
              value={name}
              placeholder={suggested}
              maxLength={LOBBY_NAME_MAX}
              autoFocus
              onFocus={(e) => (e.currentTarget as HTMLInputElement).select()}
              onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)}
            />
            <button
              type="button"
              class="ct-reroll"
              title="Suggest another name"
              aria-label="Suggest another name"
              onClick={() => {
                const next = wordLobbyName();
                setSuggested(next);
                setName(next);
              }}
            >
              ↻
            </button>
          </div>
        </div>
        <div class="ct-modal-grid">
          <label class="ct-field">
            <span>Player seats ({MIN_PLAYERS}–{MAX_PLAYERS})</span>
            <select value={String(maxPlayers)} onChange={(e) => setMaxPlayers(Number((e.currentTarget as HTMLSelectElement).value))}>
              {Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i).map((n) => (
                <option key={n} value={n}>
                  {n} players
                </option>
              ))}
            </select>
          </label>
          <label class="ct-field">
            <span>Script</span>
            <select value={script} onChange={(e) => setScript((e.currentTarget as HTMLSelectElement).value as ScriptId)}>
              {SCRIPTS.map((s) => (
                <option key={s} value={s}>
                  {SCRIPT_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label class="ct-field">
          <span>Description (optional)</span>
          <textarea
            rows={3}
            value={description}
            maxLength={LOBBY_DESCRIPTION_MAX}
            onInput={(e) => setDescription((e.currentTarget as HTMLTextAreaElement).value)}
          />
        </label>
        <div class="ct-field">
          <span>Town</span>
          <WorldChoice value={world} onChange={setWorld} name="ct-create-world" />
        </div>
        <div class="ct-field">
          <span>Who runs the game?</span>
          <ModeChoice value={mode} onChange={setMode} name="ct-create-mode" />
        </div>
        {mode === 'human' ? (
          <label class="ct-check">
            <input type="checkbox" checked={takeSt} onChange={(e) => setTakeSt((e.currentTarget as HTMLInputElement).checked)} />
            <span>Take the Storyteller seat (not counted as a player)</span>
          </label>
        ) : (
          <p class="muted ct-small">You play too. Adjust the day and night timings in the waiting room.</p>
        )}
        <p class="muted ct-small">Lobbies are public on this server — anyone signed in can see and join. No password needed.</p>
        {error && <p class="ct-error" role="alert">{error}</p>}
        <div class="ct-row">
          <button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" class="primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}
