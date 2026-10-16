import type TypedEventEmitter from 'typed-emitter';
import type { FrameMetadataPublishOptions } from '../../frameMetadata/types';
import { type VideoCodec } from '../../room/track/options';
import type { NonSharedUint8Array } from '../../type-polyfills/non-shared-typed-arrays';
import { type CryptorCallbacks } from '../events';
import type { KeyProviderOptions } from '../types';
import type { ParticipantKeyHandler } from './ParticipantKeyHandler';
export declare const encryptionEnabledMap: Map<string, boolean>;
export interface FrameCryptorConstructor {
    new (opts?: unknown): BaseFrameCryptor;
}
export interface TransformerInfo {
    readable: ReadableStream;
    writable: WritableStream;
    transformer: TransformStream;
    trackId: string;
    symbol: symbol;
}
declare const BaseFrameCryptor_base: new () => TypedEventEmitter<CryptorCallbacks>;
export declare class BaseFrameCryptor extends BaseFrameCryptor_base {
    protected encodeFunction(encodedFrame: RTCEncodedVideoFrame | RTCEncodedAudioFrame, controller: TransformStreamDefaultController): Promise<any>;
    protected decodeFunction(encodedFrame: RTCEncodedVideoFrame | RTCEncodedAudioFrame, controller: TransformStreamDefaultController): Promise<any>;
}
/**
 * Cryptor is responsible for en-/decrypting media frames.
 * Each Cryptor instance is responsible for en-/decrypting a single mediaStreamTrack.
 */
