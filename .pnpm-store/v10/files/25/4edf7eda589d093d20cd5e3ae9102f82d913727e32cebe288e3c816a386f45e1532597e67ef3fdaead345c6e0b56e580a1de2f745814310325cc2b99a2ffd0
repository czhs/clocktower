import { SIPTrunkInfo, SIPHeaderOptions, SIPMediaEncryption, SIPMediaConfig, SIPInboundTrunkInfo, SIPTransport, SIPOutboundTrunkInfo, Pagination, RoomConfiguration, SIPDispatchRuleInfo, ListUpdate, SIPDispatchRule, SIPOutboundConfig, SIPParticipantInfo } from '@livekit/protocol';
import { ClientOptions } from './ClientOptions.js';
import { ServiceBase } from './ServiceBase.js';
import './grants.js';
import 'jose';

/**
 * @deprecated use CreateSipInboundTrunkOptions or CreateSipOutboundTrunkOptions
 */
interface CreateSipTrunkOptions {
    name?: string;
    metadata?: string;
    inbound_addresses?: string[];
    inbound_numbers?: string[];
    inbound_username?: string;
    inbound_password?: string;
    outbound_address?: string;
    outbound_username?: string;
    outbound_password?: string;
}
interface CreateSipInboundTrunkOptions {
    metadata?: string;
    /** @deprecated - use `allowedAddresses` instead */
    allowed_addresses?: string[];
    allowedAddresses?: string[];
    /** @deprecated - use `allowedNumbers` instead */
    allowed_numbers?: string[];
    allowedNumbers?: string[];
    /** @deprecated - use `authUsername` instead */
    auth_username?: string;
    authUsername?: string;
    /** @deprecated - use `authPassword` instead */
    auth_password?: string;
    authPassword?: string;
    headers?: {
        [key: string]: string;
    };
    headersToAttributes?: {
        [key: string]: string;
    };
    includeHeaders?: SIPHeaderOptions;
    krispEnabled?: boolean;
    /** @deprecated - use `media.encryption` instead */
    mediaEncryption?: SIPMediaEncryption;
    media?: SIPMediaConfig;
    /** Maximum time for a call to ring in seconds. */
    ringingTimeout?: number;
}
interface CreateSipOutboundTrunkOptions {
    metadata?: string;
    transport: SIPTransport;
    destinationCountry?: string;
    /** @deprecated - use `authUsername` instead */
    auth_username?: string;
    authUsername?: string;
    /** @deprecated - use `authPassword` instead */
    auth_password?: string;
    authPassword?: string;
    headers?: {
        [key: string]: string;
    };
    headersToAttributes?: {
        [key: string]: string;
    };
    includeHeaders?: SIPHeaderOptions;
    /** @deprecated - use `media.encryption` instead */
    mediaEncryption?: SIPMediaEncryption;
    media?: SIPMediaConfig;
}
interface SipDispatchRuleDirect {
    type: 'direct';
    roomName: string;
    pin?: string;
}
interface SipDispatchRuleIndividual {
    type: 'individual';
    roomPrefix: string;
    pin?: string;
}
interface SipDispatchRuleCallee {
    type: 'callee';
    roomPrefix: string;
    pin?: string;
    /** Optionally append a random suffix to the room name. */
    randomize?: boolean;
}
interface CreateSipDispatchRuleOptions {
    name?: string;
    metadata?: string;
    trunkIds?: string[];
    hidePhoneNumber?: boolean;
    attributes?: {
        [key: string]: string;
    };
    roomPreset?: string;
    roomConfig?: RoomConfiguration;
}
interface CreateSipParticipantOptions {
    /** Optional SIP From number to use. If empty, trunk number is used. */
    fromNumber?: string;
    /** Optional identity of the SIP participant */
    participantIdentity?: string;
    /** Optional name of the participant */
    participantName?: string;
    /** Optional display name for the SIP participant */
    displayName?: string;
    /** Optional metadata to attach to the participant */
    participantMetadata?: string;
    /** Optional attributes to attach to the participant */
    participantAttributes?: {
        [key: string]: string;
    };
    /** Optionally send following DTMF digits (extension codes) when making a call.
     * Character 'w' can be used to add a 0.5 sec delay. */
    dtmf?: string;
    /** @deprecated use `playDialtone` instead */
    playRingtone?: boolean;
    /** If `true`, the SIP Participant plays a dial tone to the room until the phone is picked up. */
    playDialtone?: boolean;
    /** These headers are sent as-is and may help identify this call as coming from LiveKit for the other SIP endpoint. */
    headers?: {
        [key: string]: string;
    };
    /** Map SIP response headers from INVITE to sip.h.* participant attributes automatically. */
    includeHeaders?: SIPHeaderOptions;
    hidePhoneNumber?: boolean;
    /** Maximum time for the call to ring in seconds. */
    ringingTimeout?: number;
    /** Maximum call duration in seconds. */
    maxCallDuration?: number;
    /** If `true`, Krisp noise cancellation will be enabled for the caller. */
    krispEnabled?: boolean;
    /** If `true`, this will wait until the call is answered before returning. */
    waitUntilAnswered?: boolean;
    /** Optional request timeout in seconds. Defaults to 30s when waitUntilAnswered is true (dialing takes time), otherwise the client default. */
    timeout?: number;
    media?: SIPMediaConfig;
}
interface ListSipDispatchRuleOptions {
    /** Pagination options. */
    page?: Pagination;
    /** Rule IDs to list. If this option is set, the response will contains rules in the same order. If any of the rules is missing, a nil item in that position will be sent in the response. */
    dispatchRuleIds?: string[];
    /** Only list rules that contain one of the Trunk IDs, including wildcard rules. */
    trunkIds?: string[];
}
interface ListSipTrunkOptions {
    /** Pagination options. */
    page?: Pagination;
    /** Trunk IDs to list. If this option is set, the response will contains trunks in the same order. If any of the trunks is missing, a nil item in that position will be sent in the response. */
    trunkIds?: string[];
    /** Only list trunks that contain one of the numbers, including wildcard trunks. */
    numbers?: string[];
}
interface SipDispatchRuleUpdateOptions {
    trunkIds?: ListUpdate;
    rule?: SIPDispatchRule;
    name?: string;
    metadata?: string;
    attributes?: {
        [key: string]: string;
    };
}
interface SipInboundTrunkUpdateOptions {
    numbers?: ListUpdate;
    allowedAddresses?: ListUpdate;
    allowedNumbers?: ListUpdate;
    authUsername?: string;
    authPassword?: string;
    name?: string;
    metadata?: string;
    /** @deprecated - use `media.encryption` instead */
    mediaEncryption?: SIPMediaEncryption;
    media?: SIPMediaConfig;
}
interface SipOutboundTrunkUpdateOptions {
    numbers?: ListUpdate;
    allowedAddresses?: ListUpdate;
    allowedNumbers?: ListUpdate;
    authUsername?: string;
    authPassword?: string;
    destinationCountry?: string;
    name?: string;
    metadata?: string;
    /** @deprecated - use `media.encryption` instead */
    mediaEncryption?: SIPMediaEncryption;
    media?: SIPMediaConfig;
}
interface TransferSipParticipantOptions {
    playDialtone?: boolean;
    headers?: {
        [key: string]: string;
    };
    /** Maximum time for the transfer destination to answer the call, in seconds. */
    ringingTimeout?: number;
    /** Optional request timeout in seconds. Defaults to 30s (dialing takes time). */
    timeout?: number;
}
/**
 * Client to access Egress APIs
 */
