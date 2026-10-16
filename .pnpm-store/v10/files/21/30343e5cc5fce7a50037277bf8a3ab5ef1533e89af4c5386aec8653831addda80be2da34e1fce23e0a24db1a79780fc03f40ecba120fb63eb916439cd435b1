import { neonConfig } from "@neondatabase/serverless";
import { NoopCache } from "../cache/core/cache.js";
import { entityKind } from "../entity.js";
import { NoopLogger } from "../logger.js";
import { NeonHttpPreparedQuery } from "../neon-http/session.js";
import { NeonPreparedQuery } from "../neon-serverless/session.js";
import {
  PgSession,
  PgTransaction
} from "../pg-core/session.js";
import { sql } from "../sql/sql.js";
function ensureWebSocket() {
  if (neonConfig.webSocketConstructor) return;
  if (typeof WebSocket !== "undefined") {
    neonConfig.webSocketConstructor = WebSocket;
  }
}
const queryConfig = {
  arrayMode: true,
  fullResults: true
};
class NetlifyDbSession extends PgSession {
  constructor(httpClient, pool, dialect, schema, options = {}) {
    super(dialect);
    this.httpClient = httpClient;
    this.pool = pool;
    this.schema = schema;
    this.options = options;
    this.clientQuery = httpClient.query ?? httpClient;
    this.logger = options.logger ?? new NoopLogger();
    this.cache = options.cache ?? new NoopCache();
  }
  static [entityKind] = "NetlifyDbSession";
  clientQuery;
  logger;
  cache;
  prepareQuery(query, fields, name, isResponseInArrayMode, customResultMapper, queryMetadata, cacheConfig) {
    return new NeonHttpPreparedQuery(
      this.httpClient,
      query,
      this.logger,
      this.cache,
      queryMetadata,
      cacheConfig,
      fields,
      isResponseInArrayMode,
      customResultMapper
    );
  }
  async batch(queries) {
    const preparedQueries = [];
    const builtQueries = [];
    for (const query of queries) {
      const preparedQuery = query._prepare();
      const builtQuery = preparedQuery.getQuery();
      preparedQueries.push(preparedQuery);
      builtQueries.push(
        this.clientQuery(builtQuery.sql, builtQuery.params, {
          fullResults: true,
          arrayMode: preparedQuery.isResponseInArrayMode()
        })
      );
    }
    const batchResults = await this.httpClient.transaction(builtQueries, queryConfig);
    return batchResults.map((result, i) => preparedQueries[i].mapResult(result, true));
  }
  async query(query, params) {
    this.logger.logQuery(query, params);
    const result = await this.clientQuery(query, params, { arrayMode: true, fullResults: true });
    return result;
  }
  async queryObjects(query, params) {
    return this.clientQuery(query, params, { arrayMode: false, fullResults: true });
  }
  async count(sql2) {
    const res = await this.execute(sql2);
    return Number(
      res["rows"][0]["count"]
    );
  }
  async transaction(transaction, config = {}) {
    ensureWebSocket();
    const poolClient = await this.pool.connect();
    const session = new NetlifyDbWsSession(
      poolClient,
      this.dialect,
      this.schema,
      this.options
    );
    const tx = new NetlifyDbTransaction(
      this.dialect,
      session,
      this.schema
    );
    await tx.execute(sql`begin ${tx.getTransactionConfigSQL(config)}`);
    try {
      const result = await transaction(tx);
      await tx.execute(sql`commit`);
      return result;
    } catch (error) {
      await tx.execute(sql`rollback`);
      throw error;
    } finally {
      poolClient.release();
    }
  }
}
class NetlifyDbWsSession extends PgSession {
  constructor(client, dialect, schema, options = {}) {
    super(dialect);
    this.client = client;
    this.schema = schema;
    this.logger = options.logger ?? new NoopLogger();
    this.cache = options.cache ?? new NoopCache();
  }
  static [entityKind] = "NetlifyDbWsSession";
  logger;
  cache;
  prepareQuery(query, fields, name, isResponseInArrayMode, customResultMapper, queryMetadata, cacheConfig) {
    return new NeonPreparedQuery(
      this.client,
      query.sql,
      query.params,
      this.logger,
      this.cache,
      queryMetadata,
      cacheConfig,
      fields,
      name,
      isResponseInArrayMode,
      customResultMapper
    );
  }
  async count(sql2) {
    const res = await this.execute(sql2);
    return Number(
      res["rows"][0]["count"]
    );
  }
  async query(query, params) {
    this.logger.logQuery(query, params);
    const result = await this.client.query({
      rowMode: "array",
      text: query,
      values: params
    });
    return result;
  }
  async queryObjects(query, params) {
    return this.client.query(query, params);
  }
  async transaction(_transaction, _config) {
    throw new Error("Nested transactions are handled by NetlifyDbTransaction via savepoints");
  }
}
class NetlifyDbTransaction extends PgTransaction {
  static [entityKind] = "NetlifyDbTransaction";
  async transaction(transaction) {
    const savepointName = `sp${this.nestedIndex + 1}`;
    const tx = new NetlifyDbTransaction(
      this.dialect,
      this.session,
      this.schema,
      this.nestedIndex + 1
    );
    await tx.execute(sql.raw(`savepoint ${savepointName}`));
    try {
      const result = await transaction(tx);
      await tx.execute(sql.raw(`release savepoint ${savepointName}`));
      return result;
    } catch (e) {
      await tx.execute(sql.raw(`rollback to savepoint ${savepointName}`));
      throw e;
    }
  }
}
export {
  NetlifyDbSession,
  NetlifyDbTransaction,
  NetlifyDbWsSession
};
//# sourceMappingURL=session.js.map