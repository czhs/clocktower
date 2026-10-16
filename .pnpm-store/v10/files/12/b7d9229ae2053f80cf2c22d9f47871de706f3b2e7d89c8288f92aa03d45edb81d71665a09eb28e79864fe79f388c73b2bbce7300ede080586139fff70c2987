import { SignalTarget } from '@livekit/protocol';
import type { Throws } from '@livekit/throws-transformer/throws';
import PCTransport from './PCTransport';
import { NegotiationError } from './errors';
import type { LoggerOptions } from './types';
export declare enum PCTransportState {
    NEW = 0,
    CONNECTING = 1,
    CONNECTED = 2,
    FAILED = 3,
    CLOSING = 4,
    CLOSED = 5
}
type PCMode = 'subscriber-primary' | 'publisher-primary' | 'publisher-only';
export declare class PCTransportManager {
    publisher: PCTransport;
    subscriber?: PCTransport;
    peerConnectionTimeout: number;
    get needsPublisher(): boolean;
    get needsSubscriber(): boolean;
    get currentState(): PCTransportState;
    onStateChange?: (state: PCTransportState, pubState: RTCPeerConnectionState, subState?: RTCPeerConnectionState) => void;
    onIceCandidate?: (ev: RTCIceCandidate, target: SignalTarget) => void;
    onDataChannel?: (ev: RTCDataChannelEvent) => void;
    onTrack?: (ev: RTCTrackEvent) => void;
    onPublisherOffer?: (offer: RTCSessionDescriptionInit, offerId: number) => void;
    private isPublisherConnectionRequired;
    private isSubscriberConnectionRequired;
    private state;
    private connectionLock;
    private remoteOfferLock;
    private log;
    private iceLog;
    private loggerOptions;
    private _mode;
    get mode(): PCMode;
    constructor(mode: PCMode, loggerOptions: LoggerOptions, rtcConfig?: RTCConfiguration);
    private get logContext();
    requirePublisher(require?: boolean): void;
    createAndSendPublisherOffer(options?: RTCOfferOptions): Promise<void>;
    setPublisherAnswer(sd: RTCSessionDescriptionInit, offerId: number): Promise<boolean>;
    removeTrack(sender: RTCRtpSender): void | undefined;
    close(): Promise<void>;
    /**
     * Restarts ICE on the transports that need it. Only the publisher: the server restarts the
     * subscriber's ICE itself and follows with a fresh offer.
     *
     * The subscriber deliberately does NOT enter `restartingIce` here. Queueing its remote
     * candidates would guard against candidates for a new generation arriving before the offer
     * that introduces it, but the server does not send them in that order -- on a same-node
     * resume it buffers them until the offer has gone out, and on a reconnect that lands on
     * another node it withholds subscriber candidates until immediately before creating the
     * offer. Setting the flag only risks withholding candidates during the window that decides
     * whether the reconnect succeeded.
     */
    triggerIceRestart(): Promise<void>;
    addIceCandidate(candidate: RTCIceCandidateInit, target: SignalTarget): Promise<void>;
    createSubscriberAnswerFromOffer(sd: RTCSessionDescriptionInit, offerId: number): Promise<RTCSessionDescriptionInit | undefined>;
    updateConfiguration(config: RTCConfiguration, iceRestart?: boolean): void;
    ensurePCTransportConnection(abortController?: AbortController, timeout?: number): Promise<void>;
    negotiate(abortController: AbortController): Promise<Throws<void, NegotiationError | Error>>;
    addPublisherTransceiver(track: MediaStreamTrack, transceiverInit: RTCRtpTransceiverInit): RTCRtpTransceiver;
    addPublisherTransceiverOfKind(kind: 'audio' | 'video', transceiverInit: RTCRtpTransceiverInit): RTCRtpTransceiver;
    getMidForReceiver(receiver: RTCRtpReceiver): string | null | undefined;
    getMaxPublisherMessageSize(): number | undefined;
    addPublisherTrack(track: MediaStreamTrack): RTCRtpSender;
    createPublisherDataChannel(label: string, dataChannelDict: RTCDataChannelInit): RTCDataChannel;
    /**
     * Returns the first required transport's address if no explicit target is specified
     */
    getConnectedAddress(target?: SignalTarget): Promise<string | undefined>;
    private get requiredTransports();
    private updateState;
    private ensureTransportConnected;
}
export {};
//# sourceMappingURL=PCTransportManager.d.ts.map
