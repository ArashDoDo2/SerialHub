import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { config } from './config/env.js';
import { logger } from './config/logger.js';
import { setSocketServer } from './config/realtime.js';
import { initDatabase, closeDatabase, getDatabase } from './config/database.js';
import { runMigrations } from './config/migrations.js';
import { requestLogger } from './middleware/requestLogger.js';
import { verifySameOrigin } from './middleware/csrf.js';
import { SQLiteSessionStore } from './config/SQLiteSessionStore.js';
import apiRouter from './routes/index.js';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import { ensureAuthenticated, attachUser, isOwnerOrAdmin } from './middleware/auth.js';
import { SerialConnectionManager, connectionEvents } from './services/SerialConnectionManager.js';
import { TerminalSessionService } from './services/TerminalSessionService.js';
import { UserService } from './services/UserService.js';
import { AIObserverService, aiObserverEvents } from './services/AIObserverService.js';
import { AICopilotService, aiCopilotEvents } from './services/AICopilotService.js';
import { AIAutomationService, aiAutomationEvents } from './services/AIAutomationService.js';
import { SerialNodeService } from './services/SerialNodeService.js';

const app = express();
if (config.trustProxy) {
  app.set('trust proxy', 1);
}

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: config.frontendUrl,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});
setSocketServer(io);

initDatabase();
runMigrations();

const passport = require('./config/passport.js').default;
const terminalSessionService = new TerminalSessionService();
const userService = new UserService();
const nodeService = new SerialNodeService();
const sessionStore = new SQLiteSessionStore();
const serialConnectionManager = SerialConnectionManager.getInstance();
const aiObserverService = AIObserverService.getInstance();
const aiCopilotService = AICopilotService.getInstance();
const aiAutomationService = AIAutomationService.getInstance();
const recoveredTerminalSessions = terminalSessionService.reconcileStartupSessions();
if (recoveredTerminalSessions > 0) {
  logger.warn(
    { recoveredTerminalSessions },
    'Recovered stale terminal sessions left active from a previous shutdown'
  );
}

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
  type: 'data' | 'telnet-command' | 'rfc2217' | 'control',
  direction: 'inbound' | 'outbound',
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

const attachLocalDevUser = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  if (!config.localAuth.enabled || req.user) {
    next();
    return;
  }

  const user = userService.findOrCreateLocalMaster();
  req.user = user;
  res.locals.user = user;
  req.isAuthenticated = (() => true) as typeof req.isAuthenticated;

  if (req.session) {
    (req.session as typeof req.session & { passport?: { user: number } }).passport = {
      user: user.id,
    };
  }

  next();
};

const sessionMiddleware = session({
  secret: config.session.secret,
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.nodeEnv === 'production',
    maxAge: config.session.maxAgeMs,
  },
});

app.use(
  cors({
    origin: config.frontendUrl,
    credentials: true,
  })
);
app.use(helmet());
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: true, limit: '256kb' }));
app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());
app.use(attachLocalDevUser);
app.use(requestLogger);
app.use(verifySameOrigin);

app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api', attachLocalDevUser, attachUser, ensureAuthenticated, apiRouter);

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

connectionEvents.on('telnetCommand', ({ nodeId, command, option }: { nodeId: number; command: number; option: number }) => {
  emitTraceToSubscribers(nodeId, 'telnet-command', 'inbound', Buffer.from([command, option]), {
    command,
    option,
  });
});

connectionEvents.on('telnetSubnegotiation', ({ nodeId, option, payload }: { nodeId: number; option: number; payload: Buffer }) => {
  emitTraceToSubscribers(nodeId, 'rfc2217', 'inbound', payload, {
    option,
  });
});

connectionEvents.on('degraded', ({ nodeId, reason, capabilities }: { nodeId: number; reason?: string; capabilities?: unknown }) => {
  for (const socketId of serialConnectionManager.getSubscriberIds(nodeId)) {
    io.to(socketId).emit('terminal:capabilities', {
      nodeId,
      state: serialConnectionManager.getState(nodeId),
      capabilities,
      degradedReason: reason,
    });
  }
});

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

const wrap = (middleware: any) => (socket: any, next: (error?: Error) => void) =>
  middleware(socket.request, {} as express.Response, next);

const maintenanceTimer = setInterval(() => {
  sessionStore.pruneExpired();
  terminalSessionService.cleanupExpired();
}, config.session.pruneIntervalMs);

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

const aiNamespace = io.of('/ai-observers');
aiNamespace.use((socket, next) => {
  const authToken = typeof socket.handshake.auth?.authToken === 'string' ? socket.handshake.auth.authToken : '';
  const observer = authToken ? aiObserverService.authenticateObserver(authToken) : undefined;
  if (!observer) {
    next(new Error('Unauthorized'));
    return;
  }
  socket.data.observer = observer;
  next();
});

const aiCopilotNamespace = io.of('/ai-copilot');
aiCopilotNamespace.use((socket, next) => {
  const authToken = typeof socket.handshake.auth?.authToken === 'string' ? socket.handshake.auth.authToken : '';
  const observer = authToken ? aiCopilotService.authenticateCopilot(authToken) : undefined;
  if (!observer) {
    next(new Error('Unauthorized'));
    return;
  }
  socket.data.observer = observer;
  next();
});

aiCopilotNamespace.on('connection', (socket) => {
  const observer = socket.data.observer;
  aiCopilotService.registerSocket(observer, socket);

  socket.on('copilot.suggestion', (payload: any) => {
    try {
      const suggestion = aiCopilotService.storeSuggestion(observer, socket.id, 'suggestion', payload);
      socket.emit('copilot.ack', { suggestionId: suggestion.id, suggestionType: 'suggestion' });
    } catch (error) {
      socket.emit('copilot.error', { error: error instanceof Error ? error.message : 'Invalid copilot.suggestion payload' });
    }
  });

  socket.on('copilot.summary', (payload: any) => {
    try {
      const suggestion = aiCopilotService.storeSuggestion(observer, socket.id, 'summary', payload);
      socket.emit('copilot.ack', { suggestionId: suggestion.id, suggestionType: 'summary' });
    } catch (error) {
      socket.emit('copilot.error', { error: error instanceof Error ? error.message : 'Invalid copilot.summary payload' });
    }
  });

  socket.on('tool.call', (payload: any) => {
    const requestId =
      typeof payload?.requestId === 'string' && payload.requestId.length > 0
        ? payload.requestId
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const response = aiCopilotService.handleToolCall(observer, socket.id, requestId, payload);
    socket.emit('tool.result', response);
  });

  socket.on('disconnect', () => {
    aiCopilotService.unregisterSocket(observer.id, socket.id);
  });
});

const aiAutomationNamespace = io.of('/ai-automation');
aiAutomationNamespace.use((socket, next) => {
  const authToken = typeof socket.handshake.auth?.authToken === 'string' ? socket.handshake.auth.authToken : '';
  const observer = authToken ? aiAutomationService.authenticateAgent(authToken) : undefined;
  if (!observer) {
    next(new Error('Unauthorized'));
    return;
  }
  socket.data.observer = observer;
  next();
});

aiAutomationNamespace.on('connection', (socket) => {
  const observer = socket.data.observer;
  aiAutomationService.registerSocket(observer, socket);

  socket.on('action.propose', async (payload: any) => {
    try {
      const result = await aiAutomationService.proposeAction(observer, socket.id, payload);
      socket.emit('action.ack', {
        actionId: result.action.id,
        status: result.action.status,
        result: result.result,
      });
    } catch (error) {
      socket.emit('action.error', { error: error instanceof Error ? error.message : 'Invalid action proposal' });
    }
  });

  socket.on('disconnect', () => {
    aiAutomationService.unregisterSocket(observer.id, socket.id);
  });
});

aiNamespace.on('connection', (socket) => {
  const observer = socket.data.observer;
  aiObserverService.registerSocket(observer, socket);

  socket.on('analysis.result', (payload: any) => {
    try {
      const observation = aiObserverService.storeObservation(observer, socket.id, 'result', payload);
      socket.emit('analysis.ack', { observationId: observation.id, observationType: 'result' });
    } catch (error) {
      socket.emit('analysis.error', { error: error instanceof Error ? error.message : 'Invalid analysis.result payload' });
    }
  });

  socket.on('analysis.summary', (payload: any) => {
    try {
      const observation = aiObserverService.storeObservation(observer, socket.id, 'summary', payload);
      socket.emit('analysis.ack', { observationId: observation.id, observationType: 'summary' });
    } catch (error) {
      socket.emit('analysis.error', { error: error instanceof Error ? error.message : 'Invalid analysis.summary payload' });
    }
  });

  socket.on('disconnect', () => {
    aiObserverService.unregisterSocket(observer.id, socket.id);
  });
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
    logger.debug({ socketId: socket.id, userId: user.id, debugEnabled: socket.data.debugEnabled }, 'Terminal debug mode changed');
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
    const activeSession = controllerKey ? terminalSessionService.getActiveByController(controllerKey as string) : undefined;
    if (!nodeId || !controllerKey || !activeSession || activeSession.nodeId !== nodeId || activeSession.userId !== user.id) {
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
    if (!nodeId || !payload.data || !activeSession || activeSession.nodeId !== nodeId || activeSession.userId !== user.id) {
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

app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error({ err, path: req.path, userId: (req.user as Express.User | undefined)?.id }, 'Unhandled error');
  res.status(500).json({
    error: 'Internal server error',
    message: config.nodeEnv === 'development' ? err.message : undefined,
  });
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully');
  clearInterval(maintenanceTimer);
  terminalSessionService.releaseAllActive('error');
  serialConnectionManager.closeAllConnections();
  getDatabase().prepare(
    `UPDATE scriptRuns
     SET status = 'cancelled', finishedAt = datetime('now')
     WHERE status = 'running'`
  ).run();
  closeDatabase();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  clearInterval(maintenanceTimer);
  terminalSessionService.releaseAllActive('error');
  serialConnectionManager.closeAllConnections();
  getDatabase().prepare(
    `UPDATE scriptRuns
     SET status = 'cancelled', finishedAt = datetime('now')
     WHERE status = 'running'`
  ).run();
  closeDatabase();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

if (require.main === module) {
  server.listen(config.port, () => {
    logger.info(`Server running on port ${config.port}`);
  });
}

export { app, server, io, logger, sessionMiddleware };
