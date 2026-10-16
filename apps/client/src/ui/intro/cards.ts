// The tour's cards: one real gameplay clip each (recorded by tests/e2e/capture-tutorial.spec.ts into
// public/tutorial/, listed in manifest.json by clip id) with a one-line caption and 1-2 short lines.

export interface TourCard {
  id: string;
  /** Clip id in /tutorial/manifest.json. */
  clip: string;
  title: string;
  lines: string[];
  /** Shown in place of the clip when footage is missing. */
  glyph: string;
}

export const CARDS: TourCard[] = [
  {
    id: 'town',
    clip: 'town',
    title: 'One square, fifteen cottages',
    lines: ['Every character you meet is one of your friends.', 'Out on the square, everyone hears everyone.'],
    glyph: '⌂',
  },
  {
    id: 'inside',
    clip: 'inside',
    title: 'Tap a cottage for a private word',
    lines: ['Doors open by themselves: tap a cottage, or just walk in.', 'Inside, only the people in the room can hear each other.'],
    glyph: '🚪',
  },
  {
    id: 'point',
    clip: 'point',
    title: 'Point, and pin your suspects',
    lines: ['Right-click (or long-press) to point at someone.', 'Press F to pin a person or a spot with your face on it.'],
    glyph: '☝',
  },
  {
    id: 'notebook',
    clip: 'notebook',
    title: 'Keep a private notebook',
    lines: ['Press N for a note and a trust mark on every player.', 'Nobody else can read it, not even the Storyteller.'],
    glyph: '✎',
  },
  {
    id: 'night',
    clip: 'night',
    title: 'At the bell, walk home',
    lines: ['When the bell tolls, tap your cottage to head home.', 'Night falls once everyone is in.'],
    glyph: '☾',
  },
  {
    id: 'visit',
    clip: 'visit',
    title: 'The Storyteller visits in secret',
    lines: ['If your character wakes at night, the Storyteller appears in your home.', 'Nobody else sees the visit or your answer.'],
    glyph: '🕯',
  },
  {
    id: 'vote',
    clip: 'vote',
    title: 'Gather, nominate, vote',
    lines: ['Raise your hand before the clock hand reaches you.', 'The dead keep talking; a halo means their ghost vote is unspent.'],
    glyph: '✋',
  },
  {
    id: 'storyteller',
    clip: 'storyteller',
    title: 'The Storyteller runs the show',
    lines: ['A human Storyteller guides every game from a simple script.', 'One click to cross the square, one more to visit a home.'],
    glyph: '✦',
  },
];

/** Opened from a lobby invite: keep it short, the game is waiting. */
export const INVITED_CARDS = ['town', 'inside', 'visit', 'vote'];
