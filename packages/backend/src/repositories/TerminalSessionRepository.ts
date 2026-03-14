import { BaseRepository } from './BaseRepository.js';

export type TerminalSessionStatus = 'active' | 'closed' | 'error';

export interface TerminalSession {
  id: number;
  nodeId: number;
  userId: number;
  startedAt: string;
  finishedAt?: string;
  logFilePath?: string;
  status: TerminalSessionStatus;
  controllerKey?: string;
  controllingSocketId?: string;
  heartbeatAt?: string;
}

export class TerminalSessionRepository extends BaseRepository {
  getActiveByNode(nodeId: number): TerminalSession | undefined {
    return this.prepare(
      `SELECT * FROM terminalSessions
       WHERE nodeId = ? AND status = 'active'
       ORDER BY startedAt DESC
       LIMIT 1`
    ).get(nodeId) as TerminalSession | undefined;
  }

  getActiveByController(controllerKey: string): TerminalSession | undefined {
    return this.prepare(
      `SELECT * FROM terminalSessions
       WHERE controllerKey = ? AND status = 'active'
       ORDER BY startedAt DESC
       LIMIT 1`
    ).get(controllerKey) as TerminalSession | undefined;
  }

  create(data: Pick<TerminalSession, 'nodeId' | 'userId' | 'status'> & Partial<TerminalSession>): TerminalSession {
    const stmt = this.prepare(
      `INSERT INTO terminalSessions
       (nodeId, userId, startedAt, finishedAt, logFilePath, status, controllerKey, controllingSocketId, heartbeatAt)
       VALUES (?, ?, datetime('now'), ?, ?, ?, ?, ?, datetime('now'))`
    );
    const result = stmt.run(
      data.nodeId,
      data.userId,
      data.finishedAt || null,
      data.logFilePath || null,
      data.status,
      data.controllerKey || null,
      data.controllingSocketId || null
    );
    return this.getById(result.lastInsertRowid as number)!;
  }

  getById(id: number): TerminalSession | undefined {
    return this.prepare('SELECT * FROM terminalSessions WHERE id = ?').get(id) as TerminalSession | undefined;
  }

  touch(id: number): TerminalSession | undefined {
    this.prepare(`UPDATE terminalSessions SET heartbeatAt = datetime('now') WHERE id = ?`).run(id);
    return this.getById(id);
  }

  bindSocket(id: number, socketId: string): TerminalSession | undefined {
    this.prepare(
      `UPDATE terminalSessions
       SET controllingSocketId = ?, heartbeatAt = datetime('now')
       WHERE id = ?`
    ).run(socketId, id);
    return this.getById(id);
  }

  closeByController(controllerKey: string, status: Exclude<TerminalSessionStatus, 'active'> = 'closed'): void {
    this.prepare(
      `UPDATE terminalSessions
       SET status = ?, finishedAt = datetime('now'), heartbeatAt = datetime('now')
       WHERE controllerKey = ? AND status = 'active'`
    ).run(status, controllerKey);
  }

  closeExpiredActive(ttlSeconds: number): number {
    const result = this.prepare(
      `UPDATE terminalSessions
       SET status = 'error', finishedAt = datetime('now')
       WHERE status = 'active'
         AND heartbeatAt IS NOT NULL
         AND heartbeatAt <= datetime('now', ?)`
    ).run(`-${ttlSeconds} seconds`);
    return result.changes as number;
  }

  closeAllActive(status: Exclude<TerminalSessionStatus, 'active'> = 'error'): number {
    const result = this.prepare(
      `UPDATE terminalSessions
       SET status = ?, finishedAt = datetime('now'), heartbeatAt = datetime('now')
       WHERE status = 'active'`
    ).run(status);
    return result.changes as number;
  }
}
