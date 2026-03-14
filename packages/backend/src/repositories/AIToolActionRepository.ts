import { BaseRepository } from './BaseRepository.js';

export type AIToolActionStatus = 'pending_approval' | 'approved' | 'rejected' | 'executed' | 'failed' | 'blocked';

export interface AIToolAction {
  id: number;
  observerId: number;
  automationSessionId?: number;
  terminalSessionId?: number;
  nodeId: number;
  toolName: string;
  argumentsJson: string;
  status: AIToolActionStatus;
  resultJson?: string;
  requiresApproval: number;
  approvedByUserId?: number;
  rejectedByUserId?: number;
  createdAt: string;
  resolvedAt?: string;
}

export class AIToolActionRepository extends BaseRepository {
  create(input: {
    observerId: number;
    automationSessionId?: number;
    terminalSessionId?: number;
    nodeId: number;
    toolName: string;
    argumentsJson: string;
    status: AIToolActionStatus;
    resultJson?: string;
    requiresApproval: boolean;
    approvedByUserId?: number;
    rejectedByUserId?: number;
  }): AIToolAction {
    const result = this.prepare(
      `INSERT INTO ai_tool_actions
       (observerId, automationSessionId, terminalSessionId, nodeId, toolName, argumentsJson, status, resultJson, requiresApproval, approvedByUserId, rejectedByUserId, createdAt, resolvedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)`
    ).run(
      input.observerId,
      input.automationSessionId ?? null,
      input.terminalSessionId ?? null,
      input.nodeId,
      input.toolName,
      input.argumentsJson,
      input.status,
      input.resultJson ?? null,
      input.requiresApproval ? 1 : 0,
      input.approvedByUserId ?? null,
      input.rejectedByUserId ?? null,
      input.status === 'pending_approval' ? null : new Date().toISOString()
    );

    return this.getById(result.lastInsertRowid as number)!;
  }

  getById(id: number): AIToolAction | undefined {
    return this.prepare('SELECT * FROM ai_tool_actions WHERE id = ?').get(id) as AIToolAction | undefined;
  }

  listByNodeForOwner(nodeId: number, ownerUserId: number, limit = 20): AIToolAction[] {
    return this.prepare(
      `SELECT a.*
       FROM ai_tool_actions a
       INNER JOIN ai_observers o ON o.id = a.observerId
       WHERE a.nodeId = ? AND o.ownerUserId = ?
       ORDER BY a.createdAt DESC
       LIMIT ?`
    ).all(nodeId, ownerUserId, limit) as AIToolAction[];
  }

  listByNode(nodeId: number, limit = 20): AIToolAction[] {
    return this.prepare(
      `SELECT a.*
       FROM ai_tool_actions a
       WHERE a.nodeId = ?
       ORDER BY a.createdAt DESC
       LIMIT ?`
    ).all(nodeId, limit) as AIToolAction[];
  }

  updateStatus(
    id: number,
    input: {
      status: AIToolActionStatus;
      resultJson?: string;
      approvedByUserId?: number;
      rejectedByUserId?: number;
    }
  ): AIToolAction | undefined {
    this.prepare(
      `UPDATE ai_tool_actions
       SET status = ?, resultJson = ?, approvedByUserId = COALESCE(?, approvedByUserId), rejectedByUserId = COALESCE(?, rejectedByUserId), resolvedAt = ?
       WHERE id = ?`
    ).run(
      input.status,
      input.resultJson ?? null,
      input.approvedByUserId ?? null,
      input.rejectedByUserId ?? null,
      new Date().toISOString(),
      id
    );
    return this.getById(id);
  }
}
