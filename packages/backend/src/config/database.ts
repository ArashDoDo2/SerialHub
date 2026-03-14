import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from './env.js';
import { logger } from './logger.js';

let db: Database.Database;

export function initDatabase(): Database.Database {
  const dbPath = path.resolve(config.database.path);
  const dbDir = path.dirname(dbPath);

  // Ensure directory exists
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(dbPath);

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL');

  logger.info(`Database initialized at ${dbPath}`);

  return db;
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    logger.info('Database connection closed');
  }
}