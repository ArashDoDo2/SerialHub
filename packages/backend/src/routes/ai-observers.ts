import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { AIObserverService } from '../services/AIObserverService.js';
import { isAdmin } from '../middleware/auth.js';

const router = Router();
const service = AIObserverService.getInstance();

const createSchema = z.object({
  name: z.string().min(1),
  endpoint: z.string().min(1),
});

router.get('/', (req: Request, res: Response) => {
  const user = req.user as Express.User;
  res.json(isAdmin(user) ? service.listAllObservers() : service.listObservers(user.id));
});

router.post('/', (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.format() });
  }

  const userId = (req.user as Express.User).id;
  const observer = service.createObserver({
    ...parsed.data,
    ownerUserId: userId,
  });
  return res.status(201).json(observer);
});

router.delete('/:id', (req: Request, res: Response) => {
  const observerId = Number(req.params.id);
  if (!Number.isInteger(observerId) || observerId <= 0) {
    return res.status(400).json({ error: 'Invalid observer id' });
  }

  const user = req.user as Express.User;
  if (isAdmin(user)) {
    service.deleteObserverAsAdmin(observerId);
  } else {
    service.deleteObserver(observerId, user.id);
  }
  return res.status(204).end();
});

export default router;
