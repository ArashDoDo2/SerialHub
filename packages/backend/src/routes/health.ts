import { Router, Request, Response } from 'express';
import { getDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';

const healthRouter = Router();

// GET /health - Basic health check
healthRouter.get('/', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'SerialHub Backend',
  });
});

// GET /ready - Readiness check (includes database connectivity)
healthRouter.get('/ready', (req: Request, res: Response) => {
  try {
    // Simple database query to check connectivity
    const db = getDatabase();
    const result = db.prepare('SELECT 1 as health_check').get() as { health_check: number };

    if (result.health_check === 1) {
      res.json({
        status: 'ready',
        timestamp: new Date().toISOString(),
        database: 'connected',
      });
    } else {
      throw new Error('Database health check failed');
    }
  } catch (error) {
    logger.error(error, 'Readiness check failed');
    res.status(503).json({
      status: 'not ready',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default healthRouter;