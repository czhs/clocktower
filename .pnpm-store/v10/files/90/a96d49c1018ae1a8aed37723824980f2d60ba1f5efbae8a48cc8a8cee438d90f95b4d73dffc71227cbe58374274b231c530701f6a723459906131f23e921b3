/**
 * Runtime lifecycle states of the signal connection.
 *
 * `offline` is the resting state after the transport was lost without an explicit close: no
 * attempt is in flight, but a resume is still legal. It is what makes retrying a failed resume
 * expressible — `closed` is only reached by an explicit close or by a terminal attempt failure.
 */
export type SignalLifecycleState = 'new' | 'connecting' | 'connected' | 'offline' | 'reconnecting' | 'disconnecting' | 'closed';
export interface SignalMachineContext {
    /** Monotonic id of the current (re)connection attempt and of the transport it owns */
    attemptId: number;
    /** Error or reason that ended the last attempt, kept for diagnostics. */
    lastError?: unknown;
    /** Reason passed to the last close request. */
    closeReason?: string;
}
export type SignalMachineInput = 
/**
 * Start an initial session, or restart from scratch (full reconnect).
 *
 * Establishing is legal exactly where no transport and no attempt are in play: `new`, `offline`
 * and `closed`. `closed` is included because it means "no transport", not "session over" — a
 * deliberate close and an unexpected loss leave the session equally resumable, and the engine
 * recovers from both. Establishing over a live session, or over an attempt already in flight, is
 * a caller error; `disconnecting` is waited out rather than refused.
 */
{
    type: 'connect';
}
/**
 * Resume the existing session: legal wherever establishing is, minus `new` (nothing to resume
 * yet), plus `connected` — the peer connection can be severed while signalling stays up.
 */
 | {
    type: 'reconnect';
}
/**
 * An attempt established its transport. Carries the attempt it belongs to: an attempt that a
 * newer one has already superseded must not declare the session live.
 */
 | {
    type: 'connectComplete';
    attemptId: number;
} | {
    type: 'connectFailed';
    error?: unknown;
} | {
    type: 'reconnectComplete';
    attemptId: number;
}
/**
 * A resume attempt ended. `recoverable` distinguishes "another resume may follow" (→ `offline`)
 * from a terminal outcome such as a server leave or an expired token (→ `closed`).
 */
 | {
    type: 'reconnectFailed';
    error?: unknown;
    recoverable: boolean;
}
/** The transport identified by `attemptId` was lost (unexpected ws close, ping timeout). */
 | {
    type: 'transportFailed';
    attemptId: number;
    reason: string;
} | {
    type: 'close';
    reason: string;
} | {
    type: 'closeComplete';
};
/**
 * Lifecycle model of the signal connection.
 *
 * The machine deliberately does not own connection attempts: `SignalClient` performs the
 * asynchronous work and reports the outcome. It also does not decide *whether* to reconnect —
 * that policy (backoff, resume vs. full reconnect, region failover, giving up) belongs to
 * `RTCEngine`, so transport loss lands in `offline` rather than starting a reconnect on its own.
 *
 * Each client gets its own instance: the context is mutable and per-connection.
 */
export declare function createSignalMachine(initialState?: SignalLifecycleState): import("machina").Fsm<SignalMachineContext, "new" | "connecting" | "connected" | "offline" | "reconnecting" | "disconnecting" | "closed", "connect" | "reconnect" | "connectComplete" | "connectFailed" | "reconnectComplete" | "reconnectFailed" | "transportFailed" | "close" | "closeComplete", never>;
export type SignalMachine = ReturnType<typeof createSignalMachine>;
/** All lifecycle states, derived from the machine itself so the two cannot drift. */
export declare const signalLifecycleStates: Array<SignalLifecycleState>;
//# sourceMappingURL=SignalClientStateMachine.d.ts.map
