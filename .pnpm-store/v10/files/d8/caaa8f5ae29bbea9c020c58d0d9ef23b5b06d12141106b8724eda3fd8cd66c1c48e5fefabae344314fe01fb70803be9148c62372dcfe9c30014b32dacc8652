import type { FrameMetadata } from '../../frameMetadata/types';
/**
 * Caches frame metadata extracted from received video frames,
 * keyed by RTP timestamp so it can be looked up when the frame is displayed.
 *
 * Metadata is populated either by the frame metadata worker managed by
 * `FrameMetadataManager` (non-E2EE) or by the E2EE FrameCryptor worker
 * after decryption (E2EE).
 *
 * @experimental
 */
export declare class FrameMetadataExtractor {
    private metadataMap;
    private activeSsrc;
    storeMetadata(rtpTimestamp: number, ssrc: number, metadata: FrameMetadata): void;
    lookupMetadata(rtpTimestamp: number): FrameMetadata | undefined;
    dispose(): void;
}
//# sourceMappingURL=FrameMetadataExtractor.d.ts.map