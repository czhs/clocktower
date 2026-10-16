import { TokenSourceResponse } from '@livekit/protocol';
import type { TokenSourceFetchOptions, TokenSourceResponseObject } from './types';
import { TokenSourceConfigurable, TokenSourceFixed } from './types';
import { areTokenSourceFetchOptionsEqual, decodeTokenPayload } from './utils';
/** A TokenSourceCached is a TokenSource which caches the last {@link TokenSourceResponseObject} value and returns it
 * until a) it expires or b) the {@link TokenSourceFetchOptions} provided to .fetch(...) change. */
declare abstract class TokenSourceCached extends TokenSourceConfigurable {
    private cachedFetchOptions;
    private cachedResponse;
    private fetchMutex;
    private isSameAsCachedFetchOptions;
    private shouldReturnCachedValueFromFetch;
    getCachedResponseJwtPayload(): import("./types").TokenPayload | null;
    fetch(options: TokenSourceFetchOptions, force?: boolean): Promise<TokenSourceResponseObject>;
    protected abstract update(options: TokenSourceFetchOptions): Promise<TokenSourceResponse>;
}
type LiteralOrFn = TokenSourceResponseObject | (() => TokenSourceResponseObject | Promise<TokenSourceResponseObject>);
declare class TokenSourceLiteral extends TokenSourceFixed {
    private literalOrFn;
    constructor(literalOrFn: LiteralOrFn);
    fetch(): Promise<TokenSourceResponseObject>;
}
type CustomFn = (options: TokenSourceFetchOptions) => TokenSourceResponseObject | Promise<TokenSourceResponseObject>;
declare class TokenSourceCustom extends TokenSourceCached {
    private customFn;
    constructor(customFn: CustomFn);
    protected update(options: TokenSourceFetchOptions): Promise<TokenSourceResponse>;
}
export type EndpointOptions = Omit<RequestInit, 'body'>;
declare class TokenSourceEndpoint extends TokenSourceCached {
    private url;
    private endpointOptions;
    constructor(url: string, options?: EndpointOptions);
    private createRequestFromOptions;
    protected update(options: TokenSourceFetchOptions): Promise<TokenSourceResponse>;
}
export type DevelopmentTokenServerOptions = {
    baseUrl?: string;
};
declare class TokenSourceDevelopmentTokenServer extends TokenSourceEndpoint {
    constructor(tokenServerId: string, options: DevelopmentTokenServerOptions);
}
/** @deprecated use {@link DevelopmentTokenServerOptions} instead */
export type SandboxTokenServerOptions = DevelopmentTokenServerOptions;
/** @deprecated Use {@link TokenSourceDevelopmentTokenServer} instead */
declare class TokenSourceSandboxTokenServer extends TokenSourceDevelopmentTokenServer {
}
export type { TokenSourceLiteral, TokenSourceCustom, TokenSourceEndpoint, TokenSourceSandboxTokenServer, TokenSourceDevelopmentTokenServer };
export { decodeTokenPayload, areTokenSourceFetchOptionsEqual };
export declare const TokenSource: {
    /** TokenSource.literal contains a single, literal set of {@link TokenSourceResponseObject}
     * credentials, either provided directly or returned from a provided function. */
    literal(literalOrFn: LiteralOrFn): TokenSourceLiteral;
    /**
     * TokenSource.custom allows a user to define a manual function which generates new
     * {@link TokenSourceResponseObject} values on demand.
     *
     * Use this to get credentials from custom backends / etc.
     */
    custom(customFn: CustomFn): TokenSourceCustom;
    /**
     * TokenSource.endpoint creates a token source that fetches credentials from a given URL using
     * the standard endpoint format:
     * @see https://docs.livekit.io/frontends/build/authentication/endpoint/
     */
    endpoint(url: string, options?: EndpointOptions): TokenSourceEndpoint;
    /**
     * @deprecated Use {@link TokenSource.developmentTokenServer} instead
     */
    sandboxTokenServer(sandboxId: string, options?: SandboxTokenServerOptions): TokenSourceSandboxTokenServer;
    /**
     * TokenSource.developmentTokenServer queries a development token server for credentials,
     * which supports quick prototyping / getting started types of use cases.
     *
     * This token provider is INSECURE and should NOT be used in production.
     *
     * For more info:
     * @see https://docs.livekit.io/frontends/build/authentication/sandbox-token-server/
     */
    developmentTokenServer(tokenServerId: string, options?: DevelopmentTokenServerOptions): TokenSourceDevelopmentTokenServer;
};
//# sourceMappingURL=TokenSource.d.ts.map
