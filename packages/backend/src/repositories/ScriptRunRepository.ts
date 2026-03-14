import { BaseRepository } from './BaseRepository.js';

export type ScriptRunStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface ScriptRun {
  id: number;
  scriptId: number;
  nodeId: number;
  runByUserId: number;
  ownerUserId: number;
  startedAt?: string;
  finishedAt?: string;
  status: ScriptRunStatus;
  outputFilePath?: string;
}

export interface ScriptRunListItem extends ScriptRun {
  scriptName: string;
  nodeName: string;
  ownerUserId: number;
}

export class ScriptRunRepository extends BaseRepository {
  create(run: Partial<ScriptRun>): ScriptRun {
    const stmt = this.db.prepare(
      `INSERT INTO scriptRuns (scriptId, nodeId, runByUserId, ownerUserId, startedAt, finishedAt, status, outputFilePath)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const result = stmt.run(
      run.scriptId,
      run.nodeId,
      run.runByUserId,
      run.ownerUserId,
      run.startedAt || null,
      run.finishedAt || null,
      run.status,
      run.outputFilePath || null
    );
    return this.getById(result.lastInsertRowid as number)!;
  }

  update(id: number, data: Partial<ScriptRun>): ScriptRun | undefined {
    const fields: string[] = [];
    const values: any[] = [];
    if (data.startedAt !== undefined) { fields.push('startedAt = ?'); values.push(data.startedAt); }
    if (data.finishedAt !== undefined) { fields.push('finishedAt = ?'); values.push(data.finishedAt); }
    if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status); }
    if (data.outputFilePath !== undefined) { fields.push('outputFilePath = ?'); values.push(data.outputFilePath); }
    values.push(id);
    if (fields.length === 0) return this.getById(id);
    const sql = `UPDATE scriptRuns SET ${fields.join(', ')} WHERE id = ?`;
    this.db.prepare(sql).run(...values);
    return this.getById(id);
  }

  getById(id: number): ScriptRun | undefined {
    return this.db.prepare('SELECT * FROM scriptRuns WHERE id = ?').get(id) as ScriptRun | undefined;
  }

  listByScript(scriptId: number): ScriptRun[] {
    return this.db.prepare('SELECT * FROM scriptRuns WHERE scriptId = ? ORDER BY startedAt DESC').all(scriptId) as ScriptRun[];
  }

  listByScriptForOwner(scriptId: number, ownerUserId: number): ScriptRun[] {
    return this.db.prepare(
      'SELECT * FROM scriptRuns WHERE scriptId = ? AND ownerUserId = ? ORDER BY startedAt DESC'
    ).all(scriptId, ownerUserId) as ScriptRun[];
  }

  findRunningByNode(nodeId: number): ScriptRun | undefined {
    return this.db.prepare(
      `SELECT * FROM scriptRuns
       WHERE nodeId = ? AND status = 'running'
       ORDER BY startedAt DESC
       LIMIT 1`
    ).get(nodeId) as ScriptRun | undefined;
  }

  listAllDetailed(): ScriptRunListItem[] {
    return this.db.prepare(
      `SELECT sr.*, s.name as scriptName, n.name as nodeName, sr.ownerUserId as ownerUserId
       FROM scriptRuns sr
       JOIN scripts s ON s.id = sr.scriptId
       JOIN serialNodes n ON n.id = sr.nodeId
       ORDER BY COALESCE(sr.startedAt, sr.finishedAt) DESC, sr.id DESC`
    ).all() as ScriptRunListItem[];
  }

  listAllDetailedForOwner(ownerUserId: number): ScriptRunListItem[] {
    return this.db.prepare(
      `SELECT sr.*, s.name as scriptName, n.name as nodeName, sr.ownerUserId as ownerUserId
       FROM scriptRuns sr
       JOIN scripts s ON s.id = sr.scriptId
       JOIN serialNodes n ON n.id = sr.nodeId
       WHERE sr.ownerUserId = ?
       ORDER BY COALESCE(sr.startedAt, sr.finishedAt) DESC, sr.id DESC`
    ).all(ownerUserId) as ScriptRunListItem[];
  }

  getDetailedById(id: number): ScriptRunListItem | undefined {
    return this.db.prepare(
      `SELECT sr.*, s.name as scriptName, n.name as nodeName, sr.ownerUserId as ownerUserId
       FROM scriptRuns sr
       JOIN scripts s ON s.id = sr.scriptId
       JOIN serialNodes n ON n.id = sr.nodeId
       WHERE sr.id = ?`
    ).get(id) as ScriptRunListItem | undefined;
  }

  getDetailedByIdForOwner(id: number, ownerUserId: number): ScriptRunListItem | undefined {
    return this.db.prepare(
      `SELECT sr.*, s.name as scriptName, n.name as nodeName, sr.ownerUserId as ownerUserId
       FROM scriptRuns sr
       JOIN scripts s ON s.id = sr.scriptId
       JOIN serialNodes n ON n.id = sr.nodeId
       WHERE sr.id = ? AND sr.ownerUserId = ?`
    ).get(id, ownerUserId) as ScriptRunListItem | undefined;
  }
}
