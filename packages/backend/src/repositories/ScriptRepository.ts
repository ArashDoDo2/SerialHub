import { BaseRepository } from './BaseRepository.js';

export interface Script {
  id: number;
  name: string;
  description?: string;
  commandsJson: string;
  defaultDelayMs: number;
  timeoutMs: number;
  ownerUserId: number;
  createdAt: string;
  updatedAt: string;
}

export class ScriptRepository extends BaseRepository {
  getAllWithLastRun(): Array<Script & { lastRun?: string }> {
    return this.db.prepare(
      `SELECT s.*, MAX(sr.startedAt) as lastRun
       FROM scripts s
       LEFT JOIN scriptRuns sr ON sr.scriptId = s.id
       GROUP BY s.id
       ORDER BY s.updatedAt DESC`
    ).all() as Array<Script & { lastRun?: string }>;
  }

  getAllWithLastRunForOwner(ownerUserId: number): Array<Script & { lastRun?: string }> {
    return this.db.prepare(
      `SELECT s.*, MAX(sr.startedAt) as lastRun
       FROM scripts s
       LEFT JOIN scriptRuns sr ON sr.scriptId = s.id
       WHERE s.ownerUserId = ?
       GROUP BY s.id
       ORDER BY s.updatedAt DESC`
    ).all(ownerUserId) as Array<Script & { lastRun?: string }>;
  }

  getAll(): Script[] {
    return this.db.prepare('SELECT * FROM scripts').all() as Script[];
  }

  getAllForOwner(ownerUserId: number): Script[] {
    return this.db.prepare('SELECT * FROM scripts WHERE ownerUserId = ? ORDER BY updatedAt DESC').all(ownerUserId) as Script[];
  }

  getById(id: number): Script | undefined {
    return this.db.prepare('SELECT * FROM scripts WHERE id = ?').get(id) as Script | undefined;
  }

  getByIdForOwner(id: number, ownerUserId: number): Script | undefined {
    return this.db.prepare('SELECT * FROM scripts WHERE id = ? AND ownerUserId = ?').get(id, ownerUserId) as Script | undefined;
  }

  create(script: Partial<Script>): Script {
    const stmt = this.db.prepare(
      `INSERT INTO scripts (name, description, commandsJson, defaultDelayMs, timeoutMs, ownerUserId, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    );
    const result = stmt.run(
      script.name,
      script.description || null,
      script.commandsJson,
      script.defaultDelayMs,
      script.timeoutMs,
      script.ownerUserId
    );
    return this.getById(result.lastInsertRowid as number)!;
  }

  update(id: number, script: Partial<Script>): Script | undefined {
    const fields: string[] = [];
    const values: any[] = [];
    if (script.name !== undefined) { fields.push('name = ?'); values.push(script.name); }
    if (script.description !== undefined) { fields.push('description = ?'); values.push(script.description); }
    if (script.commandsJson !== undefined) { fields.push('commandsJson = ?'); values.push(script.commandsJson); }
    if (script.defaultDelayMs !== undefined) { fields.push('defaultDelayMs = ?'); values.push(script.defaultDelayMs); }
    if (script.timeoutMs !== undefined) { fields.push('timeoutMs = ?'); values.push(script.timeoutMs); }
    values.push(id);
    if (fields.length === 0) return this.getById(id);
    const sql = `UPDATE scripts SET ${fields.join(', ')}, updatedAt = datetime('now') WHERE id = ?`;
    this.db.prepare(sql).run(...values);
    return this.getById(id);
  }

  delete(id: number): void {
    this.db.prepare('DELETE FROM scripts WHERE id = ?').run(id);
  }
}
