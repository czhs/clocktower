import LocalAudioTrack from '../track/LocalAudioTrack';
import LocalVideoTrack from '../track/LocalVideoTrack';
import type { BackupVideoCodec, TrackPublishOptions, VideoCodec, VideoEncoding } from '../track/options';
import { VideoPreset } from '../track/options';
import type { LoggerOptions } from '../types';
/** @internal */
export declare function mediaTrackToLocalTrack(mediaStreamTrack: MediaStreamTrack, constraints?: MediaTrackConstraints, loggerOptions?: LoggerOptions): LocalVideoTrack | LocalAudioTrack;
export declare const presets169: VideoPreset[];
export declare const presets43: VideoPreset[];
export declare const presetsScreenShare: VideoPreset[];
export declare const defaultSimulcastPresets169: VideoPreset[];
export declare const defaultSimulcastPresets43: VideoPreset[];
export declare const computeDefaultScreenShareSimulcastPresets: (fromPreset: VideoPreset) => VideoPreset[];
export declare function computeVideoEncodings(isScreenShare: boolean, width?: number, height?: number, options?: TrackPublishOptions): RTCRtpEncodingParameters[];
/**
 * Bitrate to hint to the bandwidth estimator through `x-google-start-bitrate`, so that
 * a publish does not spend its first seconds ramping up from a very low rate.
 *
 * It has to be the total the encoder will put on the wire, which means picking the
 * encoding that carries the inclusive bitrate:
 *  - SVC publishes a single stream with the layers built in. `encodings[0]` holds the
 *    full bitrate — the legacy SVC shape orders its encodings `f`..`q`, so that holds
 *    for both SVC shapes.
 *  - Simulcast publishes independent streams ordered `q`..`f`, so the total is the sum.
 *    This includes VP9/AV1 published as rid based simulcast, where `encodings[0]` is
 *    the *smallest* layer even though the codec is SVC capable.
 *
 * @internal
 */
export declare function computeStartTargetBitrate(codec: string, options: TrackPublishOptions | undefined, encodings: RTCRtpEncodingParameters[]): number;
export declare function computeTrackBackupEncodings(track: LocalVideoTrack, videoCodec: BackupVideoCodec, opts: TrackPublishOptions): RTCRtpEncodingParameters[] | undefined;
export declare function determineAppropriateEncoding(isScreenShare: boolean, width: number, height: number, codec?: VideoCodec): VideoEncoding;
export declare function presetsForResolution(isScreenShare: boolean, width: number, height: number): VideoPreset[];
export declare function defaultSimulcastLayers(isScreenShare: boolean, original: VideoPreset): VideoPreset[];
/** @internal */
export declare function sortPresets(presets: Array<VideoPreset> | undefined): VideoPreset[] | undefined;
/** @internal */
export declare class ScalabilityMode {
    spatial: number;
    temporal: number;
    suffix: undefined | 'h' | '_KEY' | '_KEY_SHIFT';
    constructor(scalabilityMode: string);
    toString(): string;
}
/**
 * Returns the appropriate degradation preference for a video track based on its source.
 *
 * - Camera: 'maintain-framerate' (smoother video for real-time communication)
 * - Screen share: 'maintain-resolution' (clarity is critical for reading text/UI)
 * - Other/unknown: 'balanced'
 */
export declare function getDefaultDegradationPreference(track: LocalVideoTrack): RTCDegradationPreference;
//# sourceMappingURL=publishUtils.d.ts.map
