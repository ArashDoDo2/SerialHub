import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env.js';
import { UserService } from '../services/UserService.js';

const userService = new UserService();

function ensureLocalMaster(req: Request): void {
  if (!config.localAuth.enabled || req.user) {
    return;
  }

  const user = userService.findOrCreateLocalMaster();
  req.user = user;
  req.isAuthenticated = (() => true) as typeof req.isAuthenticated;
}

export function ensureAuthenticated(req: Request, res: Response, next: NextFunction) {
  ensureLocalMaster(req);
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized' });
}

export function attachUser(req: Request, res: Response, next: NextFunction) {
  if (req.user) {
    res.locals.user = req.user;
  }
  next();
}

export function isAdmin(user: Express.User | undefined): boolean {
  return user?.role === 'admin';
}

export function isOwnerOrAdmin(ownerUserId: number, user: Express.User | undefined): boolean {
  return Boolean(user) && (user!.id === ownerUserId || isAdmin(user));
}

export function requireRole(role: 'admin' | 'user') {
  return (req: Request, res: Response, next: NextFunction) => {
    ensureLocalMaster(req);
    const user: any = req.user;
    if (user && user.role === role) {
      return next();
    }
    res.status(403).json({ error: 'Forbidden' });
  };
}
