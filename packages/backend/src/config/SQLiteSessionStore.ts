import session from 'express-session';
import { getDatabase } from './database.js';

interface SessionRow {
  sid: string;
  sess: string;
  expire: string;
}

export class SQLiteSessionStore extends session.Store {
  constructor() {
    super();
    const db = getDatabase();
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid TEXT PRIMARY KEY,
        sess TEXT NOT NULL,
        expire TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire);
    `);
  }

  get(sid: string, callback: (err?: any, session?: session.SessionData | null) => void): void {
    try {
      const row = getDatabase()
        .prepare(`SELECT sid, sess, expire FROM sessions WHERE sid = ?`)
        .get(sid) as SessionRow | undefined;
      if (!row) {
        callback(undefined, null);
        return;
      }

      if (new Date(row.expire).getTime() <= Date.now()) {
        this.destroy(sid, () => callback(undefined, null));
        return;
      }

      callback(undefined, JSON.parse(row.sess));
    } catch (error) {
      callback(error);
    }
  }

  set(sid: string, sess: session.SessionData, callback?: (err?: any) => void): void {
    try {
      const maxAge = typeof sess.cookie.maxAge === 'number' ? sess.cookie.maxAge : 24 * 60 * 60 * 1000;
      const expireAt = new Date(Date.now() + maxAge).toISOString();
      getDatabase()
        .prepare(
          `INSERT INTO sessions (sid, sess, expire)
           VALUES (?, ?, ?)
           ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expire = excluded.expire`
        )
        .run(sid, JSON.stringify(sess), expireAt);
      callback?.();
    } catch (error) {
      callback?.(error);
    }
  }

  destroy(sid: string, callback?: (err?: any) => void): void {
    try {
      getDatabase().prepare(`DELETE FROM sessions WHERE sid = ?`).run(sid);
      callback?.();
    } catch (error) {
      callback?.(error);
    }
  }

  touch(sid: string, sess: session.SessionData, callback?: () => void): void {
    this.set(sid, sess, callback);
  }

  pruneExpired(): void {
    getDatabase().prepare(`DELETE FROM sessions WHERE expire <= datetime('now')`).run();
  }
}
