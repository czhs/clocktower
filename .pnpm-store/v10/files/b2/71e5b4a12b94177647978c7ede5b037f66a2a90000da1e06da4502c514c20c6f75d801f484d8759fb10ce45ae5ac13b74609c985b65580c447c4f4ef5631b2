import { ChatMessage as ChatMessageModel, ClientInfo, ClientInfo_Capability, DisconnectReason, Transcription as TranscriptionModel } from '@livekit/protocol';
import { type Throws } from '@livekit/throws-transformer/throws';
import type { NonSharedUint8Array } from '../type-polyfills/non-shared-typed-arrays';
import TypedPromise from '../utils/TypedPromise';
import type { BrowserDetails } from '../utils/browserParser';
import { type ConnectionError } from './errors';
import type LocalParticipant from './participant/LocalParticipant';
import type Participant from './participant/Participant';
import type RemoteParticipant from './participant/RemoteParticipant';
import type LocalAudioTrack from './track/LocalAudioTrack';
import type LocalTrack from './track/LocalTrack';
import type LocalTrackPublication from './track/LocalTrackPublication';
import type LocalVideoTrack from './track/LocalVideoTrack';
import type RemoteAudioTrack from './track/RemoteAudioTrack';
import type RemoteTrack from './track/RemoteTrack';
import type RemoteTrackPublication from './track/RemoteTrackPublication';
import type RemoteVideoTrack from './track/RemoteVideoTrack';
import { Track } from './track/Track';
import type { TrackPublication } from './track/TrackPublication';
import { type AudioCodec, type VideoCodec } from './track/options';
import type { ChatMessage, TranscriptionSegment } from './types';
export declare const ddExtensionURI = "https://aomediacodec.github.io/av1-rtp-spec/#dependency-descriptor-rtp-header-extension";
export declare function unpackStreamId(packed: string): string[];
export declare function sleep(duration: number): TypedPromise<void, never>;
/** @internal */
export declare function supportsTransceiver(): boolean;
/** @internal */
export declare function supportsAddTrack(): boolean;
export declare function supportsAdaptiveStream(): boolean;
export declare function supportsDynacast(): boolean;
export declare function supportsAV1(): boolean;
export declare function supportsVP9(): boolean;
export declare function supportsH265(): boolean;
export declare function isSVCCodec(codec?: string): boolean;
/**
 * Opts `transceiver` into negotiating the AV1 dependency descriptor, reporting whether it will be.
 *
 * Chrome only offers the extension on transceivers that can send, so one we create to receive on
 * never negotiates it — and Chrome 152 stopped decoding AV1 that arrives without it: frames get
 * assembled, none ever decode, and the receiver asks for a keyframe forever. Asking through the
 * transceiver rather than munging the extension into the SDP leaves the browser owning the
 * extension id, which is what keeps that id consistent across the bundle and across
 * renegotiations.
 *
 * A no-op where the browser offers no such control, or does not know the extension at all.
 * @internal
 */
export declare function negotiateDependencyDescriptor(transceiver: RTCRtpTransceiver): boolean;
/**
 * VP9 and AV1 are published as SVC (a single RTP stream carrying every spatial layer)
 * by default. They can instead be published as real, rid based simulcast — one
 * independent stream per rid, each carrying a single spatial layer — when the caller
 * opts in with `simulcast: true` and a single spatial layer scalability mode (`L1Tx`).
 *
 * The SFU has to be told about this: without an explicit
 * `SimulcastCodec.videoLayerMode` it assumes `MULTIPLE_SPATIAL_LAYERS_PER_STREAM` for
 * any SVC capable codec.
 */
export declare function isSVCSimulcast(codec?: string, options?: {
    simulcast?: boolean;
    scalabilityMode?: string;
}): boolean;
/**
 * Whether the browser reads multiple encodings on an SVC capable codec as *legacy SVC*
 * rather than as real simulcast.
 *
 * Before Chrome M113, supplying more than one encoding for VP9/AV1 selected SVC mode;
 * only from M113 does libwebrtc treat such encodings as simulcast, and only when each
 * one carries its own scalabilityMode. Safari (and anything WebKit based, i. e. every
 * browser on iOS) still uses the old interpretation, as does React Native's libwebrtc.
 * Announced at https://groups.google.com/g/discuss-webrtc/c/-QQ3pxrl-fw
 *
 * Where this is true the rids would not exist on the wire, so VP9/AV1 must be published
 * as SVC no matter what the caller asked for.
 */
export declare function usesLegacySVCEncodings(): boolean;
/**
 * Whether the connected server honours `SimulcastCodec.videoLayerMode`, i. e. whether
 * VP9/AV1 can be published as rid based simulcast. An unknown version is treated as
 * unsupported so the publish falls back to SVC.
 */
