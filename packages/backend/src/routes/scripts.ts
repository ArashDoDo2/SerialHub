import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { ScriptService } from '../services/ScriptService.js';
import { SerialNodeService } from '../services/SerialNodeService.js';
import { isAdmin, isOwnerOrAdmin } from '../middleware/auth.js';

const router = Router();
const service = new ScriptService();
const nodeService = new SerialNodeService();

const commandSchema = z.object({
  text: z.string().min(1),
  delayMs: z.number().int().nonnegative().optional(),
});

const scriptSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  commands: z.array(commandSchema).min(1),
  defaultDelayMs: z.number().int().nonnegative().default(100),
  timeoutMs: z.number().int().positive().default(30000),
});

const executeSchema = z.object({
  nodeId: z.number().int().positive(),
});

router.get('/', (req: Request, res: Response) => {
  const user = req.user as Express.User;
  res.json(isAdmin(user) ? service.list() : service.listForOwner(user.id));
});

router.post('/', (req: Request, res: Response) => {
  const parsed = scriptSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.format() });
  }

  const userId = (req.user as any)?.id;
  const script = service.create({
    name: parsed.data.name,
    description: parsed.data.description,
    commandsJson: JSON.stringify(parsed.data.commands),
    defaultDelayMs: parsed.data.defaultDelayMs,
    timeoutMs: parsed.data.timeoutMs,
    ownerUserId: userId,
  });

  return res.status(201).json(service.get(script.id));
});

router.get('/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const user = req.user as Express.User;
  const script = isAdmin(user) ? service.get(id) : service.getForOwner(id, user.id);
  if (!script) {
    return res.status(404).json({ error: 'Script not found' });
  }

  return res.json(script);
});

router.put('/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const existing = service.get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Script not found' });
  }
  if (!isOwnerOrAdmin(existing.ownerUserId, req.user as Express.User)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const parsed = scriptSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.format() });
  }

  const updatePayload: Record<string, unknown> = {
    ...parsed.data,
  };
  if (parsed.data.commands) {
    updatePayload.commandsJson = JSON.stringify(parsed.data.commands);
    delete updatePayload.commands;
  }

  const updated = service.update(id, updatePayload as any);
  if (!updated) {
    return res.status(404).json({ error: 'Script not found' });
  }

  return res.json(service.get(id));
});

router.delete('/:id', (req: Request, res: Response) => {
  const existing = service.get(Number(req.params.id));
  if (!existing) {
    return res.status(404).json({ error: 'Script not found' });
  }
  if (!isOwnerOrAdmin(existing.ownerUserId, req.user as Express.User)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  service.delete(Number(req.params.id));
  return res.status(204).end();
});

router.post('/:id/execute', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const existing = service.get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Script not found' });
  }
  const user = req.user as Express.User;
  if (!isOwnerOrAdmin(existing.ownerUserId, user)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const parsed = executeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.format() });
  }

  try {
    const node = nodeService.get(parsed.data.nodeId);
    if (!node) {
      return res.status(404).json({ error: 'Node not found' });
    }
    if (!isOwnerOrAdmin(node.ownerUserId, user)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (user.role !== 'admin' && node.ownerUserId !== existing.ownerUserId) {
      return res.status(403).json({ error: 'Script and node belong to different owners' });
    }
    const userId = (req.user as any)?.id;
    const runId = await service.runScript(id, parsed.data.nodeId, userId);
    return res.status(202).json({ runId });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Execution failed' });
  }
});

router.get('/:id/runs', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const user = req.user as Express.User;
  const existing = service.get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Script not found' });
  }
  if (!isOwnerOrAdmin(existing.ownerUserId, user)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.json(isAdmin(user) ? service.listRuns(id) : service.listRunsForOwner(id, user.id));
});

export default router;
