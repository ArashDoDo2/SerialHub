import { BaseRepository } from './BaseRepository.js';

export interface AICopilotSession {
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

export class AICopilotSessionRepository extends BaseRepository {
  create(input: {
    observerId: number;
    terminalSessionId?: number;
    nodeId: number;
    ownerUserId: number;
    socketId: string;
  }): AICopilotSession {
    const result = this.prepare(
      `INSERT INTO ai_copilot_sessions
       (observerId, terminalSessionId, nodeId, ownerUserId, socketId, status, startedAt)
       VALUES (?, ?, ?, ?, ?, 'active', datetime('now'))`
    ).run(
      input.observerId,
      input.terminalSessionId ?? null,
      input.nodeId,
      input.ownerUserId,
      input.socketId
    );

    return this.getById(result.lastInsertRowid as number)!;
  }

  getById(id: number): AICopilotSession | undefined {
    return this.prepare('SELECT * FROM ai_copilot_sessions WHERE id = ?').get(id) as AICopilotSession | undefined;
  }

  closeActiveByTerminalSession(terminalSessionId: number, status: 'closed' | 'error' = 'closed', lastError?: string): number {
    const result = this.prepare(
      `UPDATE ai_copilot_sessions
       SET status = ?, endedAt = datetime('now'), lastError = ?
       WHERE terminalSessionId = ? AND status = 'active'`
    ).run(status, lastError ?? null, terminalSessionId);
    return result.changes;
  }

  closeActiveBySocket(observerId: number, socketId: string, status: 'closed' | 'error' = 'closed', lastError?: string): number {
    const result = this.prepare(
      `UPDATE ai_copilot_sessions
       SET status = ?, endedAt = datetime('now'), lastError = ?
       WHERE observerId = ? AND socketId = ? AND status = 'active'`
    ).run(status, lastError ?? null, observerId, socketId);
    return result.changes;
  }
}
