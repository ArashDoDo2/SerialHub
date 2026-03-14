import EventEmitter from 'events';
import { z } from 'zod';
import { logger } from '../config/logger.js';
import { AIAutomationSession, AIAutomationSessionRepository } from '../repositories/AIAutomationSessionRepository.js';
import { AIObserver, AIObserverRepository } from '../repositories/AIObserverRepository.js';
import { AIToolAction, AIToolActionRepository } from '../repositories/AIToolActionRepository.js';
import { TerminalSessionRepository } from '../repositories/TerminalSessionRepository.js';
import { SerialNodeRepository } from '../repositories/SerialNodeRepository.js';
import { UserRepository } from '../repositories/UserRepository.js';
import { PolicyEngine } from './PolicyEngine.js';
import { ToolRegistry } from './ToolRegistry.js';
import { connectionEvents } from './SerialConnectionManager.js';
import { isOwnerOrAdmin } from '../middleware/auth.js';

interface AutomationSocket {
  id: string;
  emit(event: string, payload: unknown): void;
}

interface ActiveAutomationSession {
  observer: AIObserver;
  automationSession: AIAutomationSession;
  socketId: string;
}

interface SnapshotChunk {
  payloadBase64: string;
  payloadLength: number;
  timestamp: string;
}

const MAX_SNAPSHOT_CHUNKS = 50;

const actionProposalSchema = z.object({
  terminalSessionId: z.number().int().positive().optional(),
  nodeId: z.coerce.number().int().positive(),
  tool: z.enum(['serial.read', 'serial.write', 'script.run', 'node.info', 'terminal.snapshot']),
  arguments: z.record(z.unknown()).default({}),
});

export const aiAutomationEvents = new EventEmitter();

export class AIAutomationService {
  private static instance: AIAutomationService;

  private observerRepo = new AIObserverRepository();
  private sessionRepo = new AIAutomationSessionRepository();
  private actionRepo = new AIToolActionRepository();
  private terminalSessionRepo = new TerminalSessionRepository();
  private nodeRepo = new SerialNodeRepository();
  private userRepo = new UserRepository();
  private policyEngine = new PolicyEngine();
  private automationSockets = new Map<number, Map<string, AutomationSocket>>();
  private enabledTerminals = new Map<number, { nodeId: number; userId: number }>();
  private activeSessions = new Map<number, ActiveAutomationSession[]>();
  private snapshots = new Map<number, SnapshotChunk[]>();
  private connectionEventsBound = false;
  private toolRegistry = new ToolRegistry((nodeId, limit) => this.getSnapshot(nodeId, limit));

  private constructor() {
    this.bindConnectionEvents();
  }

  static getInstance(): AIAutomationService {
    if (!AIAutomationService.instance) {
      AIAutomationService.instance = new AIAutomationService();
    }
    return AIAutomationService.instance;
  }

  authenticateAgent(authToken: string): AIObserver | undefined {
    return this.observerRepo.getByAuthToken(authToken);
  }

  registerSocket(observer: AIObserver, socket: AutomationSocket): void {
    const sockets = this.automationSockets.get(observer.id) ?? new Map<string, AutomationSocket>();
    sockets.set(socket.id, socket);
    this.automationSockets.set(observer.id, sockets);
    logger.info({ observerId: observer.id, socketId: socket.id, ownerUserId: observer.ownerUserId }, 'AI automation agent connected');

    for (const [terminalSessionId, enabled] of this.enabledTerminals.entries()) {
      if (enabled.userId !== observer.ownerUserId) {
        continue;
      }
      this.attachSocketToTerminalSession(observer, socket.id, terminalSessionId, enabled.nodeId, enabled.userId);
    }
  }

  unregisterSocket(observerId: number, socketId: string): void {
    const sockets = this.automationSockets.get(observerId);
    if (sockets) {
      sockets.delete(socketId);
      if (sockets.size === 0) {
        this.automationSockets.delete(observerId);
      }
    }
    this.sessionRepo.closeBySocket(observerId, socketId, 'closed');
    for (const [terminalSessionId, sessions] of this.activeSessions.entries()) {
      const filtered = sessions.filter((session) => !(session.observer.id === observerId && session.socketId === socketId));
      if (filtered.length === 0) {
        this.activeSessions.delete(terminalSessionId);
      } else {
        this.activeSessions.set(terminalSessionId, filtered);
      }
    }
  }

