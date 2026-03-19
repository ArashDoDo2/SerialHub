import { Server as HttpServer } from 'http';
import { closeDatabase, getDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import { SQLiteSessionStore } from '../config/SQLiteSessionStore.js';
import { SerialConnectionManager } from '../services/SerialConnectionManager.js';
import { TerminalSessionService } from '../services/TerminalSessionService.js';

interface RegisterAppLifecycleOptions {
  server: HttpServer;
  sessionStore: SQLiteSessionStore;
  terminalSessionService: TerminalSessionService;
  serialConnectionManager: SerialConnectionManager;
  pruneIntervalMs: number;
}

export function registerAppLifecycle({
  server,
  sessionStore,
  terminalSessionService,
  serialConnectionManager,
  pruneIntervalMs,
}: RegisterAppLifecycleOptions): NodeJS.Timeout {
  const maintenanceTimer = setInterval(() => {
    sessionStore.pruneExpired();
    terminalSessionService.cleanupExpired();
  }, pruneIntervalMs);

  const shutdown = (signal: 'SIGINT' | 'SIGTERM') => {
    logger.info(`Received ${signal}, shutting down gracefully`);
    clearInterval(maintenanceTimer);
    terminalSessionService.releaseAllActive('error');
    serialConnectionManager.closeAllConnections();
    getDatabase()
      .prepare(
        `UPDATE scriptRuns
         SET status = 'cancelled', finishedAt = datetime('now')
         WHERE status = 'running'`
      )
      .run();
    closeDatabase();
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => {
    shutdown('SIGINT');
  });

  process.on('SIGTERM', () => {
    shutdown('SIGTERM');
  });

  return maintenanceTimer;
}
