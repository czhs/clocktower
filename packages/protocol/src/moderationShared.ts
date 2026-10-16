// (v2.3 OPS-6, sec-ops) Moderation constants shared by server and client. zod-free: re-exported by
// both the full protocol and `@ct/protocol/client`.

/**
 * Per-lobby chat filter (host setting, waiting room). Applied by the server BEFORE a chat line is
 * delivered, so chat panes and speech bubbles always show the same (masked) text.
 *   off    nothing is masked
 *   slurs  identity slurs only (default)
 *   strict slurs plus general profanity
 */
export const CHAT_FILTER_MODES = ['off', 'slurs', 'strict'] as const;
export type ChatFilterMode = (typeof CHAT_FILTER_MODES)[number];
export const DEFAULT_CHAT_FILTER: ChatFilterMode = 'slurs';

/** Why a player is reported (report:player). */
export const REPORT_REASONS = ['harassment', 'hate', 'cheating', 'spam', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
/** At most this many chat lines (by id) can be attached to one report. */
export const REPORT_MAX_MESSAGES = 10;
export const REPORT_NOTE_MAX = 300;
