import { DataTrackInfo as ProtocolDataTrackInfo } from '@livekit/protocol';
import { type DataTrackHandle } from './handle';
export type DataTrackSid = string;
/** Information about a published data track. */
export type DataTrackInfo = {
    sid: DataTrackSid;
    pubHandle: DataTrackHandle;
    name: string;
    usesE2ee: boolean;
};
export type RemoteDataTrackPipelineOptions = {
    /** Set the maximum number of in-flight partial frames the depacketizer will track
     * concurrently for this track. Higher values give more out-of-order tolerance for
     * high-frequency senders. Defaults to 1.
     */
    maxPartialFrames?: number;
};
export declare const DataTrackInfo: {
    from(protocolInfo: ProtocolDataTrackInfo): DataTrackInfo;
    toProtobuf(info: DataTrackInfo): ProtocolDataTrackInfo;
};
//# sourceMappingURL=types.d.ts.map