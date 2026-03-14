import { Request, Response, Router } from 'express';
import { AICopilotService } from '../services/AICopilotService.js';
import { SerialNodeService } from '../services/SerialNodeService.js';
import { isAdmin, isOwnerOrAdmin } from '../middleware/auth.js';

const router = Router();
const service = AICopilotService.getInstance();
const nodeService = new SerialNodeService();

router.get('/suggestions', (req: Request, res: Response) => {
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
  const suggestions = isAdmin(user)
    ? service.listAllSuggestions(nodeId, Number.isInteger(limit) && limit > 0 ? limit : 20)
    : service.listSuggestions(nodeId, user.id, Number.isInteger(limit) && limit > 0 ? limit : 20);
  return res.json(
    suggestions.map((suggestion) => ({
      ...suggestion,
      hypotheses: suggestion.hypothesesJson ? JSON.parse(suggestion.hypothesesJson) : [],
      suggestedActions: suggestion.suggestedActionsJson ? JSON.parse(suggestion.suggestedActionsJson) : [],
    }))
  );
});

export default router;
