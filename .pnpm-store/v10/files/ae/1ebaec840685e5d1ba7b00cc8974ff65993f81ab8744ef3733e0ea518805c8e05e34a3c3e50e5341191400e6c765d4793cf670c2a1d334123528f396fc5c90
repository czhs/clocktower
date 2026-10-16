"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var session_exports = {};
__export(session_exports, {
  NetlifyDbSession: () => NetlifyDbSession,
  NetlifyDbTransaction: () => NetlifyDbTransaction,
  NetlifyDbWsSession: () => NetlifyDbWsSession
});
module.exports = __toCommonJS(session_exports);
var import_serverless = require("@neondatabase/serverless");
var import_cache = require("../cache/core/cache.cjs");
var import_entity = require("../entity.cjs");
var import_logger = require("../logger.cjs");
var import_session = require("../neon-http/session.cjs");
var import_session2 = require("../neon-serverless/session.cjs");
var import_session3 = require("../pg-core/session.cjs");
var import_sql = require("../sql/sql.cjs");
function ensureWebSocket() {
  if (import_serverless.neonConfig.webSocketConstructor) return;
  if (typeof WebSocket !== "undefined") {
    import_serverless.neonConfig.webSocketConstructor = WebSocket;
  }
}
const queryConfig = {
  arrayMode: true,
  fullResults: true
};
class NetlifyDbSession extends import_session3.PgSession {
  constructor(httpClient, pool, dialect, schema, options = {}) {
    super(dialect);
    this.httpClient = httpClient;
    this.pool = pool;
    this.schema = schema;
    this.options = options;
    this.clientQuery = httpClient.query ?? httpClient;
    this.logger = options.logger ?? new import_logger.NoopLogger();
    this.cache = options.cache ?? new import_cache.NoopCache();
  }
  static [import_entity.entityKind] = "NetlifyDbSession";
  clientQuery;
  logger;
  cache;
  prepareQuery(query, fields, name, isResponseInArrayMode, customResultMapper, queryMetadata, cacheConfig) {
    return new import_session.NeonHttpPreparedQuery(
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
    await tx.execute(import_sql.sql`begin ${tx.getTransactionConfigSQL(config)}`);
    try {
      const result = await transaction(tx);
      await tx.execute(import_sql.sql`commit`);
      return result;
    } catch (error) {
      await tx.execute(import_sql.sql`rollback`);
      throw error;
    } finally {
      poolClient.release();
    }
  }
}
class NetlifyDbWsSession extends import_session3.PgSession {
  constructor(client, dialect, schema, options = {}) {
    super(dialect);
    this.client = client;
    this.schema = schema;
    this.logger = options.logger ?? new import_logger.NoopLogger();
    this.cache = options.cache ?? new import_cache.NoopCache();
  }
  static [import_entity.entityKind] = "NetlifyDbWsSession";
  logger;
  cache;
  prepareQuery(query, fields, name, isResponseInArrayMode, customResultMapper, queryMetadata, cacheConfig) {
    return new import_session2.NeonPreparedQuery(
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
class NetlifyDbTransaction extends import_session3.PgTransaction {
  static [import_entity.entityKind] = "NetlifyDbTransaction";
  async transaction(transaction) {
    const savepointName = `sp${this.nestedIndex + 1}`;
    const tx = new NetlifyDbTransaction(
      this.dialect,
      this.session,
      this.schema,
      this.nestedIndex + 1
    );
    await tx.execute(import_sql.sql.raw(`savepoint ${savepointName}`));
    try {
      const result = await transaction(tx);
      await tx.execute(import_sql.sql.raw(`release savepoint ${savepointName}`));
      return result;
    } catch (e) {
      await tx.execute(import_sql.sql.raw(`rollback to savepoint ${savepointName}`));
      throw e;
    }
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  NetlifyDbSession,
  NetlifyDbTransaction,
  NetlifyDbWsSession
});
//# sourceMappingURL=session.cjs.map