declare class SipClient extends ServiceBase {
    private readonly rpc;
    /**
     * @param host - hostname including protocol. i.e. 'https://<project>.livekit.cloud'
     * @param apiKey - API Key, can be set in env var LIVEKIT_API_KEY
     * @param secret - API Secret, can be set in env var LIVEKIT_API_SECRET
     * @param options - client options
     */
    constructor(host: string, apiKey?: string, secret?: string, options?: ClientOptions);
    /**
     * @param number - phone number of the trunk
     * @param opts - CreateSipTrunkOptions
     * @deprecated use `createSipInboundTrunk` or `createSipOutboundTrunk`
     */
    createSipTrunk(number: string, opts?: CreateSipTrunkOptions): Promise<SIPTrunkInfo>;
    /**
     * Create a new SIP inbound trunk.
     *
     * @param name - human-readable name of the trunk
     * @param numbers - phone numbers of the trunk
     * @param opts - CreateSipTrunkOptions
     * @returns Created SIP inbound trunk
     */
    createSipInboundTrunk(name: string, numbers: string[], opts?: CreateSipInboundTrunkOptions): Promise<SIPInboundTrunkInfo>;
    /**
     * Create a new SIP outbound trunk.
     *
     * @param name - human-readable name of the trunk
     * @param address - hostname and port of the SIP server to dial
     * @param numbers - phone numbers of the trunk
     * @param opts - CreateSipTrunkOptions
     * @returns Created SIP outbound trunk
     */
    createSipOutboundTrunk(name: string, address: string, numbers: string[], opts?: CreateSipOutboundTrunkOptions): Promise<SIPOutboundTrunkInfo>;
    /**
     * @deprecated use `listSipInboundTrunk` or `listSipOutboundTrunk`
     */
    listSipTrunk(): Promise<Array<SIPTrunkInfo>>;
    /**
     * List SIP inbound trunks with optional filtering.
     *
     * @param list - Request with optional filtering parameters
     * @returns Response containing list of SIP inbound trunks
     */
    listSipInboundTrunk(list?: ListSipTrunkOptions): Promise<Array<SIPInboundTrunkInfo>>;
    /**
     * List SIP outbound trunks with optional filtering.
     *
     * @param list - Request with optional filtering parameters
     * @returns Response containing list of SIP outbound trunks
     */
    listSipOutboundTrunk(list?: ListSipTrunkOptions): Promise<Array<SIPOutboundTrunkInfo>>;
    /**
     * Delete a SIP trunk.
     *
     * @param sipTrunkId - ID of the SIP trunk to delete
     * @returns Deleted trunk information
     */
    deleteSipTrunk(sipTrunkId: string): Promise<SIPTrunkInfo>;
    /**
     * Create a new SIP dispatch rule.
     *
     * @param rule - SIP dispatch rule to create
     * @param opts - CreateSipDispatchRuleOptions
     * @returns Created SIP dispatch rule
     */
    createSipDispatchRule(rule: SipDispatchRuleDirect | SipDispatchRuleIndividual | SipDispatchRuleCallee, opts?: CreateSipDispatchRuleOptions): Promise<SIPDispatchRuleInfo>;
    /**
     * Updates an existing SIP dispatch rule by replacing it entirely.
     *
     * @param sipDispatchRuleId - ID of the SIP dispatch rule to update
     * @param rule - new SIP dispatch rule
     * @returns Updated SIP dispatch rule
     */
    updateSipDispatchRule(sipDispatchRuleId: string, rule: SIPDispatchRuleInfo): Promise<SIPDispatchRuleInfo>;
    /**
     * Updates specific fields of an existing SIP dispatch rule.
     * Only provided fields will be updated.
     *
     * @param sipDispatchRuleId - ID of the SIP dispatch rule to update
     * @param fields - Fields of the dispatch rule to update
     * @returns Updated SIP dispatch rule
     */
    updateSipDispatchRuleFields(sipDispatchRuleId: string, fields?: SipDispatchRuleUpdateOptions): Promise<SIPDispatchRuleInfo>;
    /**
     * Updates an existing SIP inbound trunk by replacing it entirely.
     *
     * @param sipTrunkId - ID of the SIP inbound trunk to update
     * @param trunk - SIP inbound trunk to update with
     * @returns Updated SIP inbound trunk
     */
    updateSipInboundTrunk(sipTrunkId: string, trunk: SIPInboundTrunkInfo): Promise<SIPInboundTrunkInfo>;
    /**
     * Updates specific fields of an existing SIP inbound trunk.
     * Only provided fields will be updated.
     *
     * @param sipTrunkId - ID of the SIP inbound trunk to update
     * @param fields - Fields of the inbound trunk to update
     * @returns Updated SIP inbound trunk
     */
    updateSipInboundTrunkFields(sipTrunkId: string, fields: SipInboundTrunkUpdateOptions): Promise<SIPInboundTrunkInfo>;
    /**
     * Updates an existing SIP outbound trunk by replacing it entirely.
     *
     * @param sipTrunkId - ID of the SIP outbound trunk to update
     * @param trunk - SIP outbound trunk to update with
     * @returns Updated SIP outbound trunk
     */
    updateSipOutboundTrunk(sipTrunkId: string, trunk: SIPOutboundTrunkInfo): Promise<SIPOutboundTrunkInfo>;
    /**
     * Updates specific fields of an existing SIP outbound trunk.
     * Only provided fields will be updated.
     *
     * @param sipTrunkId - ID of the SIP outbound trunk to update
     * @param fields - Fields of the outbound trunk to update
     * @returns Updated SIP outbound trunk
     */
    updateSipOutboundTrunkFields(sipTrunkId: string, fields: SipOutboundTrunkUpdateOptions): Promise<SIPOutboundTrunkInfo>;
    /**
     * List SIP dispatch rules with optional filtering.
     *
     * @param list - Request with optional filtering parameters
     * @returns Response containing list of SIP dispatch rules
     */
    listSipDispatchRule(list?: ListSipDispatchRuleOptions): Promise<Array<SIPDispatchRuleInfo>>;
    /**
     * Delete a SIP dispatch rule.
     *
     * @param sipDispatchRuleId - ID of the SIP dispatch rule to delete
     * @returns Deleted rule information
     */
    deleteSipDispatchRule(sipDispatchRuleId: string): Promise<SIPDispatchRuleInfo>;
    /**
     * Create a new SIP participant.
     *
     * @param sipTrunkId - sip trunk to use for the call
     * @param number - number to dial
     * @param roomName - room to attach the call to
     * @param opts - CreateSipParticipantOptions
     * @param outboundTrunkConfig - Optional outbound trunk configuration for sip participant.
     * @returns Created SIP participant
     */
    createSipParticipant(sipTrunkId: string, number: string, roomName: string, opts?: CreateSipParticipantOptions, outboundTrunkConfig?: SIPOutboundConfig): Promise<SIPParticipantInfo>;
    /**
     * Transfer a SIP participant to a different room.
     *
     * @param roomName - room the SIP participant to transfer is connectd to
     * @param participantIdentity - identity of the SIP participant to transfer
     * @param transferTo - SIP URL to transfer the participant to
     * @param opts - TransferSipParticipantOptions
     */
    transferSipParticipant(roomName: string, participantIdentity: string, transferTo: string, opts?: TransferSipParticipantOptions): Promise<void>;
}

export { type CreateSipDispatchRuleOptions, type CreateSipInboundTrunkOptions, type CreateSipOutboundTrunkOptions, type CreateSipParticipantOptions, type CreateSipTrunkOptions, type ListSipDispatchRuleOptions, type ListSipTrunkOptions, SipClient, type SipDispatchRuleCallee, type SipDispatchRuleDirect, type SipDispatchRuleIndividual, type SipDispatchRuleUpdateOptions, type SipInboundTrunkUpdateOptions, type SipOutboundTrunkUpdateOptions, type TransferSipParticipantOptions };
