import { AIToolPolicyRepository } from '../repositories/AIToolPolicyRepository.js';
import { AIObserver } from '../repositories/AIObserverRepository.js';

export interface AIToolPolicyModel {
  observerId: number;
  allowedTools: string[];
  approvalRequiredTools: string[];
  allowedNodes?: number[];
  rateLimits: Record<string, number>;
}

export class PolicyEngine {
  private policyRepo = new AIToolPolicyRepository();
  private invocationHistory = new Map<string, number[]>();
  private readonly windowMs = 60 * 1000;

  getPolicy(observer: AIObserver): AIToolPolicyModel {
    const existing = this.policyRepo.getByObserverId(observer.id);
    if (existing) {
      return {
        observerId: observer.id,
        allowedTools: JSON.parse(existing.allowedToolsJson),
        approvalRequiredTools: JSON.parse(existing.approvalRequiredToolsJson),
        allowedNodes: existing.allowedNodesJson ? JSON.parse(existing.allowedNodesJson) : undefined,
        rateLimits: JSON.parse(existing.rateLimitsJson),
      };
    }

    const defaults: AIToolPolicyModel = {
      observerId: observer.id,
      allowedTools: ['serial.read', 'serial.write', 'script.run', 'node.info', 'terminal.snapshot'],
      approvalRequiredTools: ['serial.write', 'script.run'],
      allowedNodes: undefined,
      rateLimits: {
        'serial.read': 30,
        'terminal.snapshot': 30,
        'node.info': 30,
        'serial.write': 5,
        'script.run': 2,
      },
    };

    this.policyRepo.create({
      observerId: observer.id,
      allowedToolsJson: JSON.stringify(defaults.allowedTools),
      approvalRequiredToolsJson: JSON.stringify(defaults.approvalRequiredTools),
      allowedNodesJson: defaults.allowedNodes ? JSON.stringify(defaults.allowedNodes) : undefined,
      rateLimitsJson: JSON.stringify(defaults.rateLimits),
    });

    return defaults;
  }

  validate(observer: AIObserver, toolName: string, nodeId: number): { allowed: boolean; requiresApproval: boolean; error?: string } {
    const policy = this.getPolicy(observer);
    if (!policy.allowedTools.includes(toolName)) {
      return { allowed: false, requiresApproval: false, error: 'Tool is not allowed by policy' };
    }

    if (policy.allowedNodes && !policy.allowedNodes.includes(nodeId)) {
      return { allowed: false, requiresApproval: false, error: 'Node is not allowed by policy' };
    }

    const limit = policy.rateLimits[toolName];
    if (limit && !this.consumeRate(observer.id, toolName, limit)) {
      return { allowed: false, requiresApproval: false, error: 'Tool rate limit exceeded' };
    }

    return {
      allowed: true,
      requiresApproval: policy.approvalRequiredTools.includes(toolName),
    };
  }

  private consumeRate(observerId: number, toolName: string, maxPerWindow: number): boolean {
    const key = `${observerId}:${toolName}`;
    const now = Date.now();
    const history = (this.invocationHistory.get(key) ?? []).filter((timestamp) => now - timestamp < this.windowMs);
    if (history.length >= maxPerWindow) {
      this.invocationHistory.set(key, history);
      return false;
    }

    history.push(now);
    this.invocationHistory.set(key, history);
    return true;
  }
}
