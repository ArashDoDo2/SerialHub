import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { SerialConnectionManager } from '../services/SerialConnectionManager.js';
import { TerminalSessionService } from '../services/TerminalSessionService.js';
import { logger } from '../config/logger.js';
import { AIObserverService } from '../services/AIObserverService.js';
import { AICopilotService } from '../services/AICopilotService.js';
import { AIAutomationService } from '../services/AIAutomationService.js';
import { SerialNodeService } from '../services/SerialNodeService.js';
import { isOwnerOrAdmin } from '../middleware/auth.js';

const router = Router();
const mgr = SerialConnectionManager.getInstance();
const terminalSessionService = new TerminalSessionService();
const nodeService = new SerialNodeService();
const aiObserverService = AIObserverService.getInstance();
const aiCopilotService = AICopilotService.getInstance();
const aiAutomationService = AIAutomationService.getInstance();

const terminalSessionSchema = z.object({
  nodeId: z.number().int().positive(),
  controllerKey: z.string().min(1),
});

const getClientAddress = (req: Request) => {
  const forwardedForHeader = req.headers['x-forwarded-for'];
  const forwardedForValue = Array.isArray(forwardedForHeader)
    ? forwardedForHeader[0]
    : forwardedForHeader;
  const forwardedAddress = forwardedForValue
    ?.split(',')
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 0);

  if (forwardedAddress) {
    return forwardedAddress;
  }

  const realIpHeader = req.headers['x-real-ip'];
  const realIpValue = Array.isArray(realIpHeader) ? realIpHeader[0] : realIpHeader;
  if (realIpValue && realIpValue.trim().length > 0) {
    return realIpValue.trim();
  }

  return req.ip;
};

router.post('/start', async (req: Request, res: Response) => {
  const parsed = terminalSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.format() });
  }

  const userId = (req.user as Express.User).id;
  const node = nodeService.get(parsed.data.nodeId);
  if (!node) {
    return res.status(404).json({ error: 'Node not found' });
  }
  if (!isOwnerOrAdmin(node.ownerUserId, req.user as Express.User)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const session = terminalSessionService.acquireWithContext(
      parsed.data.nodeId,
      userId,
      parsed.data.controllerKey,
      getClientAddress(req)
    );
    await mgr.openConnection(parsed.data.nodeId);
    aiObserverService.startTerminalSession({
      terminalSessionId: session.id,
      nodeId: parsed.data.nodeId,
      userId,
    });
    aiCopilotService.startTerminalSession({
      terminalSessionId: session.id,
      nodeId: parsed.data.nodeId,
      userId,
    });
    logger.info({ nodeId: parsed.data.nodeId, userId, sessionId: session.id }, 'Terminal session started');
    return res.json({ success: true, sessionId: session.id });
  } catch (error) {
    terminalSessionService.release(parsed.data.controllerKey, 'error');
    logger.warn(
      { nodeId: parsed.data.nodeId, userId, controllerKey: parsed.data.controllerKey, err: error },
      'Terminal session start failed'
    );
    const message = error instanceof Error ? error.message : 'Failed to start terminal session';
    const lockInfo =
      message === 'Node is already controlled by another active session'
        ? terminalSessionService.getActiveLockInfo(parsed.data.nodeId)
        : undefined;
    return res.status(409).json({
      error: message,
      lockInfo: lockInfo
        ? {
            sessionId: lockInfo.sessionId,
            userId: lockInfo.userId,
            userName: lockInfo.userName,
            userEmail: lockInfo.userEmail,
            clientAddress: lockInfo.clientAddress || 'unknown',
            startedAt: lockInfo.startedAt,
            heartbeatAt: lockInfo.heartbeatAt,
          }
        : undefined,
    });
  }
});

router.post('/stop', (req: Request, res: Response) => {
  const parsed = terminalSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.format() });
  }

  const activeSession = terminalSessionService.getActiveByController(parsed.data.controllerKey);
  const userId = (req.user as Express.User).id;
  if (activeSession && activeSession.userId !== userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (activeSession) {
    aiObserverService.endTerminalSession({
      terminalSessionId: activeSession.id,
      nodeId: parsed.data.nodeId,
      reason: 'closed',
    });
    aiCopilotService.endTerminalSession({
      terminalSessionId: activeSession.id,
      nodeId: parsed.data.nodeId,
      reason: 'closed',
    });
    aiAutomationService.disableTerminalSession({
      terminalSessionId: activeSession.id,
      nodeId: parsed.data.nodeId,
      userId,
      reason: 'terminal_closed',
    });
  }
  terminalSessionService.release(parsed.data.controllerKey, 'closed');
  if (!mgr.hasSubscribers(parsed.data.nodeId)) {
    mgr.closeConnection(parsed.data.nodeId);
  }
  logger.info({ nodeId: parsed.data.nodeId, userId, controllerKey: parsed.data.controllerKey }, 'Terminal session stopped');
  return res.json({ success: true });
});

export default router;
