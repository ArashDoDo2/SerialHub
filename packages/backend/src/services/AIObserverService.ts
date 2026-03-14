import EventEmitter from 'events';
import { z } from 'zod';
import { AIObservation, AIObservationRepository } from '../repositories/AIObservationRepository.js';
import { AIObserver, AIObserverRepository } from '../repositories/AIObserverRepository.js';
import { AIObserverSession, AIObserverSessionRepository } from '../repositories/AIObserverSessionRepository.js';
import { SerialNodeRepository } from '../repositories/SerialNodeRepository.js';
import { connectionEvents } from './SerialConnectionManager.js';
import { logger } from '../config/logger.js';

interface ObserverSocket {
  id: string;
  emit(event: string, payload: unknown): void;
}

interface ActiveObserverSession {
  observer: AIObserver;
  observerSession: AIObserverSession;
  socketId: string;
}

export interface AIObservationPayload {
  nodeId: number;
  terminalSessionId?: number;
  severity?: 'info' | 'warning' | 'critical';
  title?: string;
  content: string;
  rawPayload?: Record<string, unknown>;
}

const observationPayloadSchema = z.object({
  nodeId: z.number().int().positive(),
  terminalSessionId: z.number().int().positive().optional(),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
  title: z.string().max(200).optional(),
  content: z.string().min(1),
  rawPayload: z.record(z.unknown()).optional(),
});

export const aiObserverEvents = new EventEmitter();

export class AIObserverService {
  private static instance: AIObserverService;

  private observerRepo = new AIObserverRepository();
  private observerSessionRepo = new AIObserverSessionRepository();
  private observationRepo = new AIObservationRepository();
  private nodeRepo = new SerialNodeRepository();
  private observerSockets = new Map<number, Map<string, ObserverSocket>>();
  private activeSessions = new Map<number, ActiveObserverSession[]>();
  private connectionEventsBound = false;

  private constructor() {
    this.bindConnectionEvents();
  }

  static getInstance(): AIObserverService {
    if (!AIObserverService.instance) {
      AIObserverService.instance = new AIObserverService();
    }
    return AIObserverService.instance;
  }

  listObservers(ownerUserId: number): AIObserver[] {
    return this.observerRepo.listByOwner(ownerUserId);
  }

  listAllObservers(): AIObserver[] {
    return this.observerRepo.listAll();
  }

  createObserver(input: { name: string; endpoint: string; ownerUserId: number }): AIObserver {
    return this.observerRepo.create(input);
  }

  deleteObserver(id: number, ownerUserId: number): void {
    this.observerRepo.delete(id, ownerUserId);
  }

  deleteObserverAsAdmin(id: number): void {
    this.observerRepo.deleteAny(id);
  }

  listObservations(nodeId: number, ownerUserId: number, limit = 20): AIObservation[] {
    return this.observationRepo.listByNodeForOwner(nodeId, ownerUserId, limit);
  }

  listAllObservations(nodeId: number, limit = 20): AIObservation[] {
    return this.observationRepo.listByNode(nodeId, limit);
  }

  authenticateObserver(authToken: string): AIObserver | undefined {
    return this.observerRepo.getByAuthToken(authToken);
  }

  registerSocket(observer: AIObserver, socket: ObserverSocket): void {
    const sockets = this.observerSockets.get(observer.id) ?? new Map<string, ObserverSocket>();
    sockets.set(socket.id, socket);
    this.observerSockets.set(observer.id, sockets);
    logger.info({ observerId: observer.id, socketId: socket.id, ownerUserId: observer.ownerUserId }, 'AI observer connected');
  }

  unregisterSocket(observerId: number, socketId: string): void {
    const sockets = this.observerSockets.get(observerId);
    if (sockets) {
      sockets.delete(socketId);
      if (sockets.size === 0) {
        this.observerSockets.delete(observerId);
      }
    }

    this.observerSessionRepo.closeActiveBySocket(observerId, socketId, 'closed');
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
    const active: ActiveObserverSession[] = [];

    for (const observer of ownerObservers) {
      const sockets = this.observerSockets.get(observer.id);
      if (!sockets || sockets.size === 0) {
        continue;
      }

      for (const socket of sockets.values()) {
        const observerSession = this.observerSessionRepo.create({
          observerId: observer.id,
          terminalSessionId: input.terminalSessionId,
          nodeId: input.nodeId,
          ownerUserId: input.userId,
          socketId: socket.id,
        });
        socket.emit('session.started', {
          terminalSessionId: input.terminalSessionId,
          nodeId: input.nodeId,
          observerSessionId: observerSession.id,
        });
        active.push({
          observer,
          observerSession,
          socketId: socket.id,
        });
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

    this.observerSessionRepo.closeActiveByTerminalSession(input.terminalSessionId, 'closed', input.reason);
    for (const session of sessions) {
      const socket = this.observerSockets.get(session.observer.id)?.get(session.socketId);
      socket?.emit('session.ended', {
        terminalSessionId: input.terminalSessionId,
        nodeId: input.nodeId,
        reason: input.reason,
      });
    }
    this.activeSessions.delete(input.terminalSessionId);
  }

  storeObservation(
    observer: AIObserver,
    socketId: string,
    observationType: 'result' | 'summary',
    payload: AIObservationPayload
  ): AIObservation {
    const parsed = observationPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      throw new Error('Invalid AI observation payload');
    }
    const node = this.nodeRepo.getById(parsed.data.nodeId);
    if (!node || node.ownerUserId !== observer.ownerUserId) {
      throw new Error('Observer cannot access this node');
    }

    const activeSession = this.resolveObserverSession(observer.id, socketId, payload.terminalSessionId, payload.nodeId);
    const observation = this.observationRepo.create({
      observerId: observer.id,
      observerSessionId: activeSession?.observerSession.id,
      terminalSessionId: parsed.data.terminalSessionId ?? activeSession?.observerSession.terminalSessionId,
      nodeId: parsed.data.nodeId,
      observationType,
      severity: parsed.data.severity ?? 'info',
      title: parsed.data.title,
      content: parsed.data.content,
      rawPayloadJson: parsed.data.rawPayload ? JSON.stringify(parsed.data.rawPayload) : undefined,
    });

    aiObserverEvents.emit('observation', observation);
    logger.info(
      { observerId: observer.id, socketId, nodeId: parsed.data.nodeId, terminalSessionId: parsed.data.terminalSessionId, observationType },
      'AI observation stored'
    );
    return observation;
  }

  private bindConnectionEvents(): void {
    if (this.connectionEventsBound) {
      return;
    }

    connectionEvents.on('data', ({ nodeId, data }: { nodeId: number; data: Buffer }) => {
      this.forwardSerialData(nodeId, data);
    });

    this.connectionEventsBound = true;
  }

  private forwardSerialData(nodeId: number, data: Buffer): void {
    for (const sessions of this.activeSessions.values()) {
      for (const session of sessions) {
        if (session.observerSession.nodeId !== nodeId) {
          continue;
        }

        const socket = this.observerSockets.get(session.observer.id)?.get(session.socketId);
        if (!socket) {
          continue;
        }

        socket.emit('serial.data', {
          nodeId,
          terminalSessionId: session.observerSession.terminalSessionId,
          observerSessionId: session.observerSession.id,
          payloadBase64: data.toString('base64'),
          payloadLength: data.length,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  private resolveObserverSession(
    observerId: number,
    socketId: string,
    terminalSessionId: number | undefined,
    nodeId: number
  ): ActiveObserverSession | undefined {
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
          session.observerSession.nodeId === nodeId
      );
      if (match) {
        return match;
      }
    }

    return undefined;
  }
}
