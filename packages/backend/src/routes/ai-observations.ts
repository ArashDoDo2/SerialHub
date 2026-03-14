import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { AIObserverService } from '../services/AIObserverService.js';
import { SerialNodeService } from '../services/SerialNodeService.js';
import { isAdmin, isOwnerOrAdmin } from '../middleware/auth.js';

const router = Router();
const service = AIObserverService.getInstance();
const nodeService = new SerialNodeService();

const querySchema = z.object({
  nodeId: z.coerce.number().int().positive(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

router.get('/', (req: Request, res: Response) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.format() });
  }

  const user = req.user as Express.User;
  const node = nodeService.get(parsed.data.nodeId);
  if (!node) {
    return res.status(404).json({ error: 'Node not found' });
  }
  if (!isOwnerOrAdmin(node.ownerUserId, user)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.json(
    isAdmin(user)
      ? service.listAllObservations(parsed.data.nodeId, parsed.data.limit ?? 20)
      : service.listObservations(parsed.data.nodeId, user.id, parsed.data.limit ?? 20)
  );
});

export default router;