  enableTerminalSession(input: { terminalSessionId: number; nodeId: number; userId: number }): { enabled: boolean; observerCount: number } {
    const terminalSession = this.terminalSessionRepo.getById(input.terminalSessionId);
    if (!terminalSession || terminalSession.status !== 'active' || terminalSession.userId !== input.userId || terminalSession.nodeId !== input.nodeId) {
      throw new Error('Terminal session is not active for this user');
    }

    this.enabledTerminals.set(input.terminalSessionId, { nodeId: input.nodeId, userId: input.userId });
    let observerCount = 0;
    const observers = this.observerRepo.listByOwner(input.userId);
    for (const observer of observers) {
      const sockets = this.automationSockets.get(observer.id);
      if (!sockets || sockets.size === 0) {
        continue;
      }

      for (const socketId of sockets.keys()) {
        this.attachSocketToTerminalSession(observer, socketId, input.terminalSessionId, input.nodeId, input.userId);
        observerCount += 1;
      }
    }

    aiAutomationEvents.emit('session', {
      terminalSessionId: input.terminalSessionId,
      nodeId: input.nodeId,
      enabled: true,
      observerCount,
    });
    return { enabled: true, observerCount };
  }

  disableTerminalSession(input: { terminalSessionId: number; nodeId: number; userId?: number; reason?: string }): { enabled: boolean } {
    this.enabledTerminals.delete(input.terminalSessionId);
    this.sessionRepo.closeByTerminalSession(input.terminalSessionId, 'stopped', input.userId, input.reason);
    this.activeSessions.delete(input.terminalSessionId);
    aiAutomationEvents.emit('session', {
      terminalSessionId: input.terminalSessionId,
      nodeId: input.nodeId,
      enabled: false,
      reason: input.reason,
    });
    return { enabled: false };
  }

  getSessionStatus(terminalSessionId: number, userId: number): { enabled: boolean; observerCount: number } {
    const terminalSession = this.terminalSessionRepo.getById(terminalSessionId);
    if (!terminalSession || terminalSession.userId !== userId) {
      throw new Error('Terminal session not found');
    }
    const sessions = this.activeSessions.get(terminalSessionId) ?? [];
    return { enabled: this.enabledTerminals.has(terminalSessionId), observerCount: sessions.length };
  }

  listActions(nodeId: number, ownerUserId: number, limit = 20): Array<AIToolAction & { arguments: unknown; result: unknown }> {
    return this.actionRepo.listByNodeForOwner(nodeId, ownerUserId, limit).map((action) => ({
      ...action,
      arguments: JSON.parse(action.argumentsJson),
      result: action.resultJson ? JSON.parse(action.resultJson) : null,
    }));
  }

  listAllActions(nodeId: number, limit = 20): Array<AIToolAction & { arguments: unknown; result: unknown }> {
    return this.actionRepo.listByNode(nodeId, limit).map((action) => ({
      ...action,
      arguments: JSON.parse(action.argumentsJson),
      result: action.resultJson ? JSON.parse(action.resultJson) : null,
    }));
  }

  async proposeAction(observer: AIObserver, socketId: string, payload: unknown): Promise<{ action: AIToolAction; result?: unknown }> {
    const parsed = actionProposalSchema.safeParse(payload);
    if (!parsed.success) {
      throw new Error('Invalid action proposal');
    }

    const activeSession = this.resolveAutomationSession(observer.id, socketId, parsed.data.terminalSessionId, parsed.data.nodeId);
    if (!activeSession) {
      throw new Error('AI automation session is not active for this node');
    }
    const node = this.nodeRepo.getById(parsed.data.nodeId);
    if (!node || node.ownerUserId !== observer.ownerUserId) {
      throw new Error('AI agent cannot access this node');
    }

    const policy = this.policyEngine.validate(observer, parsed.data.tool, parsed.data.nodeId);
    if (!policy.allowed) {
      const blocked = this.actionRepo.create({
        observerId: observer.id,
        automationSessionId: activeSession.automationSession.id,
        terminalSessionId: activeSession.automationSession.terminalSessionId,
        nodeId: parsed.data.nodeId,
        toolName: parsed.data.tool,
        argumentsJson: JSON.stringify(parsed.data.arguments),
        status: 'blocked',
        resultJson: JSON.stringify({ error: policy.error }),
        requiresApproval: false,
      });
      this.emitAction(blocked);
      throw new Error(policy.error || 'Tool blocked by policy');
    }

    const action = this.actionRepo.create({
      observerId: observer.id,
      automationSessionId: activeSession.automationSession.id,
      terminalSessionId: activeSession.automationSession.terminalSessionId,
      nodeId: parsed.data.nodeId,
      toolName: parsed.data.tool,
      argumentsJson: JSON.stringify(parsed.data.arguments),
      status: policy.requiresApproval ? 'pending_approval' : 'approved',
      requiresApproval: policy.requiresApproval,
    });

    logger.info(
      { observerId: observer.id, automationSessionId: activeSession.automationSession.id, nodeId: parsed.data.nodeId, toolName: parsed.data.tool },
      'AI tool action proposed'
    );

    if (policy.requiresApproval) {
      this.emitAction(action);
      return { action };
    }

    const result = await this.executeAction(action, observer.ownerUserId);
    return { action: result.action, result: result.result };
  }

  async approveAction(actionId: number, approvedByUserId: number): Promise<{ action: AIToolAction; result?: unknown }> {
    const action = this.actionRepo.getById(actionId);
    if (!action || action.status !== 'pending_approval') {
      throw new Error('Action is not pending approval');
    }
    this.assertActionSessionActive(action);
    this.ensureUserCanAccessNode(action.nodeId, approvedByUserId);

    const approved = this.actionRepo.updateStatus(action.id, {
      status: 'approved',
      approvedByUserId,
    });
    this.emitAction(approved!);
    return this.executeAction(approved!, approvedByUserId);
  }

  rejectAction(actionId: number, rejectedByUserId: number): AIToolAction {
    const action = this.actionRepo.getById(actionId);
    if (!action || action.status !== 'pending_approval') {
      throw new Error('Action is not pending approval');
    }
    this.ensureUserCanAccessNode(action.nodeId, rejectedByUserId);
    const rejected = this.actionRepo.updateStatus(action.id, {
      status: 'rejected',
      rejectedByUserId,
      resultJson: JSON.stringify({ rejected: true }),
    })!;
    this.emitAction(rejected);
    return rejected;
  }

  private async executeAction(action: AIToolAction, approvedByUserId: number): Promise<{ action: AIToolAction; result: unknown }> {
    const observer = this.observerRepo.getById(action.observerId);
    if (!observer) {
      throw new Error('Observer not found');
    }
    this.assertActionSessionActive(action);

    try {
      const result = await this.toolRegistry.execute(
        action.toolName,
        JSON.parse(action.argumentsJson),
        {
          terminalSessionId: action.terminalSessionId,
          nodeId: action.nodeId,
          userId: approvedByUserId,
        }
      );
      const executed = this.actionRepo.updateStatus(action.id, {
        status: 'executed',
        approvedByUserId,
        resultJson: JSON.stringify(result),
      })!;
      this.emitAction(executed);
      this.emitToAgent(observer.id, 'action.result', {
        actionId: executed.id,
        status: executed.status,
        result,
      });
      logger.info(
        { observerId: observer.id, actionId: executed.id, nodeId: executed.nodeId, toolName: executed.toolName, approvedByUserId },
        'AI tool action executed'
      );
      return { action: executed, result };
    } catch (error) {
      const failed = this.actionRepo.updateStatus(action.id, {
        status: 'failed',
        approvedByUserId,
        resultJson: JSON.stringify({ error: error instanceof Error ? error.message : 'Tool execution failed' }),
      })!;
      this.emitAction(failed);
      this.emitToAgent(observer.id, 'action.result', {
        actionId: failed.id,
        status: failed.status,
        error: error instanceof Error ? error.message : 'Tool execution failed',
      });
      throw error;
    }
  }