export declare function isSVCSimulcastSupportedByServer(serverVersion?: string): boolean;
export declare function supportsSetSinkId(elm?: HTMLMediaElement): boolean;
/**
 * Checks whether or not setting an audio output via {@link Room#setActiveDevice}
 * is supported for the current browser.
 */
export declare function supportsAudioOutputSelection(): boolean;
export declare function isBrowserSupported(): boolean;
export declare function isFireFox(): boolean;
export declare function isChromiumBased(): boolean;
export declare function isScriptTransformSupportedForWorker(): boolean;
export declare function isSafari(): boolean;
export declare function isSafariBased(): boolean;
/**
 * iPadOS has sent the desktop Macintosh user agent by default since iPadOS 13, so `getBrowser()`
 * reports `os: 'macOS'` there and every `os === 'iOS'` check misses it. macOS Safari implements no
 * touch events at all (`TouchEvent` undefined, `maxTouchPoints` 0) regardless of any touchscreen
 * attached, so touch capability separates the two. Measured on an iPad 6 / iPadOS 17
 * (`maxTouchPoints` 5) against macOS Safari 26.4 (`maxTouchPoints` 0).
 *
 * Deliberately a separate helper rather than a fix in `browserParser`: iPadOS spoofs the Mac
 * version too, so reporting `os: 'iOS'` there would leave `osVersion` at `10.15.7` and silently
 * break {@link isSafari17Based} and {@link isSafariSvcApi}, which compare it.
 */
export declare function isIPadOS(): boolean;
/**
 * iPhone, iPad and iOS-hosted browsers — everything running the Apple camera capture pipeline,
 * including iPads that present themselves as a Mac.
 */
export declare function isAppleMobile(): boolean;
export declare function isSafari17Based(): boolean;
export declare function isSafariSvcApi(browser?: BrowserDetails): boolean;
export declare function isMobile(): boolean;
export declare function isE2EESimulcastSupported(): boolean | undefined;
export declare function isWeb(): boolean;
export declare function isReactNative(): boolean;
export declare function isCloud(serverUrl: URL): boolean;
export declare function extractProjectFromUrl(serverUrl: URL): string | null;
export declare function getReactNativeOs(): string | undefined;
export declare function getDevicePixelRatio(): number;
/**
 * @param v1 - The first version string to compare.
 * @param v2 - The second version string to compare.
 * @returns A number indicating the order of the versions:
 *   - 1 if v1 is greater than v2
 *   - -1 if v1 is less than v2
 *   - 0 if v1 and v2 are equal
 */
export declare function compareVersions(v1: string, v2: string): number;
export declare const getResizeObserver: () => ResizeObserver;
export declare const getIntersectionObserver: () => IntersectionObserver;
export interface ObservableMediaElement extends HTMLMediaElement {
    handleResize: (entry: ResizeObserverEntry) => void;
    handleVisibilityChanged: (entry: IntersectionObserverEntry) => void;
}
export declare function getClientInfo(capabilities?: ClientInfo_Capability[]): ClientInfo;
export declare function getEmptyVideoStreamTrack(): MediaStreamTrack;
export declare function createDummyVideoStreamTrack(width?: number, height?: number, enabled?: boolean, paintContent?: boolean): MediaStreamTrack;
export declare function getEmptyAudioStreamTrack(): MediaStreamTrack;
export declare function getStereoAudioStreamTrack(): MediaStreamTrack;
/** An object that represents a serialized version of a `new Promise((resolve, reject) => {})`
 * constructor. Wait for a promise resolution with `await future.promise` and explicitly resolve or
 * reject the inner promise with `future.resolve(...)` or `future.reject(...)`.
 */
export declare class Future<T, E extends Error> {
    promise: Promise<Throws<T, E>>;
    resolve?: (arg: T) => void;
    reject?: (e: E) => void;
    onFinally?: () => void;
    get isResolved(): boolean;
    private _isResolved;
    constructor(futureBase?: (resolve: (arg: T) => void, reject: (e: E) => void) => void, onFinally?: () => void);
}
export type AudioAnalyserOptions = {
    /**
     * If set to true, the analyser will use a cloned version of the underlying mediastreamtrack, which won't be impacted by muting the track.
     * Useful for local tracks when implementing things like "seems like you're muted, but trying to speak".
     * Defaults to false
     */
    cloneTrack?: boolean;
    /**
     * see https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/fftSize
     */
    fftSize?: number;
    /**
     * see https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/smoothingTimeConstant
     */
    smoothingTimeConstant?: number;
    /**
     * see https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/minDecibels
     */
    minDecibels?: number;
    /**
     * see https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/maxDecibels
     */
    maxDecibels?: number;
};
/**
 * Creates and returns an analyser web audio node that is attached to the provided track.
 * Additionally returns a convenience method `calculateVolume` to perform instant volume readings on that track.
 * Call the returned `cleanup` function to close the audioContext that has been created for the instance of this helper
 */
