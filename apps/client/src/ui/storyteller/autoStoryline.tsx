// OWNED BY rules-storyteller. (v2.2) Automatic games: the host picks the storyline fate deals
// (lobby:settings autoStoryline, null = random). The choice is SECRET in the public lobby summary
// ('secret') unless the host announces it: knowing the storyline tells which characters are likely
// in play. Only the host's own view carries the pick (LobbyRoomView.autoStorylineChoice).
// Small and dependency-free on purpose: it lives in the waiting-room chunk.
import { MIN_PLAYERS, STORYLINES, type LobbyRoomView, type StorylineId } from '@ct/protocol';
import type { RoomConnection } from '../../net/room';
import { storylineOptions, storylineTitle } from './dealLogic';

export function autoStorylineLine(view: LobbyRoomView): string {
  const s = view.lobby.autoStoryline;
  if (!s || s === 'random') return 'Storyline: random setup';
  if (s === 'secret') return 'Storyline: secret (chosen by the host)';
  return `Storyline: ${storylineTitle(s) ?? s}`;
}

export function AutoStorylineSetting({ view, conn, isHost }: { view: LobbyRoomView; conn: RoomConnection; isHost: boolean }) {
  if (view.lobby.script !== 'trouble-brewing') return <p class="muted ct-small">Characters are dealt at random from this script (storylines are Trouble Brewing only).</p>;
  if (!isHost) return <p class="muted ct-small">{autoStorylineLine(view)}</p>;
  const choice = view.autoStorylineChoice ?? null;
  const n = Math.max(MIN_PLAYERS, view.members.filter((m) => m.role === 'player').length);
  const opts = storylineOptions(n);
  const announced = !!view.lobby.autoStoryline && view.lobby.autoStoryline !== 'random' && view.lobby.autoStoryline !== 'secret';
  return (
    <div class="ct-auto-story">
      <label class="ct-small">
        Storyline{' '}
        <select
          value={choice ?? ''}
          onChange={(e) => {
            const v = (e.currentTarget as HTMLSelectElement).value;
            conn.send('lobby:settings', { autoStoryline: v ? (v as StorylineId) : null });
          }}
        >
          <option value="">Random setup</option>
          {STORYLINES.map((d) => {
            const o = opts.find((x) => x.def.id === d.id)!;
            return (
              <option key={d.id} value={d.id} title={d.blurb}>
                {d.title} ({o.counts} players)
              </option>
            );
          })}
        </select>
      </label>
      {choice && (
        <>
          <p class="muted ct-small">
            {STORYLINES.find((d) => d.id === choice)?.blurb}
            {!opts.find((o) => o.def.id === choice)?.supported && ` Not for ${n} players: fate deals at random instead.`}
          </p>
          <label class="ct-small">
            <input type="checkbox" checked={announced} onChange={(e) => conn.send('lobby:settings', { autoStorylinePublic: (e.currentTarget as HTMLInputElement).checked })} /> Announce it to everyone
            <span class="muted"> (otherwise it stays secret: it hints at which characters are in play)</span>
          </label>
        </>
      )}
    </div>
  );
}
