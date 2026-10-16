/**
 * Ring window (seconds) assumed when a request doesn't set a ringing timeout;
 * matches the server default. A dialing request must outlast it.
 */
declare const DEFAULT_RINGING_TIMEOUT_SECONDS = 30;
/**
 * When a call waits on ringing, the request must outlast the ringing window or
 * it would abort before the call can be answered. We keep at least this margin
 * (seconds) of request timeout above the ringing timeout.
 */
declare const RINGING_TIMEOUT_MARGIN_SECONDS = 2;
/**
 * Resolves the request timeout (seconds) for a phone-dialing call: the ring
 * window plus a margin, so the request doesn't abort before the call can be
 * answered. The ring window is the request's `ringingTimeout` when set, else
 * {@link DEFAULT_RINGING_TIMEOUT_SECONDS}. A longer user-supplied `timeout` is
 * honored; a shorter one is raised to the floor.
 */
declare function dialRequestTimeout(timeout: number | undefined, ringingTimeout: number | undefined): number;

export { DEFAULT_RINGING_TIMEOUT_SECONDS, RINGING_TIMEOUT_MARGIN_SECONDS, dialRequestTimeout };
