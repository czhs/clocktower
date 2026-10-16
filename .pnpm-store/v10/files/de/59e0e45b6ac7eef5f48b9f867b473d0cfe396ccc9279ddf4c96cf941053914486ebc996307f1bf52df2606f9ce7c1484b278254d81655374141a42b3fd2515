import { neon, Pool, types } from "@neondatabase/serverless";
import { getDatabase } from "@netlify/db";
import { entityKind } from "../entity.js";
import { DefaultLogger } from "../logger.js";
import { drizzle as drizzleNodePg } from "../node-postgres/driver.js";
import { PgDatabase } from "../pg-core/db.js";
import { PgDialect } from "../pg-core/dialect.js";
import * as V1 from "../relations.js";
import { isConfig } from "../utils.js";
import { NetlifyDbSession } from "./session.js";
class NetlifyDbDriver {
  constructor(httpClient, pool, dialect, options = {}) {
    this.httpClient = httpClient;
    this.pool = pool;
    this.dialect = dialect;
    this.options = options;
    this.initMappers();
  }
  static [entityKind] = "NetlifyDbDriver";
  createSession(schema) {
    return new NetlifyDbSession(this.httpClient, this.pool, this.dialect, schema, {
      logger: this.options.logger,
      cache: this.options.cache
    });
  }
  initMappers() {
    types.setTypeParser(types.builtins.TIMESTAMPTZ, (val) => val);
    types.setTypeParser(types.builtins.TIMESTAMP, (val) => val);
    types.setTypeParser(types.builtins.DATE, (val) => val);
    types.setTypeParser(types.builtins.INTERVAL, (val) => val);
    types.setTypeParser(1231, (val) => val);
    types.setTypeParser(1115, (val) => val);
    types.setTypeParser(1185, (val) => val);
    types.setTypeParser(1187, (val) => val);
    types.setTypeParser(1182, (val) => val);
  }
}
class NetlifyDbDatabase extends PgDatabase {
  static [entityKind] = "NetlifyDbDatabase";
  async batch(batch) {
    return this.session.batch(
      batch
    );
  }
}
function construct(httpClient, pool, config = {}) {
  const dialect = new PgDialect({ casing: config.casing });
  let logger;
  if (config.logger === true) {
    logger = new DefaultLogger();
  } else if (config.logger !== false) {
    logger = config.logger;
  }
  let schema;
  if (config.schema) {
    const tablesConfig = V1.extractTablesRelationalConfig(
      config.schema,
      V1.createTableRelationsHelpers
    );
    schema = {
      fullSchema: config.schema,
      schema: tablesConfig.tables,
      tableNamesMap: tablesConfig.tableNamesMap
    };
  }
  const driver = new NetlifyDbDriver(httpClient, pool, dialect, { logger, cache: config.cache });
  const session = driver.createSession(schema);
  const db = new NetlifyDbDatabase(
    dialect,
    session,
    schema
  );
  db.$client = { http: httpClient, pool };
  db.$cache = config.cache;
  if (db.$cache) {
    db.$cache["invalidate"] = config.cache?.onMutate;
  }
  return db;
}
function drizzle(...params) {
  if (params.length === 0 || params.length === 1 && isConfig(params[0]) && !("connection" in params[0]) && !("client" in params[0])) {
    const drizzleConfig = params[0] ?? {};
    const connection = getDatabase();
    if (connection.driver === "server") {
      return drizzleNodePg({ client: connection.pool, ...drizzleConfig });
    }
    return construct(connection.httpClient, connection.pool, drizzleConfig);
  }
  if (typeof params[0] === "string") {
    const connectionString = params[0];
    const httpClient = neon(connectionString);
    const pool = new Pool({ connectionString });
    return construct(httpClient, pool, params[1]);
  }
  if (isConfig(params[0])) {
    const { connection, client, ...drizzleConfig } = params[0];
    if (client) {
      if ("driver" in client) {
        if (client.driver === "serverless") {
          return construct(client.httpClient, client.pool, drizzleConfig);
        }
        return drizzleNodePg({ client: client.pool, ...drizzleConfig });
      }
      return construct(client.http, client.pool, drizzleConfig);
    }
    const connectionString = typeof connection === "string" ? connection : connection.connectionString;
    const httpClient = neon(connectionString);
    const pool = new Pool({ connectionString });
    return construct(httpClient, pool, drizzleConfig);
  }
  throw new Error("Invalid arguments. Expected a connection string or a config object.");
}
((drizzle2) => {
  function mock(config) {
    return construct({}, {}, config);
  }
  drizzle2.mock = mock;
})(drizzle || (drizzle = {}));
export {
  NetlifyDbDatabase,
  NetlifyDbDriver,
  drizzle
};
//# sourceMappingURL=driver.js.map