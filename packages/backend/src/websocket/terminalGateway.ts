import express from 'express';
import { Server } from 'socket.io';
import { logger } from '../config/logger.js';
import { isOwnerOrAdmin } from '../middleware/auth.js';
import { SerialConnectionManager, connectionEvents } from '../services/SerialConnectionManager.js';
import { SerialNodeService } from '../services/SerialNodeService.js';
import { TerminalSessionService } from '../services/TerminalSessionService.js';
import { aiAutomationEvents } from '../services/AIAutomationService.js';
import { aiCopilotEvents } from '../services/AICopilotService.js';
import { aiObserverEvents } from '../services/AIObserverService.js';
import { UserService } from '../services/UserService.js';
import { config } from '../config/env.js';

type TraceType = 'data' | 'telnet-command' | 'rfc2217' | 'control';
type TraceDirection = 'inbound' | 'outbound';

interface RegisterTerminalGatewayOptions {
  io: Server;
  sessionMiddleware: any;
  passport: any;
  terminalSessionService: TerminalSessionService;
  serialConnectionManager: SerialConnectionManager;
  nodeService: SerialNodeService;
  userService: UserService;
}

const wrap = (middleware: any) => (socket: any, next: (error?: Error) => void) =>
  middleware(socket.request, {} as express.Response, next);

