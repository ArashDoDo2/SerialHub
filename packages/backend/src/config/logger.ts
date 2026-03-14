import pino from 'pino';
import { config } from './env.js';

export const logger = pino({
  level: config.logging.level,
  transport: config.nodeEnv === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
    },
  } : undefined,
});