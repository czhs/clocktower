import { Pool } from '@neondatabase/serverless';
import type { BatchItem, BatchResponse } from "../batch.js";
import type { Cache } from "../cache/core/cache.js";
import { entityKind } from "../entity.js";
import type { Logger } from "../logger.js";
import type { NeonHttpClient, NeonHttpQueryResultHKT } from "../neon-http/session.js";
import { type NodePgDatabase } from "../node-postgres/driver.js";
import type { NodePgClient } from "../node-postgres/session.js";
import { PgDatabase } from "../pg-core/db.js";
import { PgDialect } from "../pg-core/dialect.js";
import * as V1 from "../relations.js";
import { type DrizzleConfig } from "../utils.js";
import { type NetlifyDbClient, NetlifyDbSession } from "./session.js";
export interface ServerlessDrizzleClient {
    driver: 'serverless';
    httpClient: NeonHttpClient;
    pool: Pool;
    connectionString: string;
}
export interface ServerDrizzleClient {
    driver: 'server';
    pool: NodePgClient;
    connectionString: string;
}
export type DrizzleClient = ServerlessDrizzleClient | ServerDrizzleClient;
export interface NetlifyDbDriverOptions {
    logger?: Logger;
    cache?: Cache;
}
export declare class NetlifyDbDriver {
    private httpClient;
    private pool;
    private dialect;
    private options;
    static readonly [entityKind]: string;
    constructor(httpClient: NeonHttpClient, pool: Pool, dialect: PgDialect, options?: NetlifyDbDriverOptions);
    createSession(schema: V1.RelationalSchemaConfig<V1.TablesRelationalConfig> | undefined): NetlifyDbSession<Record<string, unknown>, V1.TablesRelationalConfig>;
    initMappers(): void;
}
export declare class NetlifyDbDatabase<TSchema extends Record<string, unknown> = Record<string, never>> extends PgDatabase<NeonHttpQueryResultHKT, TSchema> {
    static readonly [entityKind]: string;
    batch<U extends BatchItem<'pg'>, T extends Readonly<[U, ...U[]]>>(batch: T): Promise<BatchResponse<T>>;
}
export declare function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(): (NetlifyDbDatabase<TSchema> & {
    $client: NetlifyDbClient;
}) | (NodePgDatabase<TSchema> & {
    $client: NodePgClient;
});
export declare function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(config: DrizzleConfig<TSchema>): (NetlifyDbDatabase<TSchema> & {
    $client: NetlifyDbClient;
}) | (NodePgDatabase<TSchema> & {
    $client: NodePgClient;
});
export declare function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(config: DrizzleConfig<TSchema> & {
    client: ServerlessDrizzleClient;
}): NetlifyDbDatabase<TSchema> & {
    $client: NetlifyDbClient;
};
export declare function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(config: DrizzleConfig<TSchema> & {
    client: ServerDrizzleClient;
}): NodePgDatabase<TSchema> & {
    $client: NodePgClient;
};
export declare function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(config: DrizzleConfig<TSchema> & {
    client: DrizzleClient;
}): (NetlifyDbDatabase<TSchema> & {
    $client: NetlifyDbClient;
}) | (NodePgDatabase<TSchema> & {
    $client: NodePgClient;
});
export declare function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(...params: [
    string
] | [
    string,
    DrizzleConfig<TSchema>
] | [
    (DrizzleConfig<TSchema> & ({
        connection: string | {
            connectionString: string;
        };
    } | {
        client: NetlifyDbClient | DrizzleClient;
    }))
]): NetlifyDbDatabase<TSchema> & {
    $client: NetlifyDbClient;
};
export declare namespace drizzle {
    function mock<TSchema extends Record<string, unknown> = Record<string, never>>(config?: DrizzleConfig<TSchema>): NetlifyDbDatabase<TSchema> & {
        $client: '$client is not available on drizzle.mock()';
    };
}