export function registerTerminalGateway({
  io,
  sessionMiddleware,
  passport,
  terminalSessionService,
  serialConnectionManager,
  nodeService,
  userService,
}: RegisterTerminalGatewayOptions): void {
  const emitCapabilitySnapshot = (socketId: string, nodeId: number) => {
    const capabilities = serialConnectionManager.getCapabilities(nodeId);
    io.to(socketId).emit('terminal:capabilities', {
      nodeId,
      state: serialConnectionManager.getState(nodeId),
      capabilities,
    });
  };

  const emitTraceToSubscribers = (
    nodeId: number,
    type: TraceType,
    direction: TraceDirection,
    payload: Buffer,
    extra: Record<string, unknown> = {}
  ) => {
    for (const socketId of serialConnectionManager.getSubscriberIds(nodeId)) {
      const socket = io.sockets.sockets.get(socketId);
      if (!socket?.data?.debugEnabled) {
        continue;
      }

      io.to(socketId).emit('terminal:trace', {
        nodeId,
        direction,
        type,
        payloadBase64: payload.toString('base64'),
        payloadLength: payload.length,
        timestamp: new Date().toISOString(),
        ...extra,
      });
    }
  };

  connectionEvents.on('data', ({ nodeId, data }: { nodeId: number; data: Buffer }) => {
    const text = data.toString('utf-8');
    for (const socketId of serialConnectionManager.getSubscriberIds(nodeId)) {
      io.to(socketId).emit('terminal:data', {
        nodeId,
        data: text,
        payloadBase64: data.toString('base64'),
        payloadLength: data.length,
      });
    }
    emitTraceToSubscribers(nodeId, 'data', 'inbound', data);
  });

  connectionEvents.on('state', ({ nodeId, state }: { nodeId: number; state: string }) => {
    const event =
      state === 'connected' || state === 'ready'
        ? 'terminal:connected'
        : state === 'disconnected'
          ? 'terminal:disconnected'
          : state === 'error'
            ? 'terminal:error'
            : undefined;

    if (!event) {
      return;
    }

    for (const socketId of serialConnectionManager.getSubscriberIds(nodeId)) {
      io.to(socketId).emit(event, { nodeId });
      emitCapabilitySnapshot(socketId, nodeId);
    }
  });

  connectionEvents.on('transportError', ({ nodeId, error }: { nodeId: number; error: Error }) => {
    for (const socketId of serialConnectionManager.getSubscriberIds(nodeId)) {
      io.to(socketId).emit('terminal:error', { nodeId, error: error.message });
    }
    emitTraceToSubscribers(nodeId, 'control', 'inbound', Buffer.from(error.message, 'utf-8'), {
      error: error.message,
    });
  });

  connectionEvents.on(
    'telnetCommand',
    ({ nodeId, command, option }: { nodeId: number; command: number; option: number }) => {
      emitTraceToSubscribers(nodeId, 'telnet-command', 'inbound', Buffer.from([command, option]), {
        command,
        option,
      });
    }
  );

  connectionEvents.on(
    'telnetSubnegotiation',
    ({ nodeId, option, payload }: { nodeId: number; option: number; payload: Buffer }) => {
      emitTraceToSubscribers(nodeId, 'rfc2217', 'inbound', payload, {
        option,
      });
    }
  );

  connectionEvents.on(
    'degraded',
    ({ nodeId, reason, capabilities }: { nodeId: number; reason?: string; capabilities?: unknown }) => {
      for (const socketId of serialConnectionManager.getSubscriberIds(nodeId)) {
        io.to(socketId).emit('terminal:capabilities', {
          nodeId,
          state: serialConnectionManager.getState(nodeId),
          capabilities,
          degradedReason: reason,
        });
      }
    }
  );

  aiObserverEvents.on('observation', (observation) => {
    for (const socketId of serialConnectionManager.getSubscriberIds(observation.nodeId)) {
      io.to(socketId).emit('ai:observation', observation);
    }
  });

  aiCopilotEvents.on('suggestion', (suggestion) => {
    for (const socketId of serialConnectionManager.getSubscriberIds(suggestion.nodeId)) {
      io.to(socketId).emit('ai:copilot:suggestion', suggestion);
    }
  });

  aiAutomationEvents.on('action', (action) => {
    for (const socketId of serialConnectionManager.getSubscriberIds(action.nodeId)) {
      io.to(socketId).emit('ai:automation:action', action);
    }
  });

  aiAutomationEvents.on('session', (session) => {
    for (const socketId of serialConnectionManager.getSubscriberIds(session.nodeId)) {
      io.to(socketId).emit('ai:automation:session', session);
    }
  });

  io.use(wrap(sessionMiddleware));
  io.use(wrap(passport.initialize()));
  io.use(wrap(passport.session()));
  io.use((socket, next) => {
    const request = socket.request as any;
    if (!request.user && config.localAuth.enabled) {
      request.user = userService.findOrCreateLocalMaster();
    }
    const user = request.user as Express.User | undefined;
    if (!user) {
      next(new Error('Unauthorized'));
      return;
    }
    next();
  });

  io.on('connection', (socket) => {
    const user = (socket.request as any).user as Express.User;
    logger.info({ socketId: socket.id, userId: user.id }, 'Client connected');
    socket.data.debugEnabled = false;

    const userCanAccessNode = (nodeId: number): boolean => {
      const node = nodeService.get(nodeId);
      return Boolean(node) && isOwnerOrAdmin(node!.ownerUserId, user);
    };

    socket.on('terminal:debug:set', (payload: { enabled?: boolean }) => {
      socket.data.debugEnabled = Boolean(payload.enabled);
      logger.debug(
        { socketId: socket.id, userId: user.id, debugEnabled: socket.data.debugEnabled },
        'Terminal debug mode changed'
      );
      if (socket.data.nodeId) {
        emitCapabilitySnapshot(socket.id, socket.data.nodeId as number);
      }
    });

    socket.on('terminal:subscribe', (payload: { nodeId: number; controllerKey: string; sessionId?: number }) => {
      if (!userCanAccessNode(payload.nodeId)) {
        socket.emit('terminal:error', { nodeId: payload.nodeId, error: 'Forbidden' });
        return;
      }
      const activeSession = terminalSessionService.getActiveByController(payload.controllerKey);
      if (!activeSession || activeSession.nodeId !== payload.nodeId || activeSession.userId !== user.id) {
        socket.emit('terminal:error', { nodeId: payload.nodeId, error: 'Terminal control session not acquired' });
        return;
      }

      terminalSessionService.bindSocket(payload.controllerKey, socket.id);
      serialConnectionManager.subscribe(payload.nodeId, socket.id);
      socket.data.nodeId = payload.nodeId;
      socket.data.controllerKey = payload.controllerKey;
      socket.data.sessionId = payload.sessionId;
      emitCapabilitySnapshot(socket.id, payload.nodeId);
      logger.info(
        { nodeId: payload.nodeId, socketId: socket.id, userId: user.id, sessionId: payload.sessionId },
        'Subscribed to node'
      );
    });

    socket.on('terminal:unsubscribe', (payload: { nodeId: number; controllerKey?: string; sessionId?: number }) => {
      const controllerKey = payload.controllerKey ?? socket.data.controllerKey;
      serialConnectionManager.unsubscribe(payload.nodeId, socket.id);
      if (controllerKey) {
        if (!terminalSessionService.releaseIfControlledBySocket(controllerKey, socket.id, 'closed')) {
          socket.emit('terminal:error', { nodeId: payload.nodeId, error: 'Forbidden' });
          return;
        }
      }
      if (socket.data.nodeId === payload.nodeId) {
        delete socket.data.nodeId;
      }
      delete socket.data.controllerKey;
      delete socket.data.sessionId;
      if (!serialConnectionManager.hasSubscribers(payload.nodeId)) {
        serialConnectionManager.closeConnection(payload.nodeId);
      }
      logger.info(
        { nodeId: payload.nodeId, socketId: socket.id, userId: user.id, sessionId: payload.sessionId },
        'Unsubscribed from node'
      );
    });

    socket.on('terminal:heartbeat', (payload: { nodeId?: number; controllerKey?: string; sessionId?: number }) => {
      const nodeId = payload.nodeId ?? socket.data.nodeId;
      const controllerKey = payload.controllerKey ?? socket.data.controllerKey;
      if (!nodeId || !userCanAccessNode(nodeId as number)) {
        socket.emit('terminal:error', { nodeId, error: 'Forbidden' });
        return;
      }
      const activeSession = controllerKey
        ? terminalSessionService.getActiveByController(controllerKey as string)
        : undefined;
      if (
        !nodeId ||
        !controllerKey ||
        !activeSession ||
        activeSession.nodeId !== nodeId ||
        activeSession.userId !== user.id
      ) {
        socket.emit('terminal:error', { nodeId, error: 'Terminal control session expired' });
        return;
      }

      terminalSessionService.touch(controllerKey as string);
      socket.emit('terminal:heartbeat:ack', {
        nodeId,
        sessionId: payload.sessionId ?? socket.data.sessionId,
      });
    });

    socket.on('terminal:input', (payload: { nodeId?: number; data: string }) => {
      const nodeId = payload.nodeId ?? socket.data.nodeId;
      const controllerKey = socket.data.controllerKey as string | undefined;
      if (!nodeId || !userCanAccessNode(nodeId as number)) {
        socket.emit('terminal:error', { nodeId, error: 'Forbidden' });
        return;
      }
      const activeSession = controllerKey ? terminalSessionService.getActiveByController(controllerKey) : undefined;
      if (
        !nodeId ||
        !payload.data ||
        !activeSession ||
        activeSession.nodeId !== nodeId ||
        activeSession.userId !== user.id
      ) {
        socket.emit('terminal:error', { nodeId, error: 'Unauthorized terminal write attempt' });
        return;
      }

      if (controllerKey) {
        terminalSessionService.touch(controllerKey);
      }
      try {
        emitTraceToSubscribers(nodeId, 'data', 'outbound', Buffer.from(payload.data, 'utf-8'), {
          sessionId: socket.data.sessionId,
        });
        serialConnectionManager.write(nodeId, payload.data);
      } catch (error) {
        socket.emit('terminal:error', {
          nodeId,
          error: error instanceof Error ? error.message : 'Failed to write to terminal',
        });
      }
    });

    socket.on('disconnect', () => {
      const affectedNodes = serialConnectionManager.unsubscribeAll(socket.id);
      if (socket.data.controllerKey) {
        terminalSessionService.release(socket.data.controllerKey as string, 'closed');
      }
      for (const nodeId of affectedNodes) {
        if (!serialConnectionManager.hasSubscribers(nodeId)) {
          serialConnectionManager.closeConnection(nodeId);
        }
      }
      logger.info({ socketId: socket.id, userId: user.id, sessionId: socket.data.sessionId }, 'Client disconnected');
    });
  });
}
