import { AgentDispatchClient } from './AgentDispatchClient.cjs';
import { ConnectorClient } from './ConnectorClient.cjs';
import { EgressClient } from './EgressClient.cjs';
import { IngressClient } from './IngressClient.cjs';
import { RoomServiceClient } from './RoomServiceClient.cjs';
import { SipClient } from './SipClient.cjs';
import '@livekit/protocol';
import './ClientOptions.cjs';
import './ServiceBase.cjs';
import './grants.cjs';
import 'jose';

/** Server host and non-auth options, shared by both authentication modes. */
interface LiveKitAPICommonOptions {
    /** Server host, including protocol. Falls back to the `LIVEKIT_URL` env var. */
    host?: string;
    /** Optional timeout, in seconds, for all server requests. */
    requestTimeout?: number;
    /**
     * Whether to fail over to alternative regions on retryable errors (LiveKit
     * Cloud hosts only). Defaults to true; set to false to disable.
     */
    failover?: boolean;
}
/** API key and secret authentication (recommended for backend use). */
interface ApiKeyAuth {
    /** API key. Falls back to the `LIVEKIT_API_KEY` env var. */
    apiKey?: string;
    /** API secret. Falls back to the `LIVEKIT_API_SECRET` env var. */
    secret?: string;
    token?: never;
}
/** Pre-signed token authentication (client-side use; no secret required). */
interface TokenAuth {
    /** Pre-signed token, sent verbatim. Falls back to the `LIVEKIT_TOKEN` env var. */
    token: string;
    apiKey?: never;
    secret?: never;
}
/**
 * Options for {@link LiveKitAPI}. Provide either an `apiKey` and `secret` or a
 * pre-signed `token` — the two modes are mutually exclusive. Any omitted value
 * falls back to its environment variable (`LIVEKIT_URL`, `LIVEKIT_API_KEY`,
 * `LIVEKIT_API_SECRET`, `LIVEKIT_TOKEN`).
 */
type LiveKitAPIOptions = LiveKitAPICommonOptions & (ApiKeyAuth | TokenAuth);
/**
 * A single entry point to every LiveKit server API, exposing each service
 * through a property, e.g. `api.room.createRoom(...)`.
 *
 * @example
 * ```ts
 * const api = new LiveKitAPI({ apiKey, secret }); // or new LiveKitAPI() to read from env
 * await api.room.createRoom({ name: 'my-room' });
 * ```
 */
declare class LiveKitAPI {
    private readonly _room;
    private readonly _egress;
    private readonly _ingress;
    private readonly _sip;
    private readonly _agentDispatch;
    private readonly _connector;
    /**
     * @param options - server host, credentials, and client options; each value
     *   falls back to its environment variable when omitted.
     */
    constructor(options?: LiveKitAPIOptions);
    get room(): RoomServiceClient;
    get egress(): EgressClient;
    get ingress(): IngressClient;
    get sip(): SipClient;
    get agentDispatch(): AgentDispatchClient;
    get connector(): ConnectorClient;
}

export { LiveKitAPI, type LiveKitAPIOptions };
