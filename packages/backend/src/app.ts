import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { config } from './config/env.js';
import { logger } from './config/logger.js';
import { setSocketServer } from './config/realtime.js';
import { initDatabase } from './config/database.js';
import { runMigrations } from './config/migrations.js';
import { requestLogger } from './middleware/requestLogger.js';
import { verifySameOrigin } from './middleware/csrf.js';
import { SQLiteSessionStore } from './config/SQLiteSessionStore.js';
import apiRouter from './routes/index.js';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import { ensureAuthenticated, attachUser } from './middleware/auth.js';
import { SerialConnectionManager } from './services/SerialConnectionManager.js';
import { TerminalSessionService } from './services/TerminalSessionService.js';
import { UserService } from './services/UserService.js';
import { SerialNodeService } from './services/SerialNodeService.js';
import { AIObserverService } from './services/AIObserverService.js';
import { AICopilotService } from './services/AICopilotService.js';
import { AIAutomationService } from './services/AIAutomationService.js';
import { registerAppLifecycle } from './runtime/lifecycle.js';
import { registerAINamespaces } from './websocket/aiNamespaces.js';
import { registerTerminalGateway } from './websocket/terminalGateway.js';

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

registerTerminalGateway({
  io,
  sessionMiddleware,
  passport,
  terminalSessionService,
  serialConnectionManager,
  nodeService,
  userService,
});

registerAppLifecycle({
  server,
  sessionStore,
  terminalSessionService,
  serialConnectionManager,
  pruneIntervalMs: config.session.pruneIntervalMs,
});

registerAINamespaces({
  io,
  aiObserverService,
  aiCopilotService,
  aiAutomationService,
});

app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error({ err, path: req.path, userId: (req.user as Express.User | undefined)?.id }, 'Unhandled error');
  res.status(500).json({
    error: 'Internal server error',
    message: config.nodeEnv === 'development' ? err.message : undefined,
  });
});

if (require.main === module) {
  server.listen(config.port, () => {
    logger.info(`Server running on port ${config.port}`);
  });
}

export { app, server, io, logger, sessionMiddleware };
