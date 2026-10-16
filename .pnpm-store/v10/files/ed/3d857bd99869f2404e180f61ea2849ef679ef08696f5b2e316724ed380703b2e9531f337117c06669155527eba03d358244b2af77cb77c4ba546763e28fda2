import { AddTrackRequest, AudioTrackFeature, ClientInfo_Capability, ConnectionQualityUpdate, DataTrackSubscriberHandles, JoinResponse, LeaveRequest, MediaSectionsRequirement, ParticipantInfo, PublishDataTrackResponse, ReconnectReason, ReconnectResponse, RequestResponse, Room, RoomMovedResponse, SessionDescription, SignalTarget, SimulateScenario, SpeakerInfo, StreamStateUpdate, SubscribedQualityUpdate, SubscriptionPermissionUpdate, SubscriptionResponse, SyncState, TrackPermission, TrackPublishedResponse, TrackUnpublishedResponse, UnpublishDataTrackResponse, UpdateSubscription, UpdateTrackSettings, VideoLayer } from '@livekit/protocol';
import type { DataTrackHandle } from '../room/data-track/handle';
import { type DataTrackSid } from '../room/data-track/types';
import type { LoggerOptions } from '../room/types';
import { AsyncQueue } from '../utils/AsyncQueue';
import { WebSocketStream } from './WebSocketStream';
interface ConnectOpts extends SignalOptions {
    /** internal */
    reconnect?: boolean;
    /** internal */
    reconnectReason?: number;
    /** internal */
    sid?: string;
}
export interface SignalOptions {
    autoSubscribe: boolean;
    adaptiveStream?: boolean;
    disableIceLite?: boolean;
    subscriberAllowPause?: boolean;
    clientInfoCapabilities?: ClientInfo_Capability[];
    maxRetries: number;
    e2eeEnabled: boolean;
    websocketTimeout: number;
}
export declare enum SignalConnectionState {
    CONNECTING = 0,
    CONNECTED = 1,
    RECONNECTING = 2,
    DISCONNECTING = 3,
    DISCONNECTED = 4
}
/** @internal */
export declare class SignalClient {
    requestQueue: AsyncQueue;
    queuedRequests: Array<() => Promise<void>>;
    useJSON: boolean;
    /** signal rtt in milliseconds */
    rtt: number;
    /** simulate signaling latency by delaying messages */
    signalLatency?: number;
    onClose?: (reason: string) => void;
    onAnswer?: (sd: RTCSessionDescriptionInit, offerId: number, midToTrackId: {
        [key: string]: string;
    }) => void;
    onOffer?: (sd: RTCSessionDescriptionInit, offerId: number, midToTrackId: {
        [key: string]: string;
    }) => void;
    onTrickle?: (sd: RTCIceCandidateInit, target: SignalTarget) => void;
    onParticipantUpdate?: (updates: ParticipantInfo[]) => void;
    onLocalTrackPublished?: (res: TrackPublishedResponse) => void;
    onNegotiateRequested?: () => void;
    onSpeakersChanged?: (res: SpeakerInfo[]) => void;
    onRemoteMuteChanged?: (trackSid: string, muted: boolean) => void;
    onRoomUpdate?: (room: Room) => void;
    onConnectionQuality?: (update: ConnectionQualityUpdate) => void;
    onStreamStateUpdate?: (update: StreamStateUpdate) => void;
    onSubscribedQualityUpdate?: (update: SubscribedQualityUpdate) => void;
    onSubscriptionPermissionUpdate?: (update: SubscriptionPermissionUpdate) => void;
    onSubscriptionError?: (update: SubscriptionResponse) => void;
    onLocalTrackUnpublished?: (res: TrackUnpublishedResponse) => void;
    onTokenRefresh?: (token: string) => void;
    onLeave?: (leave: LeaveRequest) => void;
    onRequestResponse?: (response: RequestResponse) => void;
    onLocalTrackSubscribed?: (trackSid: string) => void;
    onRoomMoved?: (res: RoomMovedResponse) => void;
    onMediaSectionsRequirement?: (requirement: MediaSectionsRequirement) => void;
    onPublishDataTrackResponse?: (event: PublishDataTrackResponse) => void;
    onUnPublishDataTrackResponse?: (event: UnpublishDataTrackResponse) => void;
    onDataTrackSubscriberHandles?: (event: DataTrackSubscriberHandles) => void;
    onJoined?: (event: JoinResponse) => void;
    connectOptions?: ConnectOpts;
    ws?: WebSocketStream;
    get currentState(): SignalConnectionState;
    get isDisconnected(): boolean;
    /** Runtime lifecycle state, finer grained than the public {@link currentState} projection. */
    private get lifecycleState();
    /** Id of the current connection attempt and of the transport it owns. */
    private get attemptId();
    /**
     * Applies a lifecycle input and reports whether it moved the machine
     */
    private sendLifecycleInput;
    /**
     * Waits out a close that is already in flight. Establishing a session while one is tearing down
     * would race it for the transport — the teardown can close the socket the new attempt just
     * opened.
     */
    private settleInFlightClose;
    private get isEstablishingConnection();
    private getNextRequestId;
    private options?;
    private pingTimeout;
    private pingTimeoutDuration;
    private pingIntervalDuration;
    private pingInterval;
    private closingLock;
    private machine;
    private connectionLock;
    private log;
    private loggerContextCb?;
    private _requestId;
    private streamWriter;
    private useV0SignalPath;
    constructor(useJSON?: boolean, loggerOptions?: LoggerOptions);
    private get logContext();
    join(url: string, token: string, opts: SignalOptions, abortSignal?: AbortSignal, useV0Path?: boolean, publisherOffer?: SessionDescription): Promise<JoinResponse>;
    reconnect(url: string, token: string, sid?: string, reason?: ReconnectReason): Promise<ReconnectResponse | undefined>;
    private connect;
    startReadingLoop(signalReader: ReadableStreamDefaultReader<string | ArrayBuffer>): Promise<void>;
    /** @internal */
    resetCallbacks: () => void;
    close(updateState?: boolean, reason?: string): Promise<void>;
    /**
     * Releases the transport and everything tied to it, without touching the lifecycle state. Used
     * both by {@link close} and by paths that replace the transport under a live lifecycle (a new
     * attempt, or an unexpected close that leaves the client in `offline`).
     */
    private teardownTransport;
    sendOffer(offer: RTCSessionDescriptionInit, offerId: number): void;
    sendAnswer(answer: RTCSessionDescriptionInit, offerId: number): Promise<void>;
    sendIceCandidate(candidate: RTCIceCandidateInit, target: SignalTarget): Promise<void>;
    sendMuteTrack(trackSid: string, muted: boolean): Promise<void>;
    sendAddTrack(req: AddTrackRequest): Promise<void>;
    sendUpdateLocalMetadata(metadata: string, name: string, attributes?: Record<string, string>): Promise<number>;
    sendUpdateTrackSettings(settings: UpdateTrackSettings): void;
    sendUpdateSubscription(sub: UpdateSubscription): Promise<void>;
    sendSyncState(sync: SyncState): Promise<void>;
    sendUpdateVideoLayers(trackSid: string, layers: VideoLayer[]): Promise<void>;
    sendUpdateSubscriptionPermissions(allParticipants: boolean, trackPermissions: TrackPermission[]): Promise<void>;
    sendSimulateScenario(scenario: SimulateScenario): Promise<void>;
    sendPing(): Promise<[void, void]>;
    sendUpdateLocalAudioTrack(trackSid: string, features: AudioTrackFeature[]): Promise<void>;
    sendLeave(): Promise<void>;
    sendPublishDataTrackRequest(handle: DataTrackHandle, name: string, usesE2ee: boolean): Promise<void>;
    sendUnPublishDataTrackRequest(handle: DataTrackHandle): Promise<void>;
    sendUpdateDataSubscription(sid: DataTrackSid, subscribe: boolean): Promise<void>;
    private sendRequest;
    private handleSignalResponse;
    setReconnected(): void;
    /**
     * Handles a transport we lost without asking to. The client goes to `offline` rather than
     * `closed`: whether this session gets resumed, restarted or given up on is the engine's call.
     */
    private handleOnClose;
    private handleWSError;
    /**
     * Resets the ping timeout and starts a new timeout.
     * Call this after receiving a pong message
     */
    private resetPingTimeout;
    /**
     * Clears ping timeout (does not start a new timeout)
     */
    private clearPingTimeout;
    private startPingInterval;
    private clearPingInterval;
    /**
     * Handles the successful connection to the signal server
     * @param connection The WebSocket connection
     * @param timeoutHandle The timeout handle to clear
     * @param firstMessage Optional first message to process
     * @internal
     */
    private handleSignalConnected;
    /**
     * Validates the first message received from the signal server
     * @param firstSignalResponse The first signal response received
     * @param isReconnect Whether this is a reconnection attempt
     * @returns Validation result with response or error
     * @internal
     */
    private validateFirstMessage;
    /**
     * Handles WebSocket connection errors by validating with the server
     * @param reason The error that occurred
     * @param validateUrl The URL to validate the connection with
     * @returns A ConnectionError with appropriate reason and status
     * @internal
     */
    private handleConnectionError;
}
export declare function toProtoSessionDescription(rsd: RTCSessionDescription | RTCSessionDescriptionInit, id?: number): SessionDescription;
export {};
//# sourceMappingURL=SignalClient.d.ts.map