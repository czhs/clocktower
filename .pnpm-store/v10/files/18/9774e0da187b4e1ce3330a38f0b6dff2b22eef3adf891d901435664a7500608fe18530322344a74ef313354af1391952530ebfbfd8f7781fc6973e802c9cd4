import type { NonSharedUint8Array } from '../../type-polyfills/non-shared-typed-arrays';
import { FlowControlledDataChannel, type FlowControlledDataChannelOptions } from './FlowControlledDataChannel';
export interface ReliableDataChannelOptions extends FlowControlledDataChannelOptions {
    /**
     * Whether sends should currently be deferred to the resume replay instead of hitting the wire
     * (i.e. a reconnect attempt is underway). Read at send time so the reliable channel matches the
     * engine's reconnect state without owning it.
     */
    isDeferringSends: () => boolean;
}
/**
 * The reliable channel: flow control plus delivery-across-resume semantics.
 *
 * Every packet gets a monotonic sequence (stamped into the protobuf by the caller before
 * serialization, via {@link nextSequence}) and is retained in a replay buffer until the channel's
 * `bufferedAmount` confirms it has been handed to the transport. Sends that land in a reconnect
 * window — or whose headroom wait is torn down transiently — are queued unsent and resolve;
 * {@link replay} delivers them (plus any unacked packets) after a resume. Only an engine close
 * rejects, because no replay is coming after that.
 */
export declare class ReliableDataChannel extends FlowControlledDataChannel {
    private messageBuffer;
    private sequence;
    private isDeferringSends;
    constructor(opts: ReliableDataChannelOptions);
    /**
     * Claims the next packet sequence. The caller stamps it into the packet before serialization,
     * then passes it back to {@link send} so the replay buffer stays keyed by wire sequence.
     */
    nextSequence(): number;
    /**
     * Sends prepared bytes with reliable semantics. Resolves once the packet has either been handed
     * to the channel or queued for the resume replay; throws only when the engine is closed.
     */
    send(msg: NonSharedUint8Array, sequence: number): Promise<void>;
    /**
     * Replays the buffered backlog after a resume: drops everything the server acked
     * (`lastMessageSeq`), then re-sends the rest in order. The headroom lock is held across the
     * whole replay — releasing it between messages would let a concurrent send (whose newer
     * sequence was already assigned before it queued on the lock) hit the wire mid-replay, and
     * receivers would then discard the remaining lower-sequence resent messages as duplicates.
     */
    replay(lastMessageSeq: number): Promise<void>;
    /**
     * Before recomputing status, trim packets the transport has now delivered — a send or a drain
     * may have acked buffered packets, and the replay buffer is keyed off the channel's buffered
     * bytes.
     */
    refreshBufferStatus(): void;
    /**
     * Drops all replay state and restarts sequencing. Only valid on a full reconnect, where the
     * session (and the receivers' sequence tracking) starts over.
     */
    reset(): void;
}
//# sourceMappingURL=ReliableDataChannel.d.ts.map