export declare function createAudioAnalyser(track: LocalAudioTrack | RemoteAudioTrack, options?: AudioAnalyserOptions): {
    calculateVolume: () => number;
    analyser: AnalyserNode;
    cleanup: () => Promise<void>;
};
export declare function isAudioCodec(maybeCodec: string): maybeCodec is AudioCodec;
export declare function isVideoCodec(maybeCodec: string): maybeCodec is VideoCodec;
export declare function unwrapConstraint(constraint: ConstrainDOMString): string;
export declare function unwrapConstraint(constraint: ConstrainULong): number;
export declare function toWebsocketUrl(url: string): string;
export declare function toHttpUrl(url: string): string;
export declare function extractTranscriptionSegments(transcription: TranscriptionModel, firstReceivedTimesMap: Map<string, number>): TranscriptionSegment[];
export declare function extractChatMessage(msg: ChatMessageModel): ChatMessage;
export declare function getDisconnectReasonFromConnectionError(e: ConnectionError): DisconnectReason;
/** convert bigints to numbers preserving undefined values */
export declare function bigIntToNumber<T extends BigInt | undefined>(value: T): T extends BigInt ? number : undefined;
/** convert numbers to bigints preserving undefined values */
export declare function numberToBigInt<T extends number | undefined>(value: T): T extends number ? bigint : undefined;
export declare function isLocalTrack(track: Track | MediaStreamTrack | undefined): track is LocalTrack;
export declare function isAudioTrack(track: Track | undefined): track is LocalAudioTrack | RemoteAudioTrack;
export declare function isVideoTrack(track: Track | undefined): track is LocalVideoTrack | RemoteVideoTrack;
export declare function isLocalVideoTrack(track: Track | MediaStreamTrack | undefined): track is LocalVideoTrack;
export declare function isLocalAudioTrack(track: Track | MediaStreamTrack | undefined): track is LocalAudioTrack;
export declare function isRemoteTrack(track: Track | undefined): track is RemoteTrack;
export declare function isRemotePub(pub: TrackPublication | undefined): pub is RemoteTrackPublication;
export declare function isLocalPub(pub: TrackPublication | undefined): pub is LocalTrackPublication;
export declare function isRemoteVideoTrack(track: Track | undefined): track is RemoteVideoTrack;
export declare function isLocalParticipant(p: Participant): p is LocalParticipant;
export declare function isRemoteParticipant(p: Participant): p is RemoteParticipant;
export declare function splitUtf8(s: string, n: number): NonSharedUint8Array[];
/** Wraps a byte array in a `ReadableStream` that yields it as a single chunk and then closes. */
export declare function readableFromBytes(bytes: NonSharedUint8Array): ReadableStream<NonSharedUint8Array>;
/**
 * Re-chunks a byte stream into pieces of exactly `chunkSize` bytes (the final piece may be
 * smaller), coalescing or splitting the source's pieces as needed. Memory use is bounded to roughly
 * `chunkSize` plus one source read, so it never buffers the whole stream — used to pack
 * `CompressionStream`/`file.stream()` output into MTU-sized data-stream chunks.
 */
export declare function readBytesInChunks(source: ReadableStream<NonSharedUint8Array>, chunkSize: number): AsyncGenerator<NonSharedUint8Array>;
/** Encodes a byte array as a base64 string (suitable for embedding binary data in a string field). */
export declare function encodeBase64(bytes: Uint8Array): string;
/** Decodes a base64 string (as produced by {@link encodeBase64}) back into a byte array. */
export declare function decodeBase64(base64: string): Uint8Array;
export declare function extractMaxAgeFromRequestHeaders(headers: Headers): number | undefined;
export declare function isCompressionStreamSupported(): boolean;
/**
 * Whether this runtime can compress AND decompress the `deflate-raw` format, which is a stricter
 * requirement than {@link isCompressionStreamSupported}: Chromium 80-102 included
 * `CompressionStream` supporting only `gzip` / `deflate`, and `deflate-raw` was added in Chromium
 * 103 (Firefox 113, Safari 16.4).
 */
export declare function isDeflateRawCompressionSupported(): boolean;
/**
 * Clears the memoized {@link isDeflateRawCompressionSupported} probe result. A runtime doesn't
 * gain or lose compression formats while it is running, so this only exists for tests that swap
 * the global `CompressionStream` / `DecompressionStream`.
 *
 * @internal
 */
export declare function resetDeflateRawCompressionSupportCache(): void;
export declare function isPublisherOfferWithJoinSupported(): boolean;
export declare function extractTrackSid(mediaTrack: MediaStreamTrack, stream: MediaStream): Track.SID | undefined;
//# sourceMappingURL=utils.d.ts.map