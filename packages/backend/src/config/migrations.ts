import fs from 'fs';
import path from 'path';
import { getDatabase } from './database.js';
import { logger } from './logger.js';

const MIGRATIONS_DIR = path.join(__dirname, '../migrations');

function handleNodeConnectionTypeMigration(db: ReturnType<typeof getDatabase>): void {
  const columns = db.prepare(`PRAGMA table_info(serialNodes)`).all() as Array<{ name: string }>;
  const hasConnectionType = columns.some((column) => column.name === 'connectionType');

  if (!hasConnectionType) {
    db.exec(
      `ALTER TABLE serialNodes
       ADD COLUMN connectionType TEXT NOT NULL DEFAULT 'raw-tcp'
       CHECK (connectionType IN ('raw-tcp', 'rfc2217'))`
    );
  }

  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_serialNodes_connectionType
     ON serialNodes(connectionType)`
  );
}

function hasColumn(db: ReturnType<typeof getDatabase>, table: string, column: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return columns.some((entry) => entry.name === column);
}

function hasTable(db: ReturnType<typeof getDatabase>, table: string): boolean {
  const result = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(table) as { name: string } | undefined;
  return Boolean(result);
}

function handleMultiTenantOwnershipMigration(db: ReturnType<typeof getDatabase>): void {
  if (!hasColumn(db, 'deviceProfiles', 'ownerUserId')) {
    db.exec(`ALTER TABLE deviceProfiles ADD COLUMN ownerUserId INTEGER`);
  }
  db.exec(`
    UPDATE deviceProfiles
    SET ownerUserId = COALESCE(
      ownerUserId,
      (SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1),
      (SELECT id FROM users ORDER BY id LIMIT 1)
    )
    WHERE ownerUserId IS NULL
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_deviceProfiles_ownerUserId ON deviceProfiles(ownerUserId)`);

  if (!hasColumn(db, 'serialNodes', 'ownerUserId')) {
    db.exec(`ALTER TABLE serialNodes ADD COLUMN ownerUserId INTEGER`);
  }
  const serialNodeOwnerSource = hasColumn(db, 'serialNodes', 'createdByUserId') ? 'createdByUserId' : 'ownerUserId';
  db.exec(`
    UPDATE serialNodes
    SET ownerUserId = COALESCE(ownerUserId, ${serialNodeOwnerSource})
    WHERE ownerUserId IS NULL
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_serialNodes_ownerUserId ON serialNodes(ownerUserId)`);

  if (!hasColumn(db, 'scriptRuns', 'ownerUserId')) {
    db.exec(`ALTER TABLE scriptRuns ADD COLUMN ownerUserId INTEGER`);
  }
  db.exec(`
    UPDATE scriptRuns
    SET ownerUserId = COALESCE(
      ownerUserId,
      (SELECT ownerUserId FROM scripts WHERE scripts.id = scriptRuns.scriptId)
    )
    WHERE ownerUserId IS NULL
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_scriptRuns_ownerUserId ON scriptRuns(ownerUserId)`);

  if (hasColumn(db, 'testRuns', 'ownerUserId') === false) {
    db.exec(`ALTER TABLE testRuns ADD COLUMN ownerUserId INTEGER`);
  }
  db.exec(`
    UPDATE testRuns
    SET ownerUserId = COALESCE(
      ownerUserId,
      (SELECT ownerUserId FROM serialNodes WHERE serialNodes.id = testRuns.nodeId),
      runByUserId
    )
    WHERE ownerUserId IS NULL
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_testRuns_ownerUserId ON testRuns(ownerUserId)`);
}

function handleTerminalSocketBindingMigration(db: ReturnType<typeof getDatabase>): void {
  if (!hasTable(db, 'terminalSessions')) {
    return;
  }
  if (!hasColumn(db, 'terminalSessions', 'controllingSocketId')) {
    db.exec(`ALTER TABLE terminalSessions ADD COLUMN controllingSocketId TEXT`);
  }
}

export function runMigrations(): void {
  const db = getDatabase();

  // Create migrations table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      executed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Get executed migrations
  const executedMigrations = db.prepare('SELECT name FROM migrations').all() as { name: string }[];
  const executedNames = new Set(executedMigrations.map(m => m.name));

  // Self-heal security/schema drifts on existing databases where an older migration
  // entry may already be marked executed but the column was never created.
  handleTerminalSocketBindingMigration(db);

  // Get migration files
  const migrationFiles = fs.readdirSync(MIGRATIONS_DIR)
    .filter(file => file.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    if (!executedNames.has(file)) {
      logger.info(`Running migration: ${file}`);
      const transaction = db.transaction(() => {
        if (file === '004_node_connection_types.sql') {
          handleNodeConnectionTypeMigration(db);
        } else if (file === '008_multi_tenant_ownership.sql') {
          handleMultiTenantOwnershipMigration(db);
        } else if (file === '009_terminal_socket_binding.sql') {
          handleTerminalSocketBindingMigration(db);
        } else {
          const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
          db.exec(sql);
        }
        db.prepare('INSERT INTO migrations (name) VALUES (?)').run(file);
      });

      transaction();
      logger.info(`Migration ${file} completed`);
    }
  }

  logger.info('All migrations executed');
}
