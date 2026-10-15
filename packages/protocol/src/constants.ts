// Shared numeric limits. Owned by lead; change only with a note in docs/architecture.md.

export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 15;

export const TILE_SIZE = 16;
export const MAP_WIDTH_TILES = 96;
export const MAP_HEIGHT_TILES = 96;

/**
 * Walking speed in px/s. Server allows MOVE_TOLERANCE slack for jitter. (v2, 2026-10-15: 72 -> 150;
 * the whole town is one 45x37-tile screen, crossing it takes ~4 s.)
 */
export const PLAYER_SPEED = 150;
export const MOVE_TOLERANCE = 1.35;
/** Storyteller may accelerate travel up to this multiple of PLAYER_SPEED. */
export const STORYTELLER_MAX_SPEED_MULT = 4;

export const SERVER_TICK_HZ = 20;
export const SNAPSHOT_HZ = 12;

export const LOBBY_NAME_MIN = 3;
export const LOBBY_NAME_MAX = 40;
export const LOBBY_DESCRIPTION_MAX = 200;
export const DISPLAY_NAME_MIN = 1;
export const DISPLAY_NAME_MAX = 24;
export const CHAT_MAX = 280;

/** Default seconds players have to walk home after the bedtime bell. */
export const DEFAULT_BEDTIME_SECONDS = 45;
