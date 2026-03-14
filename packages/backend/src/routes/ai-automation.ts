import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { AIAutomationService } from '../services/AIAutomationService.js';
import { SerialNodeService } from '../services/SerialNodeService.js';
import { isAdmin, isOwnerOrAdmin } from '../middleware/auth.js';

const router = Router();
const service = AIAutomationService.getInstance();
const nodeService = new SerialNodeService();

const sessionSchema = z.object({
  terminalSessionId: z.number().int().positive(),
  nodeId: z.number().int().positive(),
});

router.get('/actions', (req: Request, res: Response) => {
  const nodeId = Number(req.query.nodeId);
  const limit = req.query.limit ? Number(req.query.limit) : 20;
  if (!Number.isInteger(nodeId) || nodeId <= 0) {
    return res.status(400).json({ error: 'Invalid nodeId' });
  }
  const user = req.user as Express.User;
  const node = nodeService.get(nodeId);
  if (!node) {
    return res.status(404).json({ error: 'Node not found' });
  }
  if (!isOwnerOrAdmin(node.ownerUserId, user)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  return res.json(
    isAdmin(user)
      ? service.listAllActions(nodeId, Number.isInteger(limit) && limit > 0 ? limit : 20)
      : service.listActions(nodeId, user.id, Number.isInteger(limit) && limit > 0 ? limit : 20)
  );
});

router.get('/sessions/:terminalSessionId', (req: Request, res: Response) => {
  const terminalSessionId = Number(req.params.terminalSessionId);
  if (!Number.isInteger(terminalSessionId) || terminalSessionId <= 0) {
    return res.status(400).json({ error: 'Invalid terminalSessionId' });
  }
  try {
    const userId = (req.user as Express.User).id;
    return res.json(service.getSessionStatus(terminalSessionId, userId));
  } catch (error) {
    return res.status(404).json({ error: error instanceof Error ? error.message : 'Session not found' });
  }
});

router.post('/sessions/start', (req: Request, res: Response) => {
  const parsed = sessionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.format() });
  }
  try {
    const userId = (req.user as Express.User).id;
    return res.json(service.enableTerminalSession({ ...parsed.data, userId }));
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to start AI automation session' });
  }
});

router.post('/sessions/stop', (req: Request, res: Response) => {
  const parsed = sessionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.format() });
  }
  const userId = (req.user as Express.User).id;
  return res.json(service.disableTerminalSession({ ...parsed.data, userId, reason: 'stopped_by_user' }));
});

router.post('/actions/:id/approve', async (req: Request, res: Response) => {
  const actionId = Number(req.params.id);
  if (!Number.isInteger(actionId) || actionId <= 0) {
    return res.status(400).json({ error: 'Invalid action id' });
  }
  try {
    const userId = (req.user as Express.User).id;
    const result = await service.approveAction(actionId, userId);
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to approve action' });
  }
});

router.post('/actions/:id/reject', (req: Request, res: Response) => {
  const actionId = Number(req.params.id);
  if (!Number.isInteger(actionId) || actionId <= 0) {
    return res.status(400).json({ error: 'Invalid action id' });
  }
  try {
    const userId = (req.user as Express.User).id;
    const action = service.rejectAction(actionId, userId);
    return res.json(action);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to reject action' });
  }
});

export default router;