  private bindConnectionEvents(): void {
    if (this.connectionEventsBound) {
      return;
    }
    connectionEvents.on('data', ({ nodeId, data }: { nodeId: number; data: Buffer }) => {
      const current = this.snapshots.get(nodeId) ?? [];
      current.push({
        payloadBase64: data.toString('base64'),
        payloadLength: data.length,
        timestamp: new Date().toISOString(),
      });
      this.snapshots.set(nodeId, current.slice(-50));
    });
    this.connectionEventsBound = true;
  }

  private attachSocketToTerminalSession(observer: AIObserver, socketId: string, terminalSessionId: number, nodeId: number, userId: number): void {
    const existing = (this.activeSessions.get(terminalSessionId) ?? []).find(
      (session) => session.observer.id === observer.id && session.socketId === socketId
    );
    if (existing) {
      return;
    }
    const automationSession = this.sessionRepo.create({
      observerId: observer.id,
      terminalSessionId,
      nodeId,
      ownerUserId: userId,
      socketId,
    });
    const list = this.activeSessions.get(terminalSessionId) ?? [];
    list.push({ observer, automationSession, socketId });
    this.activeSessions.set(terminalSessionId, list);
    this.emitToAgent(observer.id, 'session.started', {
      terminalSessionId,
      nodeId,
      automationSessionId: automationSession.id,
    });
  }

  private getSnapshot(nodeId: number, limit = 20) {
    const chunks = (this.snapshots.get(nodeId) ?? []).slice(-limit);
    return {
      nodeId,
      chunkCount: chunks.length,
      chunks,
      textPreview: chunks.map((chunk) => Buffer.from(chunk.payloadBase64, 'base64').toString('utf-8')).join('').slice(-4000),
    };
  }

  private resolveAutomationSession(observerId: number, socketId: string, terminalSessionId: number | undefined, nodeId: number): ActiveAutomationSession | undefined {
    if (terminalSessionId !== undefined) {
      return (this.activeSessions.get(terminalSessionId) ?? []).find(
        (session) => session.observer.id === observerId && session.socketId === socketId
      );
    }

    for (const sessions of this.activeSessions.values()) {
      const match = sessions.find(
        (session) =>
          session.observer.id === observerId &&
          session.socketId === socketId &&
          session.automationSession.nodeId === nodeId
      );
      if (match) {
        return match;
      }
    }
    return undefined;
  }

  private emitToAgent(observerId: number, event: string, payload: unknown): void {
    for (const socket of this.automationSockets.get(observerId)?.values() ?? []) {
      socket.emit(event, payload);
    }
  }

  private emitAction(action: AIToolAction): void {
    aiAutomationEvents.emit('action', {
      ...action,
      arguments: JSON.parse(action.argumentsJson),
      result: action.resultJson ? JSON.parse(action.resultJson) : null,
    });
  }

  private ensureUserCanAccessNode(nodeId: number, userId: number): void {
    const user = this.userRepo.findById(userId);
    const node = this.nodeRepo.getById(nodeId);
    if (!user || !node || !isOwnerOrAdmin(node.ownerUserId, user)) {
      throw new Error('Forbidden');
    }
  }

  private assertActionSessionActive(action: AIToolAction): void {
    if (!action.automationSessionId) {
      return;
    }
    const session = this.sessionRepo.getById(action.automationSessionId);
    if (session?.status === 'active') {
      return;
    }
    const cancelled = this.actionRepo.updateStatus(action.id, {
      status: 'failed',
      resultJson: JSON.stringify({
        error: 'AI automation session is no longer active',
        cancelled: true,
      }),
    });
    if (cancelled) {
      this.emitAction(cancelled);
    }
    logger.warn(
      {
        actionId: action.id,
        automationSessionId: action.automationSessionId,
        nodeId: action.nodeId,
        toolName: action.toolName,
      },
      'AI action cancelled because automation session is no longer active'
    );
    throw new Error('AI automation session is no longer active');
  }
}
