import { SubscribedCodec, SubscribedQuality, VideoLayer } from '@livekit/protocol';
import type { SignalClient } from '../../api/SignalClient';
import type { VideoSenderStats } from '../stats';
import type { LoggerOptions } from '../types';
import LocalTrack from './LocalTrack';
import { Track, VideoQuality } from './Track';
import type { TrackPublishOptions, VideoCaptureOptions, VideoCodec } from './options';
import type { TrackProcessor } from './processor/types';
export declare class SimulcastTrackInfo {
    codec: VideoCodec;
    mediaStreamTrack: MediaStreamTrack;
    sender?: RTCRtpSender;
    encodings?: RTCRtpEncodingParameters[];
    constructor(codec: VideoCodec, mediaStreamTrack: MediaStreamTrack);
}
export default class LocalVideoTrack extends LocalTrack<Track.Kind.Video> {
    signalClient?: SignalClient;
    private prevStats?;
    private encodings?;
    simulcastCodecs: Map<VideoCodec, SimulcastTrackInfo>;
    private subscribedCodecs?;
    private senderLock;
    private degradationPreference;
    private isCpuConstrained;
    private optimizeForPerformance;
    publishOptions?: TrackPublishOptions;
    lastEncodedDimensions?: Track.Dimensions;
    get sender(): RTCRtpSender | undefined;
    set sender(sender: RTCRtpSender | undefined);
    /**
     *
     * @param mediaTrack
     * @param constraints MediaTrackConstraints that are being used when restarting or reacquiring tracks
     * @param userProvidedTrack Signals to the SDK whether or not the mediaTrack should be managed (i.e. released and reacquired) internally by the SDK
     */
    constructor(mediaTrack: MediaStreamTrack, constraints?: MediaTrackConstraints, userProvidedTrack?: boolean, loggerOptions?: LoggerOptions);
    get isSimulcast(): boolean;
    startMonitor(signalClient: SignalClient): void;
    stop(): void;
    pauseUpstream(): Promise<void>;
    resumeUpstream(): Promise<void>;
    mute(): Promise<typeof this>;
    unmute(): Promise<typeof this>;
    protected setTrackMuted(muted: boolean): void;
    getSenderStats(): Promise<VideoSenderStats[]>;
    /**
     * Whether `codec` is being published as SVC (a single stream carrying all spatial
     * layers) as opposed to rid based simulcast. VP9/AV1 are SVC unless the publisher
     * opted into simulcast, in which case each rid is an independent stream and the
     * layers can be enabled/disabled individually.
     */
    private isSvcPublish;
    setPublishingQuality(maxQuality: VideoQuality): void;
    restartTrack(options?: VideoCaptureOptions): Promise<void>;
    protected onSenderTrackSwapped(): Promise<void>;
    /**
     * Recomputes encoding parameters for this track's senders based on the current
     * MediaStreamTrack dimensions and reapplies them via setParameters. This is a no-op
     * if the track hasn't been published yet or if the track is in performance-optimized
     * mode (which manages its own encodings).
     */
    private refreshSenderEncodings;
    private applyEncodingsToSender;
    setProcessor(processor: TrackProcessor<Track.Kind.Video>, showProcessedStreamLocally?: boolean): Promise<void>;
    setDegradationPreference(preference: RTCDegradationPreference): Promise<void>;
    /**
     * Degradation preference is a property of the sender, not of the track, so every sender
     * publishing this track needs it applied separately. A backup codec publishes over its
     * own sender, which would otherwise let the browser resolve a preference implicitly and
     * diverge from the primary encoder.
     *
     * Callers apply this sequentially rather than concurrently: `setParameters` is only valid
     * against the parameters most recently returned by `getParameters`, which is why this file
     * serializes other sender parameter updates through `senderLock`.
     */
    private applyDegradationPreference;
    addSimulcastTrack(codec: VideoCodec, encodings?: RTCRtpEncodingParameters[]): SimulcastTrackInfo | undefined;
    setSimulcastTrackSender(codec: VideoCodec, sender: RTCRtpSender): Promise<void>;
    /** @interal */
    refreshSubscribedCodecs(): Promise<void | ("vp8" | "h264" | "vp9" | "av1" | "h265")[]>;
    /**
     * @internal
     * Sets codecs that should be publishing, returns new codecs that have not yet
     * been published
     */
    setPublishingCodecs(codecs: SubscribedCodec[]): Promise<VideoCodec[]>;
    /**
     * @internal
     * Sets layers that should be publishing
     */
    setPublishingLayers(isSvc: boolean, qualities: SubscribedQuality[]): Promise<void>;
    /**
     * Designed for lower powered devices, reduces video publishing quality and disables simulcast.
     * @experimental
     */
    prioritizePerformance(): Promise<void>;
    protected monitorSender: () => Promise<void>;
    protected handleAppVisibilityChanged(): Promise<void>;
}
export declare function videoQualityForRid(rid: string): VideoQuality;
export declare function videoLayersFromEncodings(width: number, height: number, encodings?: RTCRtpEncodingParameters[], svc?: boolean): VideoLayer[];
//# sourceMappingURL=LocalVideoTrack.d.ts.map
