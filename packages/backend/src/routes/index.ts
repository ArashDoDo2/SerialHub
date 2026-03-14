import { Router } from 'express';
import healthRouter from './health.js';

const apiRouter = Router();

// This router will host protected API endpoints

import nodesRouter from './nodes.js';
import terminalRouter from './terminal.js';
import scriptsRouter from './scripts.js';
import runsRouter from './runs.js';
import aiObserversRouter from './ai-observers.js';
import aiObservationsRouter from './ai-observations.js';
import aiCopilotRouter from './ai-copilot.js';
import aiAutomationRouter from './ai-automation.js';

apiRouter.use('/nodes', nodesRouter);
apiRouter.use('/terminal', terminalRouter);
apiRouter.use('/scripts', scriptsRouter);
apiRouter.use('/runs', runsRouter);
apiRouter.use('/ai-observers', aiObserversRouter);
apiRouter.use('/ai-observations', aiObservationsRouter);
apiRouter.use('/ai-copilot', aiCopilotRouter);
apiRouter.use('/ai-automation', aiAutomationRouter);


export default apiRouter;
