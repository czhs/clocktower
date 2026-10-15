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
    title: 'A town to wander',
    lines: ['Every villager you meet is one of your friends.', 'Walk the lanes, find the square, gather under the clock tower.'],
    glyph: '⌂',
  },
  {
    id: 'talk',
    clip: 'talk',
    title: 'Talk to whoever is near',
    lines: ['The square hears everyone.', 'Step into a side street and only the friend beside you can hear.'],
    glyph: '❝',
  },
  {
    id: 'inside',
    clip: 'inside',
    title: 'Step inside for a private word',
    lines: ['Behind a closed door, only the people in the room can hear you.', 'The door shows who is inside.'],
    glyph: '🚪',
  },
  {
    id: 'night',
    clip: 'night',
    title: 'At night, walk home and wait…',
    lines: ['When the bell tolls, head to your cottage.', 'Night falls once everyone is in.'],
    glyph: '☾',
  },
  {
    id: 'visit',
    clip: 'visit',
    title: 'The Storyteller visits in secret',
    lines: ['If your character wakes at night, the Storyteller comes to your door.', 'Nobody else sees the visit or your answer.'],
    glyph: '🕯',
  },
  {
    id: 'vote',
    clip: 'vote',
    title: 'Gather, nominate, vote',
    lines: ['Raise your hand before the clock hand reaches you.', 'Even the dead keep talking, and keep one ghost vote.'],
    glyph: '✋',
  },
  {
    id: 'storyteller',
    clip: 'storyteller',
    title: 'The Storyteller runs the show',
    lines: ['A human Storyteller guides every game.', 'Their panel tracks who to visit, who is ready and every vote.'],
    glyph: '✦',
  },
];

/** Opened from a lobby invite: keep it short, the game is waiting. */
export const INVITED_CARDS = ['town', 'talk', 'visit', 'vote'];
