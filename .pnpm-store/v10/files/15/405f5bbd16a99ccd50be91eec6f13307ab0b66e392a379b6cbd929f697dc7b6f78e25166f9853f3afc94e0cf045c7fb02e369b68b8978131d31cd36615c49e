import type { MediaAttributes, MediaDescription, SessionDescription } from 'sdp-transform';
import type TypedEmitter from 'typed-emitter';
import type { LoggerOptions } from './types';
/** @internal */
interface TrackBitrateInfo {
    cid?: string;
    transceiver?: RTCRtpTransceiver;
    codec: string;
    maxbr: number;
    isScreenShare?: boolean;
}
/**
 * Codec payload for `codec` in this media section, when the section carries `cid`.
 *
 * Returns `undefined` when the section does not belong to the track, `0` when it does but
 * does not offer the requested codec, and the codec payload otherwise.
 *
 * @internal
 */
export declare function findTrackCodecPayload(media: MediaDescription, cid: string, codec: string): number | undefined;
/**
 * Start bitrate hinted for a single track, or `undefined` when its target is too low to
 * be worth seeding.
 *
 * 90% of the target leaves ~10% headroom for the estimator to settle. The same multiplier
 * is used for every codec because the target already reflects the codec's efficiency.
 * Camera is capped at 1 Mbps so the estimator does not open too aggressively on a
 * high-bitrate track; screen share is exempt, because its content needs the bitrate
 * immediately to stay legible.
 *
 * TODO: adjust dynamically from network conditions (e.g. a previous BWE estimate) rather
 * than a fixed cap.
 *
 * @internal
 */
export declare function computeTrackStartBitrate(trackbr: TrackBitrateInfo): number | undefined;
/**
 * The single start bitrate for this peer connection: the largest hint among the video
 * m-sections of `media` that map to a published track.
 *
 * libwebrtc reads `x-google-start-bitrate` per m-section but applies it to the shared
 * `Call` (`WebRtcVideoSendChannel::ApplyChangedParams` -> `SetSdpBitrateParameters`), where
 * `RtpBitrateConfigurator` holds one config for the whole connection. Differing per-section
 * values are therefore last-writer-wins, decided by m-section order, so every video section
 * gets the same number instead.
 *
 * Only sections that can send local media are considered. `trackBitrates` is append-only and an
 * unpublished section keeps its `a=msid`, so matching on msid alone would still pair a stale
 * entry with its old section — letting an uncapped screen-share target seed a connection that
 * now carries only a camera, or consuming the one-shot hint on a section that sends nothing.
 *
 * The direction is the discriminator, as an exclusion rather than a match: `recvonly` and
 * `inactive` are the only directions that cannot carry local media, and they are exactly the
 * two a dead section lands on — unpublish sets `inactive` (explicitly in
 * `LocalParticipant.unpublishTrack`, and via `removeTrack`'s sendonly -> inactive transition for
 * the simulcast senders), `removeTrack` on a `sendrecv` transceiver leaves `recvonly`, and the
 * pre-populated placeholders are `recvonly`. Everything else sends: `sendonly` from the
 * `addTransceiver` path, `sendrecv` from the legacy `addTrack` fallback (which reuses a
 * transceiver rather than creating a sendonly one), and a section with no direction attribute,
 * which SDP defaults to `sendrecv`.
 *
 * @internal
 */
export declare function computeConnectionStartBitrate(media: MediaDescription[], trackBitrates: TrackBitrateInfo[]): number | undefined;
/**
 * Declares `x-google-start-bitrate` on `codecPayload`'s fmtp. This SDP munging is used for
 * a bitrate setting that cannot be applied through `RTCRtpEncodingParameters`.
 *
 * Returns whether the section now carries the hint.
 *
 * @internal
 */