export declare class FrameCryptor extends BaseFrameCryptor {
    private sendCounts;
    private participantIdentity;
    private trackId;
    private keys;
    private videoCodec?;
    private rtpMap;
    private keyProviderOptions;
    /**
     * used for detecting server injected unencrypted frames
     */
    private sifTrailer;
    private detectedCodec?;
    private currentTransform?;
    /**
     * The encoded streams this cryptor was last set up with, retained beyond the
     * lifetime of {@link currentTransform}.
     *
     * The main thread transfers a receiver's encoded streams to the worker once and
     * cannot transfer them again (a transferred stream is locked), and
     * `createEncodedStreams()` may only be called once per receiver. So when a
     * transceiver is reused, or when a pipe dies underneath us, re-establishing the
     * transform is only possible from here. See {@link ensureTransform}.
     */
    private retainedStreams?;
    /**
     * Whether the subscribed track advertises packet trailer features.
     * When false, we skip the per-frame trailer extraction path entirely
     * on decode to avoid unnecessary work on tracks that don't use it.
     */
    private hasFrameMetadata;
    private frameMetadataOpts?;
    private frameMetadataFrameId;
    private errorLimiter;
    private undecryptedTrackTimeout?;
    /** grace period for a teardown or a resubscribe to land before we report a stalled track */
    private readonly UNDECRYPTED_TRACK_GRACE_MS;
    /**
     * Tracks (participant, trackId, payloadType) tuples for which we've already logged a NALU
     * fallback, so a persistent bad state doesn't flood the console (Firefox doesn't filter debug).
     */
    private loggedNALUFallbacks;
    constructor(opts: {
        keys: ParticipantKeyHandler;
        participantIdentity: string;
        keyProviderOptions: KeyProviderOptions;
        sifTrailer?: NonSharedUint8Array;
    });
    private get logContext();
    /**
     * Assign a different participant to the cryptor.
     * useful for transceiver re-use
     * @param id
     * @param keys
     */
    setParticipant(id: string, keys: ParticipantKeyHandler): void;
    unsetParticipant(): void;
    isEnabled(): boolean | undefined;
    getParticipantIdentity(): string | undefined;
    getTrackId(): string | undefined;
    /**
     * Re-point this cryptor at a new trackId, keeping its (already transferred)
     * encoded streams. Used when a transceiver is reused for a new track.
     */
    setTrackId(trackId: string): void;
    hasActiveTransform(): boolean;
    /**
     * A track that is subscribed and known to be encrypted, but has no transform to
     * decrypt it, will never produce a decodable frame again. That state used to be
     * completely silent (a black tile and endless PLIs), so report it.
     *
     * Deferred, because on teardown the encoded streams routinely close before the
     * 'removeTransform' message arrives -- checking immediately would cry wolf on
     * every unsubscribe.
     *
     * Only meaningful while decoding: a sender's pipe closing on unpublish is
     * routine and has no 'removeTransform' equivalent to quiet it down.
     */
    private scheduleUndecryptedTrackWatchdog;
    /**
     * Re-establish the transform if it is gone while we still own the encoded
     * streams, e.g. after a pipe died on its own (the swallowed
     * 'Destination stream closed') or when a reused transceiver never got a new
     * pipeline. Without this the frames pile up in a readable nobody reads and the
     * decoder starves, which shows up as a permanently black tile.
     */
    ensureTransform(): boolean;
    /**
     * Update the video codec used by the mediaStreamTrack
     * @param codec
     */
    setVideoCodec(codec: VideoCodec): void;
    /**
     * rtp payload type map used for figuring out codec of payload type when encoding
     * @param map
     */
    setRtpMap(map: Map<number, VideoCodec>): void;
    /**
     * Sets whether the track associated with this cryptor carries packet
     * trailer data. When false, {@link decodeFunction} skips the per-frame
     * trailer extraction branch entirely.
     */
    setHasFrameMetadata(hasFrameMetadata: boolean): void;
    setFrameMetadataOpts(frameMetadata?: FrameMetadataPublishOptions): void;
    setupTransform(operation: 'encode' | 'decode', readable: ReadableStream<RTCEncodedVideoFrame | RTCEncodedAudioFrame>, writable: WritableStream<RTCEncodedVideoFrame | RTCEncodedAudioFrame>, trackId: string, codec?: VideoCodec, frameMetadata?: FrameMetadataPublishOptions): boolean;
    setSifTrailer(trailer: NonSharedUint8Array): void;
    private emitThrottledError;
    /**
     * Function that will be injected in a stream and will encrypt the given encoded frames.
     *
     * @param {RTCEncodedVideoFrame|RTCEncodedAudioFrame} encodedFrame - Encoded video frame.
     * @param {TransformStreamDefaultController} controller - TransportStreamController.
     *
     * The VP8 payload descriptor described in
     * https://tools.ietf.org/html/rfc7741#section-4.2
     * is part of the RTP packet and not part of the frame and is not controllable by us.
     * This is fine as the SFU keeps having access to it for routing.
     *
     * The encrypted frame is formed as follows:
     * 1) Find unencrypted byte length, depending on the codec, frame type and kind.
     * 2) Form the GCM IV for the frame as described above.
     * 3) Encrypt the rest of the frame using AES-GCM.
     * 4) Allocate space for the encrypted frame.
     * 5) Copy the unencrypted bytes to the start of the encrypted frame.
     * 6) Append the ciphertext to the encrypted frame.
     * 7) Append the IV.
     * 8) Append a single byte for the key identifier.
     * 9) Enqueue the encrypted frame for sending.
     */
    protected encodeFunction(encodedFrame: RTCEncodedVideoFrame | RTCEncodedAudioFrame, controller: TransformStreamDefaultController): Promise<void>;
    private appendFrameMetadata;
    /**
     * Function that will be injected in a stream and will decrypt the given encoded frames.
     *
     * @param {RTCEncodedVideoFrame|RTCEncodedAudioFrame} encodedFrame - Encoded video frame.
     * @param {TransformStreamDefaultController} controller - TransportStreamController.
     */
    protected decodeFunction(encodedFrame: RTCEncodedVideoFrame | RTCEncodedAudioFrame, controller: TransformStreamDefaultController): Promise<void>;
    /**
     * Function that will decrypt the given encoded frame. If the decryption fails, it will
     * ratchet the key for up to RATCHET_WINDOW_SIZE times.
     */
    private decryptFrame;
    /**
     * Construct the IV used for AES-GCM and sent (in plain) with the packet similar to
     * https://tools.ietf.org/html/rfc7714#section-8.1
     * It concatenates
     * - the 32 bit synchronization source (SSRC) given on the encoded frame,
     * - the 32 bit rtp timestamp given on the encoded frame,
     * - a send counter that is specific to the SSRC. Starts at a random number.
     * The send counter is essentially the pictureId but we currently have to implement this ourselves.
     * There is no XOR with a salt. Note that this IV leaks the SSRC to the receiver but since this is
     * randomly generated and SFUs may not rewrite this is considered acceptable.
     * The SSRC is used to allow demultiplexing multiple streams with the same key, as described in
     *   https://tools.ietf.org/html/rfc3711#section-4.1.1
     * The RTP timestamp is 32 bits and advances by the codec clock rate (90khz for video, 48khz for
     * opus audio) every second. For video it rolls over roughly every 13 hours.
     * The send counter will advance at the frame rate (30fps for video, 50fps for 20ms opus audio)
     * every second. It will take a long time to roll over.
     *
     * See also https://developer.mozilla.org/en-US/docs/Web/API/AesGcmParams
     */
    private makeIV;
    private getUnencryptedBytes;
    /**
     * Logs a NALU processing fallback at most once per (participant, trackId, payloadType) tuple,
     * so a persistent bad state doesn't flood the console (Firefox doesn't filter debug).
     */
    private logNALUFallbackOnce;
    /**
     * inspects frame mimetype if available. falls back to payloadtype and maps it to the codec specified in rtpMap
     */
    private getVideoCodec;
}
/**
 * we use a magic frame trailer to detect whether a frame is injected
 * by the livekit server and thus to be treated as unencrypted
 * @internal
 */
export declare function isFrameServerInjected(frameData: ArrayBuffer, trailerBytes: NonSharedUint8Array): boolean;
export {};
//# sourceMappingURL=FrameCryptor.d.ts.map