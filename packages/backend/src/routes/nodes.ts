import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { SerialNodeService } from '../services/SerialNodeService.js';
import { isAdmin, isOwnerOrAdmin } from '../middleware/auth.js';

const router = Router();
const service = new SerialNodeService();

const nodeSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().optional(),
  connectionType: z.enum(['raw-tcp', 'rfc2217']).default('raw-tcp'),
  host: z.string().trim().min(1),
  port: z.coerce.number().int().positive(),
  baudRate: z.coerce.number().int().positive(),
  dataBits: z.coerce.number().int().min(5).max(8),
  parity: z.enum(['none', 'even', 'odd', 'mark', 'space']),
  stopBits: z.coerce.number().min(1).max(2),
  isActive: z.coerce.boolean().optional(),
});

// list
router.get('/', (req: Request, res: Response) => {
  const user = req.user as Express.User;
  const nodes = isAdmin(user) ? service.list() : service.listForOwner(user.id);
  res.json(nodes);
});

// create
router.post('/', (req: Request, res: Response) => {
  const parse = nodeSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ errors: parse.error.format() });
  }
  const userId = (req.user as Express.User).id;
  const node = service.create({ ...parse.data, ownerUserId: userId });
  res.status(201).json(node);
});

// get by id
router.get('/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const node = service.get(id);
  if (!node) {
    return res.status(404).json({ error: 'Not found' });
  }
  if (!isOwnerOrAdmin(node.ownerUserId, req.user as Express.User)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.json(node);
});

// update
router.put('/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const existing = service.get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Not found' });
  }
  if (!isOwnerOrAdmin(existing.ownerUserId, req.user as Express.User)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const parse = nodeSchema.partial().safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ errors: parse.error.format() });
  }
  const node = service.update(id, parse.data);
  if (!node) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.json(node);
});

// delete
router.delete('/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const existing = service.get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Not found' });
  }
  if (!isOwnerOrAdmin(existing.ownerUserId, req.user as Express.User)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  service.delete(id);
  res.status(204).end();
});

// connection test
router.post('/:id/test', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  try {
    const node = service.get(id);
    if (!node) {
      return res.status(404).json({ error: 'Not found' });
    }
    if (!isOwnerOrAdmin(node.ownerUserId, req.user as Express.User)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const status = await service.testConnection(id);
    res.json({ status });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

export default router;
