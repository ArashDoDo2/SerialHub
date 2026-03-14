import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { ScriptService } from '../services/ScriptService.js';
import { isAdmin, isOwnerOrAdmin } from '../middleware/auth.js';

const router = Router();
const service = new ScriptService();

router.get('/', (req: Request, res: Response) => {
  const user = req.user as Express.User;
  const runs = isAdmin(user) ? service.listAllRuns() : service.listAllRunsForOwner(user.id);
  res.json(runs);
});

router.get('/:id', (req: Request, res: Response) => {
  const result = service.getRunLog(Number(req.params.id));
  if (!result) {
    return res.status(404).json({ error: 'Run not found' });
  }
  if (!result.run) {
    return res.status(404).json({ error: 'Run not found' });
  }
  if (!isOwnerOrAdmin(result.run.ownerUserId, req.user as Express.User)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  return res.json({
    ...result.run,
    output: result.output,
  });
});

router.get('/:id/log', (req: Request, res: Response) => {
  const result = service.getRunLog(Number(req.params.id));
  if (!result || !result.run?.outputFilePath || !fs.existsSync(result.run.outputFilePath)) {
    return res.status(404).json({ error: 'Log not found' });
  }
  if (!isOwnerOrAdmin(result.run.ownerUserId, req.user as Express.User)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  return res.download(result.run.outputFilePath, path.basename(result.run.outputFilePath));
});

export default router;
