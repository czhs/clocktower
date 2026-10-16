import type Room from '../room/Room';
export interface FrameMetadataOptions {
    /**
     * Dedicated worker for extracting packet trailers off the main thread.
     *
     * Encoded video streams are transferred to the worker for processing, which
     * avoids per-frame work on the main thread.
     */
    worker: Worker;
}
/**
 * Manages packet trailer extraction for received video tracks.
 *
 * When a track's TrackInfo indicates packet trailer features, the manager
 * wires up an encoded frame transform to strip the trailer from encoded frames
 * and cache the metadata for lookup.
 *
 * Packet trailer extraction is worker-only. If no worker is configured, the
 * SDK does not advertise packet trailer support and skips extraction.
 *
 * When E2EE is active, the E2EE FrameCryptor worker handles trailer
 * extraction directly (before decryption), so this manager only creates
 * the extractor/metadata cache — no separate pipeline is installed.
 *
 * @experimental
 */
export declare class FrameMetadataManager {
    private worker?;
    private room?;
    private extractors;
    /**
     * Tracks the trackId associated with each receiver that has had its
     * encoded streams handed off to the worker. Used to detect receiver
     * reuse (transceiver recycling) so we can remap trackIds instead of
     * re-transferring already-consumed streams.
     */
    private workerPipelines;
    constructor(options?: FrameMetadataOptions);
    /** @internal */
    setup(room: Room): void;
    private setupReceiver;
    private setupPassthroughReceiver;
    private setupWorkerReceiver;
    private teardownTrack;
    private cleanup;
    private onWorkerMessage;
    private onWorkerError;
}
/** @deprecated Use {@link FrameMetadataManager} instead. */
export declare const PacketTrailerManager: typeof FrameMetadataManager;
/** @deprecated Use {@link FrameMetadataOptions} instead. */
export type PacketTrailerOptions = FrameMetadataOptions;
//# sourceMappingURL=FrameMetadataManager.d.ts.map