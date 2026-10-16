import type { MigrationConfig } from "../migrator.js";
import { NodePgDatabase } from "../node-postgres/driver.js";
import type { NetlifyDbDatabase } from "./driver.js";
export declare function migrate<TSchema extends Record<string, unknown>>(db: NetlifyDbDatabase<TSchema> | NodePgDatabase<TSchema>, config: MigrationConfig): Promise<void>;
