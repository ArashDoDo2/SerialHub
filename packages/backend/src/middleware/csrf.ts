import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function matchesAllowedOrigin(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  try {
    const allowedOrigin = new URL(config.frontendUrl).origin;
    return new URL(value).origin === allowedOrigin;
  } catch (_error) {
    return false;
  }
}

export function verifySameOrigin(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    next();
    return;
  }

  const origin = req.get('origin');
  const referer = req.get('referer');
  if (matchesAllowedOrigin(origin) || matchesAllowedOrigin(referer)) {
    next();
    return;
  }

  res.status(403).json({ error: 'Origin validation failed' });
}
