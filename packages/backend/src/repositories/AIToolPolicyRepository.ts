import { BaseRepository } from './BaseRepository.js';

export interface AIToolPolicy {
  id: number;
  observerId: number;
  allowedToolsJson: string;
  approvalRequiredToolsJson: string;
  allowedNodesJson?: string;
  rateLimitsJson: string;
  createdAt: string;
  updatedAt: string;
}

export class AIToolPolicyRepository extends BaseRepository {
  getByObserverId(observerId: number): AIToolPolicy | undefined {
    return this.prepare('SELECT * FROM ai_tool_policies WHERE observerId = ?').get(observerId) as AIToolPolicy | undefined;
  }

  create(input: {
    observerId: number;
    allowedToolsJson: string;
    approvalRequiredToolsJson: string;
    allowedNodesJson?: string;
    rateLimitsJson: string;
  }): AIToolPolicy {
    const result = this.prepare(
      `INSERT INTO ai_tool_policies
       (observerId, allowedToolsJson, approvalRequiredToolsJson, allowedNodesJson, rateLimitsJson, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    ).run(
      input.observerId,
      input.allowedToolsJson,
      input.approvalRequiredToolsJson,
      input.allowedNodesJson ?? null,
      input.rateLimitsJson
    );

    return this.getById(result.lastInsertRowid as number)!;
  }

  getById(id: number): AIToolPolicy | undefined {
    return this.prepare('SELECT * FROM ai_tool_policies WHERE id = ?').get(id) as AIToolPolicy | undefined;
  }
}
