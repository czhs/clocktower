import type { Throws } from '@livekit/throws-transformer/throws';
import type TypedEmitter from 'typed-emitter';
import type { BaseE2EEManager } from '../../../e2ee/E2eeManager';
import { Future } from '../../utils';
import type { DataTrackFrameInternal } from '../frame';
import { DataTrackHandle } from '../handle';
import type { DataTrackInfo } from '../types';
import { DataTrackPublishError, DataTrackPushFrameError, DataTrackPushFrameErrorReason } from './errors';
import DataTrackOutgoingPipeline from './pipeline';
import type { DataTrackOptions, EventPacketAvailable, EventPacketsFlushedChange, EventSfuPublishRequest, EventSfuUnpublishRequest, EventTrackPublished, EventTrackUnpublished, SfuPublishResponseResult } from './types';
export type PendingDescriptor = {
    type: 'pending';
    /** Resolves when the descriptor is fully published. */
    completionFuture: Future<void, DataTrackPublishError>;
};
export type ActiveDescriptor = {
    type: 'active';
    info: DataTrackInfo;
    publishState: 'published' | 'republishing' | 'unpublished';
    pipeline: DataTrackOutgoingPipeline;
    /** Resolves when the descriptor is unpublished. */
    unpublishingFuture: Future<void, never>;
};
export type Descriptor = PendingDescriptor | ActiveDescriptor;
export declare const Descriptor: {
    pending(): PendingDescriptor;
    active(info: DataTrackInfo, e2eeManager: BaseE2EEManager | null): ActiveDescriptor;
};
export type DataTrackOutgoingManagerCallbacks = {
    /** Request sent to the SFU to publish a track. */
    sfuPublishRequest: (event: EventSfuPublishRequest) => void;
    /** Request sent to the SFU to unpublish a track. */
    sfuUnpublishRequest: (event: EventSfuUnpublishRequest) => void;
    /** A serialized packet is ready to be sent over the transport. */
    packetAvailable: (event: EventPacketAvailable) => void;
    /** A new {@link LocalDataTrack} has been published */
    trackPublished: (event: EventTrackPublished) => void;
    /** A {@link LocalDataTrack} has been unpublished */
    trackUnpublished: (event: EventTrackUnpublished) => void;
    /** A {@link LocalDataTrack} has had all of its in flight packets sent via the rtc data channel. */
    packetsFlushedChange: (event: EventPacketsFlushedChange) => void;
    /** The manager has been reset and all state has been cleared in preparation for the next room
     * connection. */
    reset: () => void;
};
type OutgoingDataTrackManagerOptions = {
    /**
     * Provider to use for encrypting outgoing frame payloads.
     *
     * If null, end-to-end encryption will be disabled for all published tracks.
     */
    e2eeManager?: BaseE2EEManager;
};
declare const OutgoingDataTrackManager_base: new () => TypedEmitter<DataTrackOutgoingManagerCallbacks>;
export default class OutgoingDataTrackManager extends OutgoingDataTrackManager_base {
    private e2eeManager;
    private handleAllocator;
    private descriptors;
    /** Number of packets for each data track which have been emitted via the `packetAvailable` event
     * and which have not yet been sent via the rtc data channel yet. Once this goes to 0, then
     * all in flight packets have been delivered, and the data tracks is "flushed". */
    private inFlightPacketCounter;
    constructor(options?: OutgoingDataTrackManagerOptions);
    static withDescriptors(descriptors: Map<DataTrackHandle, Descriptor>): OutgoingDataTrackManager;
    /** @internal */
    updateE2eeManager(e2eeManager: BaseE2EEManager | null): void;
    /**
     * Used by attached {@link LocalDataTrack} instances to query their associated descriptor info.
     * @internal
     */
    getDescriptor(handle: DataTrackHandle): Descriptor | null;
    /** Used by attached {@link LocalDataTrack} instances to broadcast data track packets to other
     * subscribers.
     * @internal
     */
    tryProcessAndSend(handle: DataTrackHandle, frame: DataTrackFrameInternal): Promise<Throws<void, DataTrackPushFrameError<DataTrackPushFrameErrorReason.Dropped> | DataTrackPushFrameError<DataTrackPushFrameErrorReason.TrackUnpublished>>>;
    /** The client has sent a packet over the rtc data channel. This signal is used for determining
     * once all packets are sent and a data track has been "flushed".
     *
     * @internal */
    handlePacketSendComplete(handle: DataTrackHandle): void;
    /**
     * Client requested to publish a track.
     *
     * If the LiveKit server is too old and doesn't support data tracks, a
     * {@link DataTrackPublishError#timeout} will be thrown.
     *
     * @internal
     **/
    publishRequest(options: DataTrackOptions, signal?: AbortSignal): Promise<Throws<DataTrackHandle, DataTrackPublishError>>;
    /**
     * Get information about all currently published tracks.
     * @internal
     **/
    queryPublished(): DataTrackInfo[];
    /**
     * Client request to unpublish a track.
     * @internal
     **/
    unpublishRequest(handle: DataTrackHandle): Promise<void>;
    /**
     * SFU responded to a request to publish a data track.
     * @internal
     **/
    receivedSfuPublishResponse(handle: DataTrackHandle, result: SfuPublishResponseResult): void;
    /**
     * SFU notification that a track has been unpublished.
     * @internal
     **/
    receivedSfuUnpublishResponse(handle: DataTrackHandle): void;
    /** Republish all tracks.
     *
     * This must be sent after a full reconnect in order for existing publications
     * to be recognized by the SFU. Each republished track will be assigned a new SID.
     * @internal
     */
    sfuWillRepublishTracks(): void;
    /**
     * Reset's the state of the manager and all associated tracks. Run on room disconnect to get
     * the manager ready for the next room connection.
     * @internal
     **/
    reset(): Promise<void>;
}
export {};
//# sourceMappingURL=OutgoingDataTrackManager.d.ts.map
