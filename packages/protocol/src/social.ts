import { z } from 'zod';

// ---------------------------------------------------------------------------------------
// (v2, lead) Social signals: emotes and pins. Purely social/public gestures — never game state.
//
// Visibility (server-enforced, like entities):
//   * an EMOTE is delivered (S2C 'social:emote') only to clients who can currently see the emoter
//     (the same viewer rule as world snapshots: same location; at night a player sees only their
//     own home; the Storyteller sees everyone). Nobody else learns it happened.
//   * a PIN belongs to the location where it was dropped ('outdoors' or 'bld:<id>'). Snapshots carry
//     only the pins of the viewer's current location (the Storyteller: of the Storyteller's
//     location). A person-pin is drawn on its target only while the viewer can see the target.
//   * pins and emotes are cleared when the game ends; the Storyteller may clear all pins anytime.

export const PIN_COLORS = ['gold', 'crimson', 'violet', 'teal', 'green', 'orange', 'white', 'black'] as const;
export type PinColor = (typeof PIN_COLORS)[number];
/** Max live pins per member (dropping one more removes that member's oldest). */
export const MAX_PINS_PER_MEMBER = 6;
/** How long a point emote is shown (ms). */
export const EMOTE_POINT_MS = 3500;

/** How long the 'nick-face' emote replaces the emoter's head (ms). */
export const NICK_FACE_MS = 3000;
/** The only roster character (Cosmetics.preset) allowed to send the 'nick-face' emote. */
export const NICK_FACE_CHARACTER = 'nicksong';

/**
 * 'point'     — point at a spot or a person.
 * 'nick-face' — (v2.2, additive) Nick Song's head becomes a 😝 for NICK_FACE_MS; only a player whose
 *               lobby character is NICK_FACE_CHARACTER may send it (server: 'invalid' otherwise).
 */
export const EMOTES = ['point', 'nick-face'] as const;
export type EmoteKind = (typeof EMOTES)[number];

const Coord = z.number().finite().min(-64).max(4096);

export const PinTarget = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('place'), x: Coord, y: Coord }),
  z.object({ kind: z.literal('person'), pid: z.string().min(1).max(64) }),
]);
export type PinTarget = z.infer<typeof PinTarget>;

/** C2S 'social:pin' — drop a pin (your character's icon on a pin of `color`). */
export const PinDropMsg = z.object({ target: PinTarget, color: z.enum(PIN_COLORS) });
/** C2S 'social:unpin' — remove one of your pins (the Storyteller may remove anyone's). */
export const PinRemoveMsg = z.object({ id: z.string().min(1).max(32) });
/** C2S 'social:clearPins' — 'mine' = all your pins; 'all' = everyone's (Storyteller only). */
export const PinClearMsg = z.object({ scope: z.enum(['mine', 'all']) });
/** C2S 'social:emote' — point at a spot (world px; a person = their feet), or Nick Song's 'nick-face'. */
export const EmoteMsg = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('point'), x: Coord, y: Coord, pid: z.string().min(1).max(64).optional() }),
  z.object({ kind: z.literal('nick-face') }),
]);
export type EmoteMsg = z.infer<typeof EmoteMsg>;

export interface PinView {
  id: string;
  /** Who dropped it (pid). */
  by: string;
  /** The dropper's character (cast id) when dropped — the icon on the pin ('storyteller' for the ST). */
  character: string;
  color: PinColor;
  target: { kind: 'place'; x: number; y: number } | { kind: 'person'; pid: string };
  /** Server time it was dropped (ms). */
  at: number;
}

export interface EmoteEvent {
  pid: string;
  kind: EmoteKind;
  /** Where they point (world px). 'nick-face': the emoter's own position. */
  x: number;
  y: number;
  /** Pointing at this person (if any). */
  target?: string;
  at: number;
}
