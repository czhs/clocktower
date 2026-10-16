import { WebhookConfig, EncodedFileOutput, StreamOutput, SegmentedFileOutput, ImageOutput, EncodingOptionsPreset, EncodingOptions, AudioMixing, EgressInfo, DirectFileOutput, StartEgressRequest } from '@livekit/protocol';
import { ClientOptions } from './ClientOptions.cjs';
import { ServiceBase } from './ServiceBase.cjs';
import './grants.cjs';
import 'jose';

interface BaseOptions {
    /**
     * webhooks to call for this request, optional.
     */
    webhooks?: WebhookConfig[];
}
interface RoomCompositeOptions extends BaseOptions {
    /**
     * egress layout. optional
     */
    layout?: string;
    /**
     * encoding options or preset. optional
     */
    encodingOptions?: EncodingOptionsPreset | EncodingOptions;
    /**
     * record audio only. optional
     */
    audioOnly?: boolean;
    /**
     * record video only. optional
     */
    videoOnly?: boolean;
    /**
     * custom template url. optional
     */
    customBaseUrl?: string;
    /**
     * audio mixing options. optional
     */
    audioMixing?: AudioMixing;
}
interface WebOptions extends BaseOptions {
    /**
     * encoding options or preset. optional
     */
    encodingOptions?: EncodingOptionsPreset | EncodingOptions;
    /**
     * record audio only. optional
     */
    audioOnly?: boolean;
    /**
     * record video only. optional
     */
    videoOnly?: boolean;
    /**
     * await START_RECORDING chrome log
     */
    awaitStartSignal?: boolean;
}
interface ParticipantEgressOptions extends BaseOptions {
    /**
     * true to capture source screenshare and screenshare_audio
     * false to capture camera and microphone
     */
    screenShare?: boolean;
    /**
     * encoding options or preset. optional
     */
    encodingOptions?: EncodingOptionsPreset | EncodingOptions;
}
interface TrackCompositeOptions extends BaseOptions {
    /**
     * audio track ID
     */
    audioTrackId?: string;
    /**
     * video track ID
     */
    videoTrackId?: string;
    /**
     * encoding options or preset. optional
     */
    encodingOptions?: EncodingOptionsPreset | EncodingOptions;
}
/**
 * Used to supply multiple outputs with an egress request
 */
interface EncodedOutputs {
    file?: EncodedFileOutput | undefined;
    stream?: StreamOutput | undefined;
    segments?: SegmentedFileOutput | undefined;
    images?: ImageOutput | undefined;
}
interface ListEgressOptions {
    roomName?: string;
    egressId?: string;
    active?: boolean;
}
/**
 * Client to access Egress APIs
 */
declare class EgressClient extends ServiceBase {
    private readonly rpc;
    /**
     * @param host - hostname including protocol. i.e. 'https://<project>.livekit.cloud'
     * @param apiKey - API Key, can be set in env var LIVEKIT_API_KEY
     * @param secret - API Secret, can be set in env var LIVEKIT_API_SECRET
     * @param options - client options
     */
    constructor(host: string, apiKey?: string, secret?: string, options?: ClientOptions);
    /**
     * @param roomName - room name
     * @param output - file or stream output
     * @param opts - RoomCompositeOptions
     */
    startRoomCompositeEgress(roomName: string, output: EncodedOutputs | EncodedFileOutput | StreamOutput | SegmentedFileOutput, opts?: RoomCompositeOptions): Promise<EgressInfo>;
    /**
     * @deprecated use RoomCompositeOptions instead
     */
    startRoomCompositeEgress(roomName: string, output: EncodedOutputs | EncodedFileOutput | StreamOutput | SegmentedFileOutput, layout?: string, options?: EncodingOptionsPreset | EncodingOptions, audioOnly?: boolean, videoOnly?: boolean, customBaseUrl?: string, audioMixing?: AudioMixing): Promise<EgressInfo>;
    /**
     * @param url - url
     * @param output - file or stream output
     * @param opts - WebOptions
     */
    startWebEgress(url: string, output: EncodedOutputs | EncodedFileOutput | StreamOutput | SegmentedFileOutput, opts?: WebOptions): Promise<EgressInfo>;
    /**
     * Export a participant's audio and video tracks,
     *
     * @param roomName - room name
     * @param output - one or more outputs
     * @param opts - ParticipantEgressOptions
     */
    startParticipantEgress(roomName: string, identity: string, output: EncodedOutputs, opts?: ParticipantEgressOptions): Promise<EgressInfo>;
    /**
     * @param roomName - room name
     * @param output - file or stream output
     * @param opts - TrackCompositeOptions
     */
    startTrackCompositeEgress(roomName: string, output: EncodedOutputs | EncodedFileOutput | StreamOutput | SegmentedFileOutput, opts?: TrackCompositeOptions): Promise<EgressInfo>;
    /**
     * @deprecated use TrackCompositeOptions instead
     */
    startTrackCompositeEgress(roomName: string, output: EncodedOutputs | EncodedFileOutput | StreamOutput | SegmentedFileOutput, audioTrackId?: string, videoTrackId?: string, options?: EncodingOptionsPreset | EncodingOptions): Promise<EgressInfo>;
    private isEncodedOutputs;
    private isEncodedFileOutput;
    private isSegmentedFileOutput;
    private isStreamOutput;
    private getOutputParams;
    /**
     * @param roomName - room name
     * @param output - file or websocket output
     * @param trackId - track Id
     */
    startTrackEgress(roomName: string, output: DirectFileOutput | string, trackId: string, webhooks?: WebhookConfig[]): Promise<EgressInfo>;
    /**
     * Starts an egress using the unified v2 request.
     *
     * @param request - the egress request
     */
    startEgress(request: StartEgressRequest): Promise<EgressInfo>;
    /**
     * @param egressId -
     * @param layout -
     */
    updateLayout(egressId: string, layout: string): Promise<EgressInfo>;
    /**
     * @param egressId -
     * @param addOutputUrls -
     * @param removeOutputUrls -
     */
    updateStream(egressId: string, addOutputUrls?: string[], removeOutputUrls?: string[]): Promise<EgressInfo>;
    /**
     * @param options - options to filter listed Egresses, by default returns all
     * Egress instances
     */
    listEgress(options?: ListEgressOptions): Promise<Array<EgressInfo>>;
    /**
     * @deprecated use `listEgress(options?: ListEgressOptions)` instead
     * @param roomName - list egress for one room only
     */
    listEgress(roomName?: string): Promise<Array<EgressInfo>>;
    /**
     * @param egressId -
     */
    stopEgress(egressId: string): Promise<EgressInfo>;
}

export { type BaseOptions, EgressClient, type EncodedOutputs, type ListEgressOptions, type ParticipantEgressOptions, type RoomCompositeOptions, type TrackCompositeOptions, type WebOptions };
