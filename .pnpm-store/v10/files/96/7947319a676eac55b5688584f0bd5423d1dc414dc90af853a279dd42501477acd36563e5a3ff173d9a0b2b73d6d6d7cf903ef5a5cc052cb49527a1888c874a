"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var driver_exports = {};
__export(driver_exports, {
  NetlifyDbDatabase: () => NetlifyDbDatabase,
  NetlifyDbDriver: () => NetlifyDbDriver,
  drizzle: () => drizzle
});
module.exports = __toCommonJS(driver_exports);
var import_serverless = require("@neondatabase/serverless");
var import_db = require("@netlify/db");
var import_entity = require("../entity.cjs");
var import_logger = require("../logger.cjs");
var import_driver = require("../node-postgres/driver.cjs");
var import_db2 = require("../pg-core/db.cjs");
var import_dialect = require("../pg-core/dialect.cjs");
var V1 = __toESM(require("../relations.cjs"), 1);
var import_utils = require("../utils.cjs");
var import_session = require("./session.cjs");
class NetlifyDbDriver {
  constructor(httpClient, pool, dialect, options = {}) {
    this.httpClient = httpClient;
    this.pool = pool;
    this.dialect = dialect;
    this.options = options;
    this.initMappers();
  }
  static [import_entity.entityKind] = "NetlifyDbDriver";
  createSession(schema) {
    return new import_session.NetlifyDbSession(this.httpClient, this.pool, this.dialect, schema, {
      logger: this.options.logger,
      cache: this.options.cache
    });
  }
  initMappers() {
    import_serverless.types.setTypeParser(import_serverless.types.builtins.TIMESTAMPTZ, (val) => val);
    import_serverless.types.setTypeParser(import_serverless.types.builtins.TIMESTAMP, (val) => val);
    import_serverless.types.setTypeParser(import_serverless.types.builtins.DATE, (val) => val);
    import_serverless.types.setTypeParser(import_serverless.types.builtins.INTERVAL, (val) => val);
    import_serverless.types.setTypeParser(1231, (val) => val);
    import_serverless.types.setTypeParser(1115, (val) => val);
    import_serverless.types.setTypeParser(1185, (val) => val);
    import_serverless.types.setTypeParser(1187, (val) => val);
    import_serverless.types.setTypeParser(1182, (val) => val);
  }
}
class NetlifyDbDatabase extends import_db2.PgDatabase {
  static [import_entity.entityKind] = "NetlifyDbDatabase";
  async batch(batch) {
    return this.session.batch(
      batch
    );
  }
}
function construct(httpClient, pool, config = {}) {
  const dialect = new import_dialect.PgDialect({ casing: config.casing });
  let logger;
  if (config.logger === true) {
    logger = new import_logger.DefaultLogger();
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
  if (params.length === 0 || params.length === 1 && (0, import_utils.isConfig)(params[0]) && !("connection" in params[0]) && !("client" in params[0])) {
    const drizzleConfig = params[0] ?? {};
    const connection = (0, import_db.getDatabase)();
    if (connection.driver === "server") {
      return (0, import_driver.drizzle)({ client: connection.pool, ...drizzleConfig });
    }
    return construct(connection.httpClient, connection.pool, drizzleConfig);
  }
  if (typeof params[0] === "string") {
    const connectionString = params[0];
    const httpClient = (0, import_serverless.neon)(connectionString);
    const pool = new import_serverless.Pool({ connectionString });
    return construct(httpClient, pool, params[1]);
  }
  if ((0, import_utils.isConfig)(params[0])) {
    const { connection, client, ...drizzleConfig } = params[0];
    if (client) {
      if ("driver" in client) {
        if (client.driver === "serverless") {
          return construct(client.httpClient, client.pool, drizzleConfig);
        }
        return (0, import_driver.drizzle)({ client: client.pool, ...drizzleConfig });
      }
      return construct(client.http, client.pool, drizzleConfig);
    }
    const connectionString = typeof connection === "string" ? connection : connection.connectionString;
    const httpClient = (0, import_serverless.neon)(connectionString);
    const pool = new import_serverless.Pool({ connectionString });
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  NetlifyDbDatabase,
  NetlifyDbDriver,
  drizzle
});
//# sourceMappingURL=driver.cjs.map