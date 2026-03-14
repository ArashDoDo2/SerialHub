import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import passport from '../config/passport.js';
import { config } from '../config/env.js';
import { UserService } from '../services/UserService.js';

const authRouter = Router();
const userService = new UserService();
const localLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// initiate google OAuth
authRouter.get('/google', (req: Request, res: Response, next) => {
  if (!config.google.clientId || !config.google.clientSecret) {
    res.status(503).json({ error: 'Google OAuth is not configured' });
    return;
  }
  req.session.oauthState = crypto.randomBytes(16).toString('hex');
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    state: req.session.oauthState,
  })(req, res, next);
});

// callback
authRouter.get(
  '/google/callback',
  (req: Request, res: Response, next) => {
    if (!req.query.state || req.query.state !== req.session.oauthState) {
      res.status(401).json({ error: 'Invalid OAuth state' });
      return;
    }
    delete req.session.oauthState;
    next();
  },
  passport.authenticate('google', { failureRedirect: '/api/auth/google/failure' }),
  (req: Request, res: Response) => {
    // Successful authentication, redirect or return user
    res.redirect('/');
  }
);

// failure placeholder
authRouter.get('/google/failure', (req: Request, res: Response) => {
  res.status(401).json({ error: 'Google authentication failed' });
});

authRouter.post('/login', (req: Request, res: Response, next) => {
  if (!config.localAuth.enabled) {
    res.status(404).json({ error: 'Local authentication is disabled' });
    return;
  }

  const parsed = localLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ errors: parsed.error.format() });
    return;
  }

  if (
    parsed.data.email !== config.localAuth.email ||
    parsed.data.password !== config.localAuth.password
  ) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const user = userService.findOrCreateLocalMaster();
  req.login(user, (error) => {
    if (error) {
      next(error);
      return;
    }
    res.json({ success: true, user });
  });
});

// logout
authRouter.post('/logout', (req: Request, res: Response) => {
  req.logout(err => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    req.session.destroy((destroyError) => {
      if (destroyError) {
        return res.status(500).json({ error: 'Logout failed' });
      }
      res.clearCookie('connect.sid');
      res.json({ success: true });
    });
  });
});

// current user
authRouter.get('/me', (req: Request, res: Response) => {
  if (req.user) {
    res.json({ user: req.user });
  } else {
    res.status(401).json({ user: null });
  }
});

export default authRouter;
