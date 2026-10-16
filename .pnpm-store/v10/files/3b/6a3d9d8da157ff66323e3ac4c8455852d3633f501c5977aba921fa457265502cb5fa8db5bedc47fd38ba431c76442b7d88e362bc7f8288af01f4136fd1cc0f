import { BinaryReadOptions, JsonValue, JsonReadOptions } from '@bufbuild/protobuf';
import { WebhookEvent as WebhookEvent$1 } from '@livekit/protocol';

declare const authorizeHeader = "Authorize";
declare class WebhookEvent extends WebhookEvent$1 {
    event: WebhookEventNames;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): WebhookEvent;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): WebhookEvent;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): WebhookEvent;
}
type WebhookEventNames = 'room_started' | 'room_finished' | 'participant_joined' | 'participant_left' | 'participant_connection_aborted' | 'track_published' | 'track_unpublished' | 'egress_started' | 'egress_updated' | 'egress_ended' | 'ingress_started' | 'ingress_ended'
/**
 * @internal
 * @remarks only used as a default value, not a valid webhook event
 */
 | '';
declare class WebhookReceiver {
    private verifier;
    constructor(apiKey: string, apiSecret: string);
    /**
     * @param body - string of the posted body
     * @param authHeader - `Authorization` header from the request
     * @param skipAuth - true to skip auth validation
     * @param clockTolerance - How much tolerance to allow for checks against the auth header to be skewed from the claims
     * @returns The processed webhook event
     */
    receive(body: string, authHeader?: string, skipAuth?: boolean, clockTolerance?: string | number): Promise<WebhookEvent>;
}

export { WebhookEvent, type WebhookEventNames, WebhookReceiver, authorizeHeader };
