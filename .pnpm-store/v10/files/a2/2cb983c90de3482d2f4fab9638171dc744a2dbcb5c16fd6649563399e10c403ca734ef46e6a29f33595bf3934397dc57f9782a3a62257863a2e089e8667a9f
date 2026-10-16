import { SessionDescription, RoomAgentDispatch, ConnectTwilioCallRequest_TwilioCallDirection, DialWhatsAppCallResponse, AcceptWhatsAppCallResponse, ConnectWhatsAppCallResponse, DisconnectWhatsAppCallRequest_DisconnectReason, DisconnectWhatsAppCallResponse, ConnectTwilioCallResponse } from '@livekit/protocol';
import { ClientOptions } from './ClientOptions.cjs';
import { ServiceBase } from './ServiceBase.cjs';
import './grants.cjs';
import 'jose';

interface DialWhatsAppCallOptions {
    /** Required - The identifier of the WhatsApp phone number that is initiating the call */
    whatsappPhoneNumberId: string;
    /** Required - The number of the user that is supposed to receive the call */
    whatsappToPhoneNumber: string;
    /** Required - The API key of the business that is initiating the call */
    whatsappApiKey: string;
    /** Required - WhatsApp Cloud API version, eg: 23.0, 24.0, etc. */
    whatsappCloudApiVersion: string;
    /** Optional - An arbitrary string you can pass in that is useful for tracking and logging purposes */
    whatsappBizOpaqueCallbackData?: string;
    /** Optional - What LiveKit room should this participant be connected to */
    roomName?: string;
    /** Optional - Agents to dispatch the call to */
    agents?: RoomAgentDispatch[];
    /** Optional - Identity of the participant in LiveKit room */
    participantIdentity?: string;
    /** Optional - Name of the participant in LiveKit room */
    participantName?: string;
    /** Optional - User-defined metadata. Will be attached to a created Participant in the room. */
    participantMetadata?: string;
    /** Optional - User-defined attributes. Will be attached to a created Participant in the room. */
    participantAttributes?: {
        [key: string]: string;
    };
    /** Optional - Country where the call terminates as ISO 3166-1 alpha-2 */
    destinationCountry?: string;
    /** Optional - Max time in seconds for the callee to answer the call */
    ringingTimeout?: number;
}
interface AcceptWhatsAppCallOptions {
    /** Required - The identifier of the WhatsApp phone number that is connecting the call */
    whatsappPhoneNumberId: string;
    /** Required - The API key of the business that is connecting the call */
    whatsappApiKey: string;
    /** Required - WhatsApp Cloud API version, eg: 23.0, 24.0, etc. */
    whatsappCloudApiVersion: string;
    /** Required - Call ID sent by Meta */
    whatsappCallId: string;
    /** Optional - An arbitrary string you can pass in that is useful for tracking and logging purposes */
    whatsappBizOpaqueCallbackData?: string;
    /** Required - The call accept webhook comes with SDP from Meta */
    sdp: SessionDescription;
    /** Optional - What LiveKit room should this participant be connected to */
    roomName?: string;
    /** Optional - Agents to dispatch the call to */
    agents?: RoomAgentDispatch[];
    /** Optional - Identity of the participant in LiveKit room */
    participantIdentity?: string;
    /** Optional - Name of the participant in LiveKit room */
    participantName?: string;
    /** Optional - User-defined metadata. Will be attached to a created Participant in the room. */
    participantMetadata?: string;
    /** Optional - User-defined attributes. Will be attached to a created Participant in the room. */
    participantAttributes?: {
        [key: string]: string;
    };
    /** Optional - Country where the call terminates as ISO 3166-1 alpha-2 */
    destinationCountry?: string;
    /** Optional - Wait until the inbound party joins before returning. */
    waitUntilAnswered?: boolean;
    /**
     * Optional - Request timeout in seconds. When `waitUntilAnswered` is set it
     * defaults to the standard ring window; otherwise the client default applies.
     */
    timeout?: number;
}
interface ConnectTwilioCallOptions {
    /** The direction of the call */
    twilioCallDirection: ConnectTwilioCallRequest_TwilioCallDirection;
    /** What LiveKit room should this call be connected to */
    roomName: string;
    /** Optional agents to dispatch the call to */
    agents?: RoomAgentDispatch[];
    /** Optional identity of the participant in LiveKit room */
    participantIdentity?: string;
    /** Optional name of the participant in LiveKit room */
    participantName?: string;
    /** Optional user-defined metadata. Will be attached to a created Participant in the room. */
    participantMetadata?: string;
    /** Optional user-defined attributes. Will be attached to a created Participant in the room. */
    participantAttributes?: {
        [key: string]: string;
    };
    /** Country where the call terminates as ISO 3166-1 alpha-2 */
    destinationCountry?: string;
}
/**
 * Client to access Connector APIs for WhatsApp and Twilio integrations
 */
declare class ConnectorClient extends ServiceBase {
    private readonly rpc;
    /**
     * @param host - hostname including protocol. i.e. 'https://<project>.livekit.cloud'
     * @param apiKey - API Key, can be set in env var LIVEKIT_API_KEY
     * @param secret - API Secret, can be set in env var LIVEKIT_API_SECRET
     * @param options - client options
     */
    constructor(host: string, apiKey?: string, secret?: string, options?: ClientOptions);
    /**
     * Initiate an outbound WhatsApp call
     *
     * @param options - WhatsApp call options
     * @returns Promise containing the WhatsApp call ID and room name
     */
    dialWhatsAppCall(options: DialWhatsAppCallOptions): Promise<DialWhatsAppCallResponse>;
    /**
     * Accept an inbound WhatsApp call
     *
     * @param options - WhatsApp call accept options
     * @returns Promise containing the room name
     */
    acceptWhatsAppCall(options: AcceptWhatsAppCallOptions): Promise<AcceptWhatsAppCallResponse>;
    /**
     * Connect an established WhatsApp call (used for business-initiated calls)
     *
     * @param whatsappCallId - Call ID sent by Meta
     * @param sdp - Session description from Meta
     */
    connectWhatsAppCall(whatsappCallId: string, sdp: SessionDescription): Promise<ConnectWhatsAppCallResponse>;
    /**
     * Disconnect an active WhatsApp call
     *
     * @param whatsappCallId - Call ID sent by Meta
     * @param whatsappApiKey - The API key of the business that is disconnecting the call.
     *   Required when `disconnectReason` is BUSINESS_INITIATED, optional for USER_INITIATED.
     * @param disconnectReason - Optional reason for disconnecting the call. Defaults to BUSINESS_INITIATED.
     */
    disconnectWhatsAppCall(whatsappCallId: string, whatsappApiKey: string, disconnectReason?: DisconnectWhatsAppCallRequest_DisconnectReason): Promise<DisconnectWhatsAppCallResponse>;
    /**
     * Connect a Twilio call to a LiveKit room
     *
     * @param options - Twilio call connection options
     * @returns Promise containing the WebSocket connect URL for Twilio media stream
     */
    connectTwilioCall(options: ConnectTwilioCallOptions): Promise<ConnectTwilioCallResponse>;
}

export { type AcceptWhatsAppCallOptions, type ConnectTwilioCallOptions, ConnectorClient, type DialWhatsAppCallOptions };
