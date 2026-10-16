import type { AddTrackRequest, ConnectionQualityUpdate, JoinResponse, RegionSettings, StreamStateUpdate, SubscriptionPermissionUpdate, SubscriptionResponse } from '@livekit/protocol';
import { DataPacket, DataTrackSubscriberHandles, DisconnectReason, Encryption_Type, ParticipantInfo, PublishDataTrackResponse, ReconnectReason, RequestResponse, Room as RoomModel, RoomMovedResponse, ServerInfo, SpeakerInfo, SubscribedQualityUpdate, TrackInfo, TrackUnpublishedResponse, Transcription, UnpublishDataTrackResponse } from '@livekit/protocol';
import type TypedEventEmitter from 'typed-emitter';
import type { SignalOptions } from '../api/SignalClient';
import { SignalClient } from '../api/SignalClient';
import type { BaseE2EEManager } from '../e2ee/E2eeManager';
import type { InternalRoomOptions } from '../options';
import type { NonSharedUint8Array } from '../type-polyfills/non-shared-typed-arrays';
import PCTransport from './PCTransport';
import { PCTransportManager } from './PCTransportManager';
import { DataChannelKind } from './data-channel/types';
import { DataTrackInfo } from './data-track/types';
import type LocalTrack from './track/LocalTrack';
import type LocalTrackPublication from './track/LocalTrackPublication';
import LocalVideoTrack from './track/LocalVideoTrack';
import type { SimulcastTrackInfo } from './track/LocalVideoTrack';
import type RemoteTrackPublication from './track/RemoteTrackPublication';
import type { Track } from './track/Track';
import type { TrackPublishOptions, VideoCodec } from './track/options';
export { DataChannelKind };
declare const RTCEngine_base: new () => TypedEventEmitter<EngineEventCallbacks>;
/** @internal */
export default class RTCEngine extends RTCEngine_base {
    private options;
    client: SignalClient;
    rtcConfig: RTCConfiguration;
    peerConnectionTimeout: number;
    fullReconnectOnNext: boolean;
    pcManager?: PCTransportManager;
    /**
     * @internal
     */
    latestJoinResponse?: JoinResponse;
    /**
     * @internal
     */
    latestRemoteOfferId: number;
    /** @internal */
    e2eeManager: BaseE2EEManager | undefined;
    get isClosed(): boolean;
    get isNewlyCreated(): boolean;
    get pendingReconnect(): boolean;
    get serverVersion(): (string | undefined);
    /**
     * Owns the data channels: the three flow-controlled publisher wrappers (engine-lifetime; the
     * RTCDataChannel handles underneath are attached/detached as peer connections come and go, with
     * waiter invalidation built into the turnover) plus the subscriber-side receive handles.
     */
    private dataChannels;
    private get reliableChannel();
    private get lossyChannel();
    private get dataTrackChannel();
    private subscriberPrimary;
    private pcState;
    private _isClosed;
    private _isNewlyCreated;
    private pendingTrackResolvers;
    private url?;
    private token?;
    private signalOpts?;
    private reconnectAttempts;
    private reconnectStart;
    private clientConfiguration?;
    private attemptingReconnect;
    private reconnectPolicy;
    private reconnectTimeout?;
    private participantSid?;
    /** keeps track of how often an initial join connection has been tried */
    private joinAttempts;
    /** specifies how often an initial join connection is allowed to retry */
    private maxJoinAttempts;
    private closingLock;
    private dataProcessLock;
    private shouldFailNext;
    private shouldFailOnV1Path;
    private regionStrategy?;
    private log;
    private loggerOptions;
    private publisherConnectionPromise;
    private reliableReceivedState;
    private midToTrackId;
    /** used to indicate whether the browser is currently waiting to reconnect */
    private isWaitingForNetworkReconnect;
    /** set while the local participant's connection quality is `LOST`; forces a full reconnect on timeout */
    private lostQualityTimeout?;
    /** timestamp (ms) the primary transport entered `CONNECTING`, used to bound how long we tolerate it */
    private transportConnectingSince?;
    /**
     * Abort handlers for the in-flight `negotiate()` calls, which a single central
     * Closing/Restarting listener pair fans out to. Registering a listener pair per call instead
     * accumulates them on the engine emitter and trips its max-listener warning under
     * renegotiation bursts.
     */
    private pendingNegotiationAborts;
    constructor(options: InternalRoomOptions);
    get logContext(): {
        room: string | undefined;
        roomID: string | undefined;
        participant: string | undefined;
        participantID: string | undefined;
    };
    join(url: string, token: string, opts: SignalOptions, abortSignal?: AbortSignal, 
    /** setting this to true results in dual peer connection mode being used */
    useV0Path?: boolean): Promise<{
        joinResponse: JoinResponse;
        serverInfo: Partial<ServerInfo>;
    }>;
    /**
     * @param reason why the session is ending, recorded by the signal lifecycle. Worth passing
     * wherever the caller knows more than "someone called close" — the server's leave reason, or
     * having given up on reconnecting.
     */
    close(reason?: string): Promise<void>;
    cleanupPeerConnections(): Promise<void>;
    cleanupLossyDataStats(): void;
    cleanupClient(reason?: string): Promise<void>;
    addTrack(req: AddTrackRequest): Promise<TrackInfo>;
    /**
     * Removes sender from PeerConnection, returning true if it was removed successfully
     * and a negotiation is necessary
     * @param sender
     * @returns
     */
    removeTrack(sender: RTCRtpSender): boolean;
    updateMuteStatus(trackSid: string, muted: boolean): void;
    get dataSubscriberReadyState(): (string | undefined);
    getConnectedServerAddress(): Promise<string | undefined>;
    setRegionStrategy(strategy: RegionStrategy | undefined): void;
    private configure;
    private setupSignalClientCallbacks;
    private makeRTCConfiguration;
    /**
     * Populate the publisher PC so its first offer carries the data channels + recvonly media
     * sections. Required for every V1 connection: Firefox only binds receive decoders for media
     * present in that first offer, and the offer-with-join path needs the sections to
     * build a meaningful initial offer. Must be called on a configured pcManager.
     */
    private applyInitialPublisherLayout;
    private addMediaSections;
    private createDataChannels;
    private handleDataChannel;
    /** Normalizes an incoming data-channel message into bytes, or logs and returns undefined. */
    private decodeDataMessage;
    private handleDataMessage;
    private handleDataTrackMessage;
    private handleDataError;
    private handleDataChannelClose;
    createSender(track: LocalTrack, opts: TrackPublishOptions, encodings?: RTCRtpEncodingParameters[]): Promise<RTCRtpSender>;
    createSimulcastSender(track: LocalVideoTrack, simulcastTrack: SimulcastTrackInfo, opts: TrackPublishOptions, encodings?: RTCRtpEncodingParameters[]): Promise<RTCRtpSender | undefined>;
    private get frameMetadataWorker();
    private setupFrameMetadataSender;
    private createTransceiverRTCRtpSender;
    private createSimulcastTransceiverSender;
    private createRTCRtpSender;
    private handleDisconnect;
    /**
     * A sustained local `LOST` while connected and publishing means the server isn't receiving
     * our media, so force a full reconnect; any non-`LOST` value cancels a pending trigger.
     */
    private handleLocalConnectionQuality;
    private scheduleLostQualityReconnect;
    private clearLostQualityTimeout;
    /** Whether the publisher currently has any sender with a live track. */
    private hasActivePublisherSenders;
    /**
     * Forces a full reconnect while keeping the engine (and its saved credentials) alive. Used by
     * Room's connection-reconcile safety net when the transport silently died but we looked connected.
     * @internal
     */
    reconnect(reason?: ReconnectReason): void;
    private attemptReconnect;
    private getNextRetryDelay;
    private restartConnection;
    private resumeConnection;
    waitForPCInitialConnection(timeout?: number, abortController?: AbortController): Promise<void>;
    private waitForPCReconnected;
    waitForRestarted: () => Promise<void>;
    /** @internal */
    publishRpcAck(destinationIdentity: string, requestId: string): Promise<void>;
    sendDataPacket(packet: DataPacket, 
    /**  Data-track frames don't come through here — they're sent pre-serialized via {@link sendDataTrackFrame }. */
    kind: Exclude<DataChannelKind, DataChannelKind.DATA_TRACK_LOSSY>): Promise<void>;
    /**
     * Sends pre-serialized bytes on the data-track channel. This is the one send path that doesn't
     * go through {@link sendDataPacket} — Room's `packetAvailable` handler calls it directly with
     * bytes the data-track pipeline already serialized.
     *
     * @internal
     */
    sendDataTrackFrame(bytes: NonSharedUint8Array): Promise<void>;
    private resendReliableMessagesForResume;
    /** The flow-control gate for `kind` — see {@link FlowControlledDataChannel}. */
    private flowControlFor;
    /**
     * Resolves once the caller may send on the `kind` channel — see
     * {@link FlowControlledDataChannel.waitForHeadroomWithLock}.
     */
    waitForBufferHeadroom(kind: DataChannelKind): Promise<void>;
    /**
     * @internal
     */
    ensureDataTransportConnected(kind: DataChannelKind, subscriber?: boolean): Promise<void>;
    private ensurePublisherConnected;
    verifyTransport(): boolean;
    /** @internal */
    negotiate(): Promise<void>;
    dataChannelForKind(kind: DataChannelKind, sub?: boolean): RTCDataChannel | undefined;
    /** @internal */
    sendSyncState(remoteTracks: RemoteTrackPublication[], localTracks: LocalTrackPublication[], localDataTrackInfos: Array<DataTrackInfo>): void;
    failNext(): void;
    failNextV1Path(): void;
    private onRtpMapAvailable;
    private dataChannelsInfo;
    private clearReconnectTimeout;
    private clearPendingReconnect;
    private handleBrowserOnLine;
    private handleBrowserOffline;
    private registerOnLineListener;
    private deregisterOnLineListener;
    getTrackIdForReceiver(receiver: RTCRtpReceiver): string | undefined;
}
export type EngineEventCallbacks = {
    connected: (joinResp: JoinResponse) => void;
    disconnected: (reason?: DisconnectReason) => void;
    resuming: () => void;
    resumed: () => void;
    restarting: () => void;
    restarted: () => void;
    signalResumed: () => void;
    signalRestarted: (joinResp: JoinResponse) => void;
    closing: () => void;
    mediaTrackAdded: (track: MediaStreamTrack, streams: MediaStream, receiver: RTCRtpReceiver) => void;
    activeSpeakersUpdate: (speakers: Array<SpeakerInfo>) => void;
    dataPacketReceived: (packet: DataPacket, encryptionType: Encryption_Type) => void;
    transcriptionReceived: (transcription: Transcription) => void;
    transportsCreated: (publisher: PCTransport, subscriber?: PCTransport) => void;
    /** @internal */
    trackSenderAdded: (track: Track, sender: RTCRtpSender) => void;
    rtpVideoMapUpdate: (rtpMap: Map<number, VideoCodec>) => void;
    dcBufferStatusChanged: (isLow: boolean, kind: DataChannelKind) => void;
    participantUpdate: (infos: ParticipantInfo[]) => void;
    roomUpdate: (room: RoomModel) => void;
    roomMoved: (room: RoomMovedResponse) => void;
    connectionQualityUpdate: (update: ConnectionQualityUpdate) => void;
    speakersChanged: (speakerUpdates: SpeakerInfo[]) => void;
    streamStateChanged: (update: StreamStateUpdate) => void;
    subscriptionError: (resp: SubscriptionResponse) => void;
    subscriptionPermissionUpdate: (update: SubscriptionPermissionUpdate) => void;
    subscribedQualityUpdate: (update: SubscribedQualityUpdate) => void;
    localTrackUnpublished: (unpublishedResponse: TrackUnpublishedResponse) => void;
    localTrackSubscribed: (trackSid: string) => void;
    remoteMute: (trackSid: string, muted: boolean) => void;
    offline: () => void;
    signalRequestResponse: (response: RequestResponse) => void;
    signalConnected: (joinResp: JoinResponse) => void;
    publishDataTrackResponse: (event: PublishDataTrackResponse) => void;
    unPublishDataTrackResponse: (event: UnpublishDataTrackResponse) => void;
    dataTrackSubscriberHandles: (event: DataTrackSubscriberHandles) => void;
    dataTrackPacketReceived: (packet: Uint8Array) => void;
    joined: (joinResponse: JoinResponse) => void;
    tokenRefreshed: (token: string) => void;
    serverRegionsReported: (regions: RegionSettings) => void;
    requestSubscribedCodecRefresh: () => void;
};
export interface RegionStrategy {
    getNextUrl(abortSignal?: AbortSignal): Promise<string | null>;
    resetAttempts(): void;
}
//# sourceMappingURL=RTCEngine.d.ts.map
