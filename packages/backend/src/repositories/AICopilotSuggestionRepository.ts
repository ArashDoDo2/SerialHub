import { BaseRepository } from './BaseRepository.js';

export interface AICopilotSuggestion {
  id: number;
  observerId: number;
  copilotSessionId?: number;
  terminalSessionId?: number;
  nodeId: number;
  suggestionType: 'suggestion' | 'summary';
  summary: string;
  hypothesesJson?: string;
  suggestedActionsJson?: string;
  rawPayloadJson?: string;
  createdAt: string;
}

export class AICopilotSuggestionRepository extends BaseRepository {
  create(input: {
    observerId: number;
    copilotSessionId?: number;
    terminalSessionId?: number;
    nodeId: number;
    suggestionType: 'suggestion' | 'summary';
    summary: string;
    hypothesesJson?: string;
    suggestedActionsJson?: string;
    rawPayloadJson?: string;
  }): AICopilotSuggestion {
    const result = this.prepare(
      `INSERT INTO ai_copilot_suggestions
       (observerId, copilotSessionId, terminalSessionId, nodeId, suggestionType, summary, hypothesesJson, suggestedActionsJson, rawPayloadJson, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(
      input.observerId,
      input.copilotSessionId ?? null,
      input.terminalSessionId ?? null,
      input.nodeId,
      input.suggestionType,
      input.summary,
      input.hypothesesJson ?? null,
      input.suggestedActionsJson ?? null,
      input.rawPayloadJson ?? null
    );

    return this.getById(result.lastInsertRowid as number)!;
  }

  getById(id: number): AICopilotSuggestion | undefined {
    return this.prepare('SELECT * FROM ai_copilot_suggestions WHERE id = ?').get(id) as AICopilotSuggestion | undefined;
  }

  listByNodeForOwner(nodeId: number, ownerUserId: number, limit = 20): AICopilotSuggestion[] {
    return this.prepare(
      `SELECT s.*
       FROM ai_copilot_suggestions s
       INNER JOIN ai_observers o ON o.id = s.observerId
       WHERE s.nodeId = ? AND o.ownerUserId = ?
       ORDER BY s.createdAt DESC
       LIMIT ?`
    ).all(nodeId, ownerUserId, limit) as AICopilotSuggestion[];
  }

  listByNode(nodeId: number, limit = 20): AICopilotSuggestion[] {
    return this.prepare(
      `SELECT s.*
       FROM ai_copilot_suggestions s
       WHERE s.nodeId = ?
       ORDER BY s.createdAt DESC
       LIMIT ?`
    ).all(nodeId, limit) as AICopilotSuggestion[];
  }
}
