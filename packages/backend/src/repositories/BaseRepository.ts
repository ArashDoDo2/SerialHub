import { Database } from 'better-sqlite3';
import { getDatabase } from '../config/database.js';

export abstract class BaseRepository {
  protected get db(): Database {
    return getDatabase();
  }

  protected prepare(sql: string): any {
    return this.db.prepare(sql);
  }

  protected transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }
}