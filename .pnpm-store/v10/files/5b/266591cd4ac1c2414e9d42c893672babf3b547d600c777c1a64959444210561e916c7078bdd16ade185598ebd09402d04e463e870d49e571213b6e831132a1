import { type StructuredLogger } from '../../logger';
import { Future } from '../utils';
import { type DataTrackFrame } from './frame';
import type { DataTrackHandle } from './handle';
import type OutgoingDataTrackManager from './outgoing/OutgoingDataTrackManager';
import { DataTrackPushFrameError } from './outgoing/errors';
import type { DataTrackOptions } from './outgoing/types';
import { type IDataTrack, type ILocalTrack } from './track-interfaces';
import type { DataTrackInfo } from './types';
export default class LocalDataTrack implements ILocalTrack, IDataTrack {
    readonly trackSymbol: symbol;
    readonly isLocal = true;
    readonly typeSymbol: symbol;
    protected options: DataTrackOptions;
    /** Represents the currently active {@link DataTrackHandle} for the publication. */
    protected handle: DataTrackHandle | null;
    protected manager: OutgoingDataTrackManager;
    protected log: StructuredLogger;
    /** Resolves once the data track has sent all pending packets the rtc data channel buffer. */
    protected flushedFuture: Future<void, never>;
    protected isFlushed: boolean;
    /** @internal */
    constructor(options: DataTrackOptions, manager: OutgoingDataTrackManager);
    private handleManagerReset;
    private handleManagerPacketsFlushedChange;
    /** @internal */
    static withExplicitHandle(options: DataTrackOptions, manager: OutgoingDataTrackManager, handle: DataTrackHandle): LocalDataTrack;
    /** Metrics about the data track publication. */
    get info(): DataTrackInfo | undefined;
    /** The raw descriptor from the manager containing the internal state for this local track. */
    protected get descriptor(): import("./outgoing/OutgoingDataTrackManager").Descriptor | null;
    /**
     * Publish the track to the SFU. This must be done before calling {@link tryPush} for the first time.
     * @internal
     * */
    publish(signal?: AbortSignal): Promise<void>;
    isPublished(): this is {
        info: DataTrackInfo;
    };
    /** Try pushing a frame to subscribers of the track.
     *
     * Pushing a frame can fail for several reasons:
     *
     * - The track has been unpublished by the local participant or SFU
     * - The room is no longer connected
     */
    tryPush(frame: DataTrackFrame): Promise<import("@livekit/throws-transformer/throws").Throws<void, DataTrackPushFrameError<import("./outgoing/errors").DataTrackPushFrameErrorReason.TrackUnpublished> | DataTrackPushFrameError<import("./outgoing/errors").DataTrackPushFrameErrorReason.Dropped>>>;
    /**
     * When called, waits for all in flight packets to be sent before resolving.
     *
     * Use this to:
     *
     * 1. Send frames exactly in order:
     * ```ts
     * await track.tryPush(/* ... *\/);
     * await track.flush();
     * await track.tryPush(/* ... *\/);
     * await track.flush();
     * // ... etc ...
     * ```
     *
     * 2. Wait for frames to all be delivered before unpublishing a local data track:
     *
     * ```ts
     * await track.tryPush(/* ... *\/);
     * await track.tryPush(/* ... *\/);
     * await track.tryPush(/* ... *\/);
     * // ... etc ...
     * await track.flush();
     * await track.unpublish();
     * ```
     **/
    flush(): Promise<void>;
    /**
     * Unpublish the track from the SFU. Once this is called, any further calls to {@link tryPush}
     * will fail.
     * */
    unpublish(): Promise<void>;
}
//# sourceMappingURL=LocalDataTrack.d.ts.map