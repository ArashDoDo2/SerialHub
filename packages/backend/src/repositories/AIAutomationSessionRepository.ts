import { BaseRepository } from './BaseRepository.js';

export interface AIAutomationSession {
  id: number;
  observerId: number;
  terminalSessionId: number;
  nodeId: number;
  ownerUserId: number;
  socketId: string;
  status: 'active' | 'stopped' | 'closed' | 'error';
  startedAt: string;
  endedAt?: string;
  stoppedByUserId?: number;
  lastError?: string;
}

export class AIAutomationSessionRepository extends BaseRepository {
  create(input: {
    observerId: number;
    terminalSessionId: number;
    nodeId: number;
    ownerUserId: number;
    socketId: string;
  }): AIAutomationSession {
    const result = this.prepare(
      `INSERT INTO ai_automation_sessions
       (observerId, terminalSessionId, nodeId, ownerUserId, socketId, status, startedAt)
       VALUES (?, ?, ?, ?, ?, 'active', datetime('now'))`
    ).run(input.observerId, input.terminalSessionId, input.nodeId, input.ownerUserId, input.socketId);

    return this.getById(result.lastInsertRowid as number)!;
  }

  getById(id: number): AIAutomationSession | undefined {
    return this.prepare('SELECT * FROM ai_automation_sessions WHERE id = ?').get(id) as AIAutomationSession | undefined;
  }

  listActiveByTerminalSession(terminalSessionId: number): AIAutomationSession[] {
    return this.prepare(
      `SELECT * FROM ai_automation_sessions
       WHERE terminalSessionId = ? AND status = 'active'
       ORDER BY startedAt ASC`
    ).all(terminalSessionId) as AIAutomationSession[];
  }

  closeByTerminalSession(terminalSessionId: number, status: 'stopped' | 'closed' | 'error', stoppedByUserId?: number, lastError?: string): number {
    const result = this.prepare(
      `UPDATE ai_automation_sessions
       SET status = ?, endedAt = datetime('now'), stoppedByUserId = ?, lastError = ?
       WHERE terminalSessionId = ? AND status = 'active'`
    ).run(status, stoppedByUserId ?? null, lastError ?? null, terminalSessionId);
    return result.changes;
  }

  closeBySocket(observerId: number, socketId: string, status: 'closed' | 'error', lastError?: string): number {
    const result = this.prepare(
      `UPDATE ai_automation_sessions
       SET status = ?, endedAt = datetime('now'), lastError = ?
       WHERE observerId = ? AND socketId = ? AND status = 'active'`
    ).run(status, lastError ?? null, observerId, socketId);
    return result.changes;
  }
}
