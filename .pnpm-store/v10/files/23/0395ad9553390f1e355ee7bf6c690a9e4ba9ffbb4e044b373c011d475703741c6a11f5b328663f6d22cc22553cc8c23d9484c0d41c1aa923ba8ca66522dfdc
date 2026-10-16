/**
 * Options common to all clients
 */
type ClientOptions = {
    /**
     * Optional timeout, in seconds, for all server requests
     */
    requestTimeout?: number;
    /**
     * Whether to fail over to alternative regions on retryable errors (LiveKit
     * Cloud hosts only). Defaults to true; set to false to disable.
     */
    failover?: boolean;
    /**
     * A pre-signed access token, sent verbatim as the Authorization header on
     * every request instead of signing one per call from an API key and secret.
     * The token must already carry the grants for the calls it's used with; since
     * it needs no secret, the client can run client-side.
     */
    token?: string;
};

export type { ClientOptions };
