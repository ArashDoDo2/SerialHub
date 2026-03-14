import { BaseRepository } from './BaseRepository.js';

export interface AIObserverSession {
  id: number;
  observerId: number;
  terminalSessionId?: number;
  nodeId: number;
  ownerUserId: number;
  socketId: string;
  status: 'active' | 'closed' | 'error';
  startedAt: string;
  endedAt?: string;
  lastError?: string;
}

export class AIObserverSessionRepository extends BaseRepository {
  create(input: {
    observerId: number;
    terminalSessionId?: number;
    nodeId: number;
    ownerUserId: number;
    socketId: string;
  }): AIObserverSession {
    const result = this.prepare(
      `INSERT INTO ai_observer_sessions
       (observerId, terminalSessionId, nodeId, ownerUserId, socketId, status, startedAt)
       VALUES (?, ?, ?, ?, ?, 'active', datetime('now'))`
    ).run(input.observerId, input.terminalSessionId ?? null, input.nodeId, input.ownerUserId, input.socketId);

    return this.getById(result.lastInsertRowid as number)!;
  }

  getById(id: number): AIObserverSession | undefined {
    return this.prepare('SELECT * FROM ai_observer_sessions WHERE id = ?').get(id) as AIObserverSession | undefined;
  }

  listActiveByNode(nodeId: number): AIObserverSession[] {
    return this.prepare(
      `SELECT *
       FROM ai_observer_sessions
       WHERE nodeId = ? AND status = 'active'
       ORDER BY startedAt ASC`
    ).all(nodeId) as AIObserverSession[];
  }

  closeActiveByTerminalSession(terminalSessionId: number, status: 'closed' | 'error', lastError?: string): number {
    const result = this.prepare(
      `UPDATE ai_observer_sessions
       SET status = ?, endedAt = datetime('now'), lastError = ?
       WHERE terminalSessionId = ? AND status = 'active'`
    ).run(status, lastError ?? null, terminalSessionId);

    return result.changes;
  }

  closeActiveBySocket(observerId: number, socketId: string, status: 'closed' | 'error', lastError?: string): number {
    const result = this.prepare(
      `UPDATE ai_observer_sessions
       SET status = ?, endedAt = datetime('now'), lastError = ?
       WHERE observerId = ? AND socketId = ? AND status = 'active'`
    ).run(status, lastError ?? null, observerId, socketId);

    return result.changes;
  }
}
