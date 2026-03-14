import dotenv from 'dotenv';

dotenv.config();

const sessionSecret = process.env.SESSION_SECRET || '';
const localAuthEnabled = process.env.LOCAL_AUTH_ENABLED === 'true';
const localAuthPassword = process.env.LOCAL_AUTH_PASSWORD || 'master123456';
const nodeEnv = process.env.NODE_ENV || 'development';

if (nodeEnv === 'production' && (!sessionSecret || sessionSecret === 'default_secret_change_in_production')) {
  throw new Error('SESSION_SECRET must be set to a non-default value in production');
}

if (localAuthEnabled && nodeEnv !== 'development') {
  throw new Error('LOCAL_AUTH_ENABLED is only supported in development');
}

export const config = {
  nodeEnv,
  port: parseInt(process.env.PORT || '3001', 10),
  trustProxy: process.env.TRUST_PROXY === 'true',
  database: {
    path: process.env.DATABASE_PATH || './data/serialhub.db',
  },
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  backendUrl: process.env.BACKEND_URL || `http://localhost:${process.env.PORT || '3001'}`,
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackUrl: process.env.GOOGLE_CALLBACK_URL || `${process.env.BACKEND_URL || `http://localhost:${process.env.PORT || '3001'}`}/api/auth/google/callback`,
  },
  localAuth: {
    enabled: localAuthEnabled,
    email: process.env.LOCAL_AUTH_EMAIL || 'master@serialhub.local',
    password: localAuthPassword,
    name: process.env.LOCAL_AUTH_NAME || 'Local Master',
  },
  session: {
    secret: sessionSecret || 'default_secret_change_in_production',
    maxAgeMs: parseInt(process.env.SESSION_MAX_AGE_MS || `${24 * 60 * 60 * 1000}`, 10),
    pruneIntervalMs: parseInt(process.env.SESSION_PRUNE_INTERVAL_MS || `${15 * 60 * 1000}`, 10),
  },
  terminal: {
    sessionTtlMs: parseInt(process.env.TERMINAL_SESSION_TTL_MS || `${60 * 1000}`, 10),
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};
