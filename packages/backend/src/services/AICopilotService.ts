import EventEmitter from 'events';
import { z } from 'zod';
import { logger } from '../config/logger.js';
import { AIObserver, AIObserverRepository } from '../repositories/AIObserverRepository.js';
import { AICopilotSession, AICopilotSessionRepository } from '../repositories/AICopilotSessionRepository.js';
import { AICopilotSuggestion, AICopilotSuggestionRepository } from '../repositories/AICopilotSuggestionRepository.js';
import { ScriptRepository } from '../repositories/ScriptRepository.js';
import { SerialNodeRepository } from '../repositories/SerialNodeRepository.js';
import { connectionEvents } from './SerialConnectionManager.js';

interface CopilotSocket {
  id: string;
  emit(event: string, payload: unknown): void;
}

interface ActiveCopilotSession {
  observer: AIObserver;
  copilotSession: AICopilotSession;
  socketId: string;
}

interface SnapshotChunk {
  payloadBase64: string;
  payloadLength: number;
  timestamp: string;
}

export interface AICopilotHypothesis {
  label: string;
  confidence: number;
}

export interface AICopilotSuggestedAction {
  type: 'serial_command' | 'script';
  command?: string;
  scriptId?: number;
  scriptName?: string;
  reason: string;
}

export interface AICopilotSuggestionPayload {
  nodeId: number;
  terminalSessionId?: number;
  summary: string;
  hypotheses?: AICopilotHypothesis[];
  suggestedActions?: AICopilotSuggestedAction[];
  rawPayload?: Record<string, unknown>;
}

const MAX_SNAPSHOT_CHUNKS = 40;

const hypothesisSchema = z.object({
  label: z.string().min(1).max(100),
  confidence: z.number().min(0).max(1),
});

const suggestedActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('serial_command'),
    command: z.string().min(1).max(500),
    reason: z.string().min(1).max(500),
  }),
  z.object({
    type: z.literal('script'),
    scriptId: z.number().int().positive().optional(),
    scriptName: z.string().min(1).max(200).optional(),
    reason: z.string().min(1).max(500),
  }),
]);

const suggestionPayloadSchema = z.object({
  nodeId: z.number().int().positive(),
  terminalSessionId: z.number().int().positive().optional(),
  summary: z.string().min(1).max(4000),
  hypotheses: z.array(hypothesisSchema).max(20).optional(),
  suggestedActions: z.array(suggestedActionSchema).max(20).optional(),
  rawPayload: z.record(z.unknown()).optional(),
});

export const aiCopilotEvents = new EventEmitter();

export class AICopilotService {
  private static instance: AICopilotService;

  private observerRepo = new AIObserverRepository();
  private sessionRepo = new AICopilotSessionRepository();
  private suggestionRepo = new AICopilotSuggestionRepository();
  private nodeRepo = new SerialNodeRepository();
  private scriptRepo = new ScriptRepository();
  private copilotSockets = new Map<number, Map<string, CopilotSocket>>();
  private activeSessions = new Map<number, ActiveCopilotSession[]>();
  private recentSnapshots = new Map<number, SnapshotChunk[]>();
  private connectionEventsBound = false;

  private constructor() {
    this.bindConnectionEvents();
  }

  static getInstance(): AICopilotService {
    if (!AICopilotService.instance) {
      AICopilotService.instance = new AICopilotService();
    }
    return AICopilotService.instance;
  }

  authenticateCopilot(authToken: string): AIObserver | undefined {
    return this.observerRepo.getByAuthToken(authToken);
  }

  listSuggestions(nodeId: number, ownerUserId: number, limit = 20): AICopilotSuggestion[] {
    return this.suggestionRepo.listByNodeForOwner(nodeId, ownerUserId, limit);
  }

  listAllSuggestions(nodeId: number, limit = 20): AICopilotSuggestion[] {
    return this.suggestionRepo.listByNode(nodeId, limit);
  }

  registerSocket(observer: AIObserver, socket: CopilotSocket): void {
    const sockets = this.copilotSockets.get(observer.id) ?? new Map<string, CopilotSocket>();
    sockets.set(socket.id, socket);
    this.copilotSockets.set(observer.id, sockets);
    logger.info({ observerId: observer.id, socketId: socket.id, ownerUserId: observer.ownerUserId }, 'AI copilot connected');
  }

  unregisterSocket(observerId: number, socketId: string): void {
    const sockets = this.copilotSockets.get(observerId);
    if (sockets) {
      sockets.delete(socketId);
      if (sockets.size === 0) {
        this.copilotSockets.delete(observerId);
      }
    }

    this.sessionRepo.closeActiveBySocket(observerId, socketId, 'closed');
    for (const [terminalSessionId, sessions] of this.activeSessions.entries()) {
      const filtered = sessions.filter((session) => !(session.observer.id === observerId && session.socketId === socketId));
      if (filtered.length === 0) {
        this.activeSessions.delete(terminalSessionId);
      } else {
        this.activeSessions.set(terminalSessionId, filtered);
      }
    }
  }

  startTerminalSession(input: { terminalSessionId: number; nodeId: number; userId: number }): void {
    const ownerObservers = this.observerRepo.listByOwner(input.userId);
    const active: ActiveCopilotSession[] = [];

    for (const observer of ownerObservers) {
      const sockets = this.copilotSockets.get(observer.id);
      if (!sockets || sockets.size === 0) {
        continue;
      }

      for (const socket of sockets.values()) {
        const copilotSession = this.sessionRepo.create({
          observerId: observer.id,
          terminalSessionId: input.terminalSessionId,
          nodeId: input.nodeId,
          ownerUserId: input.userId,
          socketId: socket.id,
        });
        socket.emit('session.started', {
          terminalSessionId: input.terminalSessionId,
          nodeId: input.nodeId,
          copilotSessionId: copilotSession.id,
        });
        active.push({ observer, copilotSession, socketId: socket.id });
      }
    }

    if (active.length > 0) {
      this.activeSessions.set(input.terminalSessionId, active);
    }
  }

  endTerminalSession(input: { terminalSessionId: number; nodeId: number; reason?: string }): void {
    const sessions = this.activeSessions.get(input.terminalSessionId) ?? [];
    if (sessions.length === 0) {
      return;
    }

    this.sessionRepo.closeActiveByTerminalSession(input.terminalSessionId, 'closed', input.reason);
    for (const session of sessions) {
      const socket = this.copilotSockets.get(session.observer.id)?.get(session.socketId);
      socket?.emit('session.ended', {
        terminalSessionId: input.terminalSessionId,
        nodeId: input.nodeId,
        reason: input.reason,
      });
    }
    this.activeSessions.delete(input.terminalSessionId);
  }

  storeSuggestion(
    observer: AIObserver,
    socketId: string,
    suggestionType: 'suggestion' | 'summary',
    payload: AICopilotSuggestionPayload
  ): AICopilotSuggestion {
    const parsed = suggestionPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      throw new Error('Invalid AI copilot payload');
    }
    const node = this.nodeRepo.getById(parsed.data.nodeId);
    if (!node || node.ownerUserId !== observer.ownerUserId) {
      throw new Error('Copilot cannot access this node');
    }

    const activeSession = this.resolveCopilotSession(observer.id, socketId, parsed.data.terminalSessionId, parsed.data.nodeId);
    const suggestion = this.suggestionRepo.create({
      observerId: observer.id,
      copilotSessionId: activeSession?.copilotSession.id,
      terminalSessionId: parsed.data.terminalSessionId ?? activeSession?.copilotSession.terminalSessionId,
      nodeId: parsed.data.nodeId,
      suggestionType,
      summary: parsed.data.summary,
      hypothesesJson: parsed.data.hypotheses ? JSON.stringify(parsed.data.hypotheses) : undefined,
      suggestedActionsJson: parsed.data.suggestedActions ? JSON.stringify(parsed.data.suggestedActions) : undefined,
      rawPayloadJson: parsed.data.rawPayload ? JSON.stringify(parsed.data.rawPayload) : undefined,
    });

    aiCopilotEvents.emit('suggestion', {
      ...suggestion,
      hypotheses: parsed.data.hypotheses ?? [],
      suggestedActions: parsed.data.suggestedActions ?? [],
    });
    logger.info(
      { observerId: observer.id, socketId, nodeId: parsed.data.nodeId, terminalSessionId: parsed.data.terminalSessionId, suggestionType },
      'AI copilot suggestion stored'
    );
    return suggestion;
  }

  handleToolCall(observer: AIObserver, socketId: string, requestId: string, payload: unknown): { requestId: string; tool: string; ok: boolean; data?: unknown; error?: string } {
    const schema = z.object({
      tool: z.enum(['terminal.snapshot', 'node.info', 'script.list']),
      nodeId: z.number().int().positive().optional(),
      terminalSessionId: z.number().int().positive().optional(),
      limit: z.number().int().positive().max(100).optional(),
    });

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      return { requestId, tool: 'unknown', ok: false, error: 'Invalid tool request' };
    }

    const { tool, nodeId, terminalSessionId, limit } = parsed.data;
    const session = this.resolveCopilotSession(observer.id, socketId, terminalSessionId, nodeId ?? 0);

    const targetNodeId = nodeId ?? session?.copilotSession.nodeId;
    if (!targetNodeId) {
      return { requestId, tool, ok: false, error: 'A nodeId or active terminal session is required' };
    }
    const node = this.nodeRepo.getById(targetNodeId);
    if (!node || node.ownerUserId !== observer.ownerUserId) {
      return { requestId, tool, ok: false, error: 'Node not found' };
    }

    if (tool === 'terminal.snapshot') {
      return {
        requestId,
        tool,
        ok: true,
        data: this.getTerminalSnapshot(targetNodeId, limit ?? 20),
      };
    }

    if (tool === 'node.info') {
      return {
        requestId,
        tool,
        ok: true,
        data: {
          id: node.id,
          name: node.name,
          description: node.description,
          connectionType: node.connectionType,
          host: node.host,
          port: node.port,
          baudRate: node.baudRate,
          dataBits: node.dataBits,
          parity: node.parity,
          stopBits: node.stopBits,
          isActive: node.isActive,
        },
      };
    }

    return {
      requestId,
      tool,
      ok: true,
      data: this.scriptRepo.getAll()
        .filter((script) => script.ownerUserId === observer.ownerUserId)
        .slice(0, limit ?? 20)
        .map((script) => ({
          id: script.id,
          name: script.name,
          description: script.description,
          defaultDelayMs: script.defaultDelayMs,
          timeoutMs: script.timeoutMs,
        })),
    };
  }

  private bindConnectionEvents(): void {
    if (this.connectionEventsBound) {
      return;
    }

    connectionEvents.on('data', ({ nodeId, data }: { nodeId: number; data: Buffer }) => {
      const entry: SnapshotChunk = {
        payloadBase64: data.toString('base64'),
        payloadLength: data.length,
        timestamp: new Date().toISOString(),
      };
      const current = this.recentSnapshots.get(nodeId) ?? [];
      current.push(entry);
      this.recentSnapshots.set(nodeId, current.slice(-MAX_SNAPSHOT_CHUNKS));
      this.forwardSerialData(nodeId, entry);
    });

    this.connectionEventsBound = true;
  }

  private forwardSerialData(nodeId: number, entry: SnapshotChunk): void {
    for (const sessions of this.activeSessions.values()) {
      for (const session of sessions) {
        if (session.copilotSession.nodeId !== nodeId) {
          continue;
        }
        const socket = this.copilotSockets.get(session.observer.id)?.get(session.socketId);
        if (!socket) {
          continue;
        }
        socket.emit('serial.data', {
          nodeId,
          terminalSessionId: session.copilotSession.terminalSessionId,
          copilotSessionId: session.copilotSession.id,
          ...entry,
        });
      }
    }
  }

  private getTerminalSnapshot(nodeId: number, limit: number) {
    const chunks = (this.recentSnapshots.get(nodeId) ?? []).slice(-limit);
    return {
      nodeId,
      chunkCount: chunks.length,
      chunks,
      textPreview: chunks
        .map((chunk) => Buffer.from(chunk.payloadBase64, 'base64').toString('utf-8'))
        .join('')
        .slice(-4000),
    };
  }

  private resolveCopilotSession(
    observerId: number,
    socketId: string,
    terminalSessionId: number | undefined,
    nodeId: number
  ): ActiveCopilotSession | undefined {
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
          session.copilotSession.nodeId === nodeId
      );
      if (match) {
        return match;
      }
    }
    return undefined;
  }
}
