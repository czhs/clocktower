import type { FrameMetadata, FrameMetadataPublishOptions } from './types';
export declare const PACKET_TRAILER_MAGIC: Uint8Array<ArrayBuffer>;
export declare const PACKET_TRAILER_TIMESTAMP_TAG = 1;
export declare const PACKET_TRAILER_FRAME_ID_TAG = 2;
export declare const PACKET_TRAILER_USER_DATA_TAG = 3;
export declare const PACKET_TRAILER_ENVELOPE_SIZE = 5;
export interface ExtractPacketTrailerResult {
    data: Uint8Array;
    metadata?: FrameMetadata;
}
export declare function appendPacketTrailer(data: Uint8Array, userTimestamp: bigint, frameId: number): Uint8Array;
export declare function appendPacketTrailerToEncodedFrame(frame: RTCEncodedVideoFrame, options: FrameMetadataPublishOptions | undefined, frameId: number): boolean;
export declare function extractPacketTrailer(data: ArrayBuffer | Uint8Array): ExtractPacketTrailerResult;
export declare function getFrameRtpTimestamp(frame: RTCEncodedVideoFrame | RTCEncodedAudioFrame): number | undefined;
export declare function getFrameSsrc(frame: RTCEncodedVideoFrame | RTCEncodedAudioFrame): number;
export interface FrameMetadataPayload {
    trackId: string;
    rtpTimestamp: number;
    ssrc: number;
    metadata: FrameMetadata;
}
export interface ProcessPacketTrailerResult {
    data?: ArrayBuffer;
    payload?: FrameMetadataPayload;
}
/**
 * Extracts a packet trailer from an encoded frame and returns the stripped
 * frame data (if any) along with a ready-to-post metadata payload. Returns an
 * empty object when no trailer is present, an RTP timestamp can't be read, or
 * a trackId isn't available.
 */
export declare function processPacketTrailer(frame: RTCEncodedVideoFrame | RTCEncodedAudioFrame, trackId: string | undefined): ProcessPacketTrailerResult;
//# sourceMappingURL=frameMetadata.d.ts.map