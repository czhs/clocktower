import { VideoGrant, SIPGrant } from './grants.cjs';
import '@livekit/protocol';
import 'jose';

/**
 * Authentication options for a service client.
 */
interface ServiceBaseOptions {
    /** API Key. */
    apiKey?: string;
    /** API Secret. */
    secret?: string;
    /** Token TTL. Defaults to `10m`. */
    ttl?: string;
    /** Pre-signed token; sent verbatim, skipping per-call signing. */
    token?: string;
}
/**
 * Utilities to handle authentication
 */
declare class ServiceBase {
    private readonly apiKey?;
    private readonly secret?;
    private readonly token?;
    private readonly ttl;
    /**
     * @param options - authentication options
     */
    constructor(options?: ServiceBaseOptions);
    /**
     * @deprecated pass a {@link ServiceBaseOptions} object instead.
     * @param apiKey - API Key.
     * @param secret - API Secret.
     * @param ttl - token TTL
     */
    constructor(apiKey?: string, secret?: string, ttl?: string);
    authHeader(grant: VideoGrant, sip?: SIPGrant): Promise<Record<string, string>>;
}

export { ServiceBase, type ServiceBaseOptions };
