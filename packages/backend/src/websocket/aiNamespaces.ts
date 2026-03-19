import { Server } from 'socket.io';
import { AIAutomationService } from '../services/AIAutomationService.js';
import { AICopilotService } from '../services/AICopilotService.js';
import { AIObserverService } from '../services/AIObserverService.js';

interface RegisterAINamespacesOptions {
  io: Server;
  aiObserverService: AIObserverService;
  aiCopilotService: AICopilotService;
  aiAutomationService: AIAutomationService;
}

export function registerAINamespaces({
  io,
  aiObserverService,
  aiCopilotService,
  aiAutomationService,
}: RegisterAINamespacesOptions): void {
  const aiNamespace = io.of('/ai-observers');
  aiNamespace.use((socket, next) => {
    const authToken =
      typeof socket.handshake.auth?.authToken === 'string' ? socket.handshake.auth.authToken : '';
    const observer = authToken ? aiObserverService.authenticateObserver(authToken) : undefined;
    if (!observer) {
      next(new Error('Unauthorized'));
      return;
    }
    socket.data.observer = observer;
    next();
  });

  aiNamespace.on('connection', (socket) => {
    const observer = socket.data.observer;
    aiObserverService.registerSocket(observer, socket);

    socket.on('analysis.result', (payload: any) => {
      try {
        const observation = aiObserverService.storeObservation(observer, socket.id, 'result', payload);
        socket.emit('analysis.ack', { observationId: observation.id, observationType: 'result' });
      } catch (error) {
        socket.emit('analysis.error', {
          error: error instanceof Error ? error.message : 'Invalid analysis.result payload',
        });
      }
    });

    socket.on('analysis.summary', (payload: any) => {
      try {
        const observation = aiObserverService.storeObservation(observer, socket.id, 'summary', payload);
        socket.emit('analysis.ack', { observationId: observation.id, observationType: 'summary' });
      } catch (error) {
        socket.emit('analysis.error', {
          error: error instanceof Error ? error.message : 'Invalid analysis.summary payload',
        });
      }
    });

    socket.on('disconnect', () => {
      aiObserverService.unregisterSocket(observer.id, socket.id);
    });
  });

  const aiCopilotNamespace = io.of('/ai-copilot');
  aiCopilotNamespace.use((socket, next) => {
    const authToken =
      typeof socket.handshake.auth?.authToken === 'string' ? socket.handshake.auth.authToken : '';
    const observer = authToken ? aiCopilotService.authenticateCopilot(authToken) : undefined;
    if (!observer) {
      next(new Error('Unauthorized'));
      return;
    }
    socket.data.observer = observer;
    next();
  });

  aiCopilotNamespace.on('connection', (socket) => {
    const observer = socket.data.observer;
    aiCopilotService.registerSocket(observer, socket);

    socket.on('copilot.suggestion', (payload: any) => {
      try {
        const suggestion = aiCopilotService.storeSuggestion(observer, socket.id, 'suggestion', payload);
        socket.emit('copilot.ack', { suggestionId: suggestion.id, suggestionType: 'suggestion' });
      } catch (error) {
        socket.emit('copilot.error', {
          error: error instanceof Error ? error.message : 'Invalid copilot.suggestion payload',
        });
      }
    });

    socket.on('copilot.summary', (payload: any) => {
      try {
        const suggestion = aiCopilotService.storeSuggestion(observer, socket.id, 'summary', payload);
        socket.emit('copilot.ack', { suggestionId: suggestion.id, suggestionType: 'summary' });
      } catch (error) {
        socket.emit('copilot.error', {
          error: error instanceof Error ? error.message : 'Invalid copilot.summary payload',
        });
      }
    });

    socket.on('tool.call', (payload: any) => {
      const requestId =
        typeof payload?.requestId === 'string' && payload.requestId.length > 0
          ? payload.requestId
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const response = aiCopilotService.handleToolCall(observer, socket.id, requestId, payload);
      socket.emit('tool.result', response);
    });

    socket.on('disconnect', () => {
      aiCopilotService.unregisterSocket(observer.id, socket.id);
    });
  });

  const aiAutomationNamespace = io.of('/ai-automation');
  aiAutomationNamespace.use((socket, next) => {
    const authToken =
      typeof socket.handshake.auth?.authToken === 'string' ? socket.handshake.auth.authToken : '';
    const observer = authToken ? aiAutomationService.authenticateAgent(authToken) : undefined;
    if (!observer) {
      next(new Error('Unauthorized'));
      return;
    }
    socket.data.observer = observer;
    next();
  });

  aiAutomationNamespace.on('connection', (socket) => {
    const observer = socket.data.observer;
    aiAutomationService.registerSocket(observer, socket);

    socket.on('action.propose', async (payload: any) => {
      try {
        const result = await aiAutomationService.proposeAction(observer, socket.id, payload);
        socket.emit('action.ack', {
          actionId: result.action.id,
          status: result.action.status,
          result: result.result,
        });
      } catch (error) {
        socket.emit('action.error', {
          error: error instanceof Error ? error.message : 'Invalid action proposal',
        });
      }
    });

    socket.on('disconnect', () => {
      aiAutomationService.unregisterSocket(observer.id, socket.id);
    });
  });
}