export declare function applyVideoStartBitrate(media: MediaDescription, codecPayload: number, startBitrate: number): boolean;
export declare const PCEvents: {
    readonly NegotiationStarted: "negotiationStarted";
    readonly NegotiationComplete: "negotiationComplete";
    readonly OfferAnswered: "offerAnswered";
    readonly RTPVideoPayloadTypes: "rtpVideoPayloadTypes";
};
declare const PCTransport_base: new () => TypedEmitter<PCTransportEventCallbacks>;
/** @internal */
export default class PCTransport extends PCTransport_base {
    private _pc;
    private get pc();
    private config?;
    private log;
    private iceLog;
    private loggerOptions;
    private ddExtID;
    latestOfferId: number;
    private answeredOfferId;
    /** offerId (0 if unnumbered) of the answer being applied right now */
    private answerInFlight;
    latestAcknowledgedOfferId: number;
    private offerLock;
    private pendingInitialOffer?;
    pendingCandidates: RTCIceCandidateInit[];
    restartingIce: boolean;
    renegotiate: boolean;
    trackBitrates: TrackBitrateInfo[];
    /**
     * Whether an offer carrying the connection-level `x-google-start-bitrate` has been
     * accepted locally. The hint is written once per peer connection: libwebrtc retains
     * `start_bitrate_bps` in `RtpBitrateConfigurator` and re-applies it on network route
     * changes, so a later rewrite is at best a no-op and at worst restarts a converged
     * bandwidth estimator. A new peer connection (full reconnect) seeds a new estimator.
     */
    private hasAppliedVideoStartBitrate;
    remoteStereoMids: string[];
    remoteNackMids: string[];
    onOffer?: (offer: RTCSessionDescriptionInit, offerId: number) => void;
    onIceCandidate?: (candidate: RTCIceCandidate) => void;
    onIceCandidateError?: (ev: Event) => void;
    onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
    onIceConnectionStateChange?: (state: RTCIceConnectionState) => void;
    onSignalingStatechange?: (state: RTCSignalingState) => void;
    onDataChannel?: (ev: RTCDataChannelEvent) => void;
    onTrack?: (ev: RTCTrackEvent) => void;
    constructor(config?: RTCConfiguration, loggerOptions?: LoggerOptions);
    private createPC;
    private get logContext();
    get isICEConnected(): boolean;
    addIceCandidate(candidate: RTCIceCandidateInit): Promise<void>;
    setRemoteDescription(sd: RTCSessionDescriptionInit, offerId: number): Promise<boolean>;
    private applyRemoteDescription;
    negotiate: import("./debounce").DebouncedFunction<any[], (onError?: (e: Error) => void) => Promise<void>>;
    createInitialOffer(): Promise<{
        offer: RTCSessionDescriptionInit;
        offerId: number;
    } | undefined>;
    createAndSendOffer(options?: RTCOfferOptions): Promise<void>;
    createAndSetAnswer(): Promise<RTCSessionDescriptionInit>;
    /**
     * Returns the mids of transceivers that carry no outgoing track on this
     * (publisher) connection: the pre-populated placeholders added by
     * `RTCEngine.applyInitialPublisherLayout`, plus any transceiver that was used
     * for a track and reverted on unpublish. Their codec fmtp is conformed to the
     * published tracks so a shared payload type stays consistent across the bundle.
     */
    private getPlaceholderMids;
    createDataChannel(label: string, dataChannelDict: RTCDataChannelInit): RTCDataChannel;
    addTransceiver(mediaStreamTrack: MediaStreamTrack, transceiverInit: RTCRtpTransceiverInit): RTCRtpTransceiver;
    addTransceiverOfKind(kind: 'audio' | 'video', transceiverInit: RTCRtpTransceiverInit): RTCRtpTransceiver;
    addTrack(track: MediaStreamTrack): RTCRtpSender;
    setTrackCodecBitrate(info: TrackBitrateInfo): void;
    setConfiguration(rtcConfig: RTCConfiguration): void;
    canRemoveTrack(): boolean;
    removeTrack(sender: RTCRtpSender): void | undefined;
    getConnectionState(): RTCPeerConnectionState;
    getICEConnectionState(): RTCIceConnectionState;
    getSignallingState(): RTCSignalingState;
    getTransceivers(): RTCRtpTransceiver[];
    getSenders(): RTCRtpSender[];
    getLocalDescription(): RTCSessionDescription | null | undefined;
    getRemoteDescription(): RTCSessionDescription | null;
    /** stats of the underlying connection, `undefined` when there is none */
    getStats(): Promise<RTCStatsReport> | undefined;
    getMaxMessageSize(): number | undefined;
    getConnectedAddress(): Promise<string | undefined>;
    close: () => void;
    private setMungedSDP;
}
/**
 * Adds the AV1 dependency descriptor extension to `media` unless it is already there, and
 * returns the id it is mapped to so callers can pass it back in as `ddExtID` (0 when no id has
 * been chosen yet).
 *
 * A bundle has to map one URI to one id, so an id already in use for the extension anywhere in
 * `sdp` wins over both the cached one and a fresh one: Chrome advertises the extension itself on
 * sections it can send on, and an earlier offer may have munged it into others.
 * @internal
 */
