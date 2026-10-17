// OWNED BY rules-storyteller. Storyteller quality-of-life helpers: the Undo button names what it reverts.
import { describe, expect, it } from 'vitest';
import { projectForPlayer, projectForStoryteller } from '../src/index.js';
import { mkGame, st } from './helpers.js';

describe('undoLabel (what ↶ Undo reverts)', () => {
  it('names the last undoable command, follows undo back through the history, and is ST-only', () => {
    const s = mkGame(['washerwoman', 'empath', 'chef', 'poisoner', 'imp']);
    expect(projectForStoryteller(s).undoLabel).toBe('assign characters');
    st(s, { type: 'advance_phase', to: 'bedtime' });
    expect(projectForStoryteller(s).undoLabel).toBe('bedtime bell');
    st(s, { type: 'add_reminder', seat: 1, token: 'x' });
    expect(projectForStoryteller(s).undoLabel).toBe("P2's reminder");
    st(s, { type: 'set_status', seat: 2, poisoned: true });
    expect(projectForStoryteller(s).undoLabel).toBe("P3's status");
    // Presence-only commands are not undoable: the label stays on the previous command.
    st(s, { type: 'set_travel_speed', mult: 2 });
    expect(projectForStoryteller(s).undoLabel).toBe("P3's status");
    st(s, { type: 'undo_last' });
    expect(projectForStoryteller(s).undoLabel).toBe("P2's reminder");
    // Players never see it.
    expect(JSON.stringify(projectForPlayer(s, 0))).not.toContain('undoLabel');
  });

  it('kill / execute / nominations read naturally', () => {
    const s = mkGame(['washerwoman', 'empath', 'chef', 'poisoner', 'imp']);
    st(s, { type: 'force_phase', to: 'day' });
    st(s, { type: 'kill', seat: 1, announce: true });
    expect(projectForStoryteller(s).undoLabel).toBe('kill P2');
    st(s, { type: 'create_nomination', nominatorSeat: 0, nomineeSeat: 3 });
    expect(projectForStoryteller(s).undoLabel).toBe('P1 nominates P4');
    st(s, { type: 'force_execute', seat: null });
    expect(projectForStoryteller(s).undoLabel).toBe('no execution');
  });

  it('is null when there is nothing to undo', () => {
    const s = mkGame(['washerwoman', 'empath', 'chef', 'poisoner', 'imp']);
    st(s, { type: 'undo_last' });
    expect(projectForStoryteller(s).canUndo).toBe(false);
    expect(projectForStoryteller(s).undoLabel).toBeNull();
  });
});
