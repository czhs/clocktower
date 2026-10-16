import type { FullQueryResults, Pool, PoolClient, QueryResult, QueryResultRow } from '@neondatabase/serverless';
import type { BatchItem } from "../batch.cjs";
import type { WithCacheConfig } from "../cache/core/types.cjs";
import { entityKind } from "../entity.cjs";
import type { NeonHttpClient, NeonHttpQueryResultHKT, NeonHttpSessionOptions } from "../neon-http/session.cjs";
import type { PgDialect } from "../pg-core/dialect.cjs";
import type { SelectedFieldsOrdered } from "../pg-core/query-builders/select.types.cjs";
import { type PgPreparedQuery, PgSession, PgTransaction, type PgTransactionConfig, type PreparedQueryConfig } from "../pg-core/session.cjs";
import type * as V1 from "../relations.cjs";
import { type Query, type SQL } from "../sql/sql.cjs";
export type NetlifyDbClient = {
    http: NeonHttpClient;
    pool: Pool;
};
export declare class NetlifyDbSession<TFullSchema extends Record<string, unknown>, TSchema extends V1.TablesRelationalConfig> extends PgSession<NeonHttpQueryResultHKT, TFullSchema, TSchema> {
    private httpClient;
    private pool;
    private schema;
    private options;
    static readonly [entityKind]: string;
    private clientQuery;
    private logger;
    private cache;
    constructor(httpClient: NeonHttpClient, pool: Pool, dialect: PgDialect, schema: V1.RelationalSchemaConfig<TSchema> | undefined, options?: NeonHttpSessionOptions);
    prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(query: Query, fields: SelectedFieldsOrdered | undefined, name: string | undefined, isResponseInArrayMode: boolean, customResultMapper?: (rows: unknown[][]) => T['execute'], queryMetadata?: {
        type: 'select' | 'update' | 'delete' | 'insert';
        tables: string[];
    }, cacheConfig?: WithCacheConfig): PgPreparedQuery<T>;
    batch<U extends BatchItem<'pg'>, T extends Readonly<[U, ...U[]]>>(queries: T): Promise<any>;
    query(query: string, params: unknown[]): Promise<FullQueryResults<true>>;
    queryObjects(query: string, params: unknown[]): Promise<FullQueryResults<false>>;
    count(sql: SQL): Promise<number>;
    transaction<T>(transaction: (tx: NetlifyDbTransaction<TFullSchema, TSchema>) => Promise<T>, config?: PgTransactionConfig): Promise<T>;
}
/**
 * Internal WebSocket-based session used only within transactions.
 * Delegates all queries to a PoolClient over WebSocket, using
 * NeonPreparedQuery from the neon-serverless adapter.
 */
export declare class NetlifyDbWsSession<TFullSchema extends Record<string, unknown>, TSchema extends V1.TablesRelationalConfig> extends PgSession<NeonHttpQueryResultHKT, TFullSchema, TSchema> {
    private client;
    private schema;
    static readonly [entityKind]: string;
    private logger;
    private cache;
    constructor(client: PoolClient, dialect: PgDialect, schema: V1.RelationalSchemaConfig<TSchema> | undefined, options?: NeonHttpSessionOptions);
    prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(query: Query, fields: SelectedFieldsOrdered | undefined, name: string | undefined, isResponseInArrayMode: boolean, customResultMapper?: (rows: unknown[][]) => T['execute'], queryMetadata?: {
        type: 'select' | 'update' | 'delete' | 'insert';
        tables: string[];
    }, cacheConfig?: WithCacheConfig): PgPreparedQuery<T>;
    count(sql: SQL): Promise<number>;
    query(query: string, params: unknown[]): Promise<QueryResult>;
    queryObjects<T extends QueryResultRow>(query: string, params: unknown[]): Promise<QueryResult<T>>;
    transaction<T>(_transaction: (tx: NetlifyDbTransaction<TFullSchema, TSchema>) => Promise<T>, _config?: PgTransactionConfig): Promise<T>;
}
export declare class NetlifyDbTransaction<TFullSchema extends Record<string, unknown>, TSchema extends V1.TablesRelationalConfig> extends PgTransaction<NeonHttpQueryResultHKT, TFullSchema, TSchema> {
    static readonly [entityKind]: string;
    transaction<T>(transaction: (tx: NetlifyDbTransaction<TFullSchema, TSchema>) => Promise<T>): Promise<T>;
}