export declare function ensureVideoDDExtension(media: {
    type: string;
    port: number;
    protocol: string;
    payloads?: string | undefined;
} & MediaDescription, sdp: SessionDescription, ddExtID: number): number;
/**
 * Checks whether an fmtp config declares `param` as an exact, `;`-delimited
 * token. A plain substring check conflates distinct opus parameters — e.g.
 * `stereo=1` is a substring of `sprop-stereo=1` — so `param` must match a whole
 * parameter, not appear anywhere within the config string.
 * @internal
 */
export declare function fmtpConfigHasParam(config: string, param: string): boolean;
/** @internal */
export declare function ensureAudioNackAndStereo(media: {
    type: string;
    port: number;
    protocol: string;
    payloads?: string | undefined;
} & MediaDescription, stereoMids: string[], nackMids: string[]): void;
/**
 * Returns the mids of transceivers that carry no outgoing track: the
 * pre-populated placeholders added by `RTCEngine.applyInitialPublisherLayout`,
 * plus any transceiver that was used for a track and reverted on unpublish. The
 * `sender.track` check is the reliable signal — an unpublished section keeps its
 * `a=msid` (and its stale send-derived fmtp), so it can't be told apart from a
 * real send by SDP alone. Transceiver mids are stable across renegotiations, so
 * this works for every offer/answer after the first.
 * @internal
 */
export declare function placeholderMidsFromTransceivers(transceivers: readonly RTCRtpTransceiver[]): Set<string>;
/**
 * Within a BUNDLE group a payload type must map to identical codec parameters
 * across every m-line. When the same payload type carries different fmtp between
 * sections — e.g. opus `usedtx=1` on the published microphone but not on the
 * pre-populated recvonly placeholders, or H.265 with different `level-id` between
 * a published video track and a placeholder — libwebrtc flags a "bundled payload
 * type collision".
 *
 * Rewrite the placeholder sections so every shared payload type carries the
 * same fmtp. Real (non-placeholder) sections always win the canonical value, so
 * a published track's encoder parameters are never altered. When no real
 * section declares a payload type — e.g. a placeholder that was reused for a
 * track and then reverted to recvonly keeps its send-derived `level-id` while
 * fresh placeholders use the default — the placeholders still converge on the
 * first value seen, so two placeholders can't disagree either. Only placeholder
 * sections are ever rewritten, and it is codec-agnostic (opus, H.265, ...).
 * `isPlaceholder` identifies the sections to conform.
 * @internal
 */
export declare function conformBundledCodecFmtp(media: MediaDescription[], isPlaceholder: (media: MediaDescription) => boolean): void;
/** @internal */
/**
 * Whether an incoming answer repeats one already applied or being applied.
 * Any answer for the offer whose answer is in flight is a duplicate, numbered
 * or not. With an offerId (current servers) an answer is also a duplicate if
 * that offer's answer was already applied. Without one, fall back to the
 * signaling state: in `stable` no local offer is pending, unless the initial
 * offer is still deferred (it is set locally only once its answer arrives).
 */
export declare function isDuplicateAnswer(offerId: number, answerInFlight: number | undefined, answeredOfferId: number, signalingState: RTCSignalingState | undefined, hasPendingInitialOffer: boolean): boolean;
export declare function extractStereoAndNackAudioFromOffer(offer: RTCSessionDescriptionInit): {
    stereoMids: string[];
    nackMids: string[];
};
type PCTransportEventCallbacks = {
    negotiationStarted: () => void;
    negotiationComplete: () => void;
    offerAnswered: (offerId: number) => void;
    rtpVideoPayloadTypes: (attributes: MediaAttributes['rtp']) => void;
};
export {};
//# sourceMappingURL=PCTransport.d.ts.map