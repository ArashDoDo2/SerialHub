import { BaseRepository } from './BaseRepository.js';

export interface AIObservation {
  id: number;
  observerId: number;
  observerSessionId?: number;
  terminalSessionId?: number;
  nodeId: number;
  observationType: 'result' | 'summary';
  severity: 'info' | 'warning' | 'critical';
  title?: string;
  content: string;
  rawPayloadJson?: string;
  createdAt: string;
}

export class AIObservationRepository extends BaseRepository {
  create(input: {
    observerId: number;
    observerSessionId?: number;
    terminalSessionId?: number;
    nodeId: number;
    observationType: 'result' | 'summary';
    severity: 'info' | 'warning' | 'critical';
    title?: string;
    content: string;
    rawPayloadJson?: string;
  }): AIObservation {
    const result = this.prepare(
      `INSERT INTO ai_observations
       (observerId, observerSessionId, terminalSessionId, nodeId, observationType, severity, title, content, rawPayloadJson, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(
      input.observerId,
      input.observerSessionId ?? null,
      input.terminalSessionId ?? null,
      input.nodeId,
      input.observationType,
      input.severity,
      input.title ?? null,
      input.content,
      input.rawPayloadJson ?? null
    );

    return this.getById(result.lastInsertRowid as number)!;
  }

  getById(id: number): AIObservation | undefined {
    return this.prepare('SELECT * FROM ai_observations WHERE id = ?').get(id) as AIObservation | undefined;
  }

  listByNodeForOwner(nodeId: number, ownerUserId: number, limit = 20): AIObservation[] {
    return this.prepare(
      `SELECT o.*
       FROM ai_observations o
       INNER JOIN ai_observers a ON a.id = o.observerId
       WHERE o.nodeId = ? AND a.ownerUserId = ?
       ORDER BY o.createdAt DESC
       LIMIT ?`
    ).all(nodeId, ownerUserId, limit) as AIObservation[];
  }

  listByNode(nodeId: number, limit = 20): AIObservation[] {
    return this.prepare(
      `SELECT o.*
       FROM ai_observations o
       WHERE o.nodeId = ?
       ORDER BY o.createdAt DESC
       LIMIT ?`
    ).all(nodeId, limit) as AIObservation[];
  }
}
