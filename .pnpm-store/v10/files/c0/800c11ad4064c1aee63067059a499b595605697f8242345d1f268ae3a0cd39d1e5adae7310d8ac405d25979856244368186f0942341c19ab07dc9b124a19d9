import { is } from "../entity.js";
import { readMigrationFiles } from "../migrator.js";
import { migrate as nodePgMigrate } from "../node-postgres/migrator.js";
import { NodePgDatabase } from "../node-postgres/driver.js";
async function migrate(db, config) {
  if (is(db, NodePgDatabase)) {
    return nodePgMigrate(db, config);
  }
  const migrations = readMigrationFiles(config);
  return db.dialect.migrate(migrations, db.session, config);
}
export {
  migrate
};
//# sourceMappingURL=migrator.js.map