import type { MigrationConfig } from "../migrator.cjs";
import { NodePgDatabase } from "../node-postgres/driver.cjs";
import type { NetlifyDbDatabase } from "./driver.cjs";
export declare function migrate<TSchema extends Record<string, unknown>>(db: NetlifyDbDatabase<TSchema> | NodePgDatabase<TSchema>, config: MigrationConfig): Promise<void>;
