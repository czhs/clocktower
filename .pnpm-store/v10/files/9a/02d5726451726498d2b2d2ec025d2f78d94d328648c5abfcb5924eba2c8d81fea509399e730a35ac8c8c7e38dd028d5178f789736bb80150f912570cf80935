import { JsonValue } from '@bufbuild/protobuf';

declare const REQUEST_ID_HEADER = "X-Livekit-Request-Id";
type Options = {
    /** Prefix for the RPC requests */
    prefix?: string;
    /** Timeout for fetch requests, in seconds. Must be within the valid range for abort signal timeouts. */
    requestTimeout?: number;
    /** Whether region failover is enabled (LiveKit Cloud hosts only). Defaults to true. */
    failover?: boolean;
    /** @internal test-only: force failover regardless of host. */
    failoverForce?: boolean;
    /** @internal test-only: base retry backoff in ms. */
    failoverBackoffMs?: number;
};
declare const livekitPackage = "livekit";
interface Rpc {
    request(service: string, method: string, data: JsonValue, headers: any, // eslint-disable-line @typescript-eslint/no-explicit-any
    timeout?: number): Promise<string>;
}
declare class ServerError extends Error {
    status: number;
    code?: string;
    metadata?: Record<string, string>;
    constructor(name: string, message: string, status: number, code?: string, metadata?: Record<string, string>);
}
/** @deprecated use {@link ServerError} */
declare const TwirpError: typeof ServerError;
/** @deprecated use {@link ServerError} */
type TwirpError = ServerError;
/**
 * A {@link ServerError} from a SIP dialing call (`createSipParticipant` /
 * `transferSipParticipant`) that failed with a SIP response status. The SIP code
 * and reason are exposed as getters; any other error metadata remains available
 * via {@link ServerError.metadata}.
 */
declare class SipCallError extends ServerError {
    constructor(name: string, message: string, status: number, code?: string, metadata?: Record<string, string>);
    /** The SIP response code of the failed call, e.g. 486 (Busy Here). */
    get sipStatusCode(): number | undefined;
    /** The SIP reason phrase of the failed call, e.g. "Busy Here". */
    get sipStatus(): string | undefined;
    /** Builds a SipCallError from a ServerError, preserving its code and metadata. */
    static fromServerError(err: ServerError): SipCallError;
    private static describe;
}
/**
 * JSON based Twirp V7 RPC
 */
declare class TwirpRpc {
    host: string;
    pkg: string;
    prefix: string;
    requestTimeout: number;
    failover: boolean;
    private failoverForce;
    private failoverBackoffMs;
    constructor(host: string, pkg: string, options?: Options);
    /**
     * Issues a Twirp request, failing over to alternative regions on retryable
     * errors. On any transport error or HTTP 5xx it discovers regions via
     * /settings/regions and replays the request — body and headers intact —
     * against the next untried region, with exponential backoff. A 4xx is
     * returned immediately.
     */
    request(service: string, method: string, data: any, // eslint-disable-line @typescript-eslint/no-explicit-any
    headers: any, // eslint-disable-line @typescript-eslint/no-explicit-any
    timeout?: number): Promise<any>;
}

export { REQUEST_ID_HEADER, type Rpc, ServerError, SipCallError, TwirpError, TwirpRpc, livekitPackage };
