import { type Throws } from '@livekit/throws-transformer/throws';
import { LivekitReasonedError } from '../errors';
import { type DataTrackFrameInternal } from './frame';
import { DataTrackPacket } from './packet';
/** An error indicating a frame was dropped. */
export declare class DataTrackDepacketizerDropError<Reason extends DataTrackDepacketizerDropReason = DataTrackDepacketizerDropReason> extends LivekitReasonedError<Reason> {
    readonly name = "DataTrackDepacketizerDropError";
    reason: Reason;
    reasonName: string;
    frameNumber: number;
    constructor(message: string, reason: Reason, frameNumber: number, options?: {
        cause?: unknown;
    });
    static interrupted(frameNumber: number, newFrameNumber: number): DataTrackDepacketizerDropError<DataTrackDepacketizerDropReason.Interrupted>;
    static unknownFrame(frameNumber: number): DataTrackDepacketizerDropError<DataTrackDepacketizerDropReason.UnknownFrame>;
    static bufferFull(frameNumber: number): DataTrackDepacketizerDropError<DataTrackDepacketizerDropReason.BufferFull>;
    static incomplete(frameNumber: number, receivedPackets: number, expectedPackets: number): DataTrackDepacketizerDropError<DataTrackDepacketizerDropReason.Incomplete>;
}
/** Reason why a frame was dropped. */
export declare enum DataTrackDepacketizerDropReason {
    Interrupted = 0,
    UnknownFrame = 1,
    BufferFull = 2,
    Incomplete = 3
}
type PushOptions = {
    /** If true, throws `DataTrackDepacketizerDropError.interrupted` instead of logging a warning
     * when a new frame arrives while the partials map is at capacity. */
    throwOnInterruption: boolean;
    /** Maximum number of partial frames the depacketizer will track concurrently. When a new
     * frame arrives while the partials map is at capacity, the oldest partial is evicted (or
     * `DataTrackDepacketizerDropError.interrupted` is thrown when `throwOnInterruption` is set).
     * Defaults to 1. */
    maxPartialFrames?: number;
};
export default class DataTrackDepacketizer {
    /** Maximum number of packets to buffer per frame before dropping. */
    static MAX_BUFFER_PACKETS: number;
    /** Partial frames currently being assembled, keyed by frame number. `Map` preserves insertion
     * order, so the oldest entry is the first key. */
    private partials;
    /** Should be repeatedly called with received {@link DataTrackPacket}s - intermediate calls
     * aggregate the packet's state internally, and return null.
     *
     * Once this method is called with the final packet to form a frame, a new {@link DataTrackFrameInternal}
     * is returned.*/
    push(packet: DataTrackPacket, options?: PushOptions): Throws<DataTrackFrameInternal | null, DataTrackDepacketizerDropError>;
    reset(): void;
    private peekOldestPartialFrameNumber;
    private frameFromSingle;
    /** Begin assembling a new packet. */
    private beginPartial;
    /** Push to the existing partial frame. */
    private pushToPartial;
    /** Try to reassemble the complete frame. */
    private finalize;
}
export {};
//# sourceMappingURL=depacketizer.d.ts.map