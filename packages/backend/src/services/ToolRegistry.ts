import { ScriptService } from './ScriptService.js';
import { SerialConnectionManager } from './SerialConnectionManager.js';
import { SerialNodeRepository } from '../repositories/SerialNodeRepository.js';
import { ScriptRepository } from '../repositories/ScriptRepository.js';
import { UserRepository } from '../repositories/UserRepository.js';
import { isOwnerOrAdmin } from '../middleware/auth.js';

interface ToolExecutionContext {
  terminalSessionId?: number;
  nodeId: number;
  userId: number;
}

type SnapshotProvider = (nodeId: number, limit?: number) => unknown;

export class ToolRegistry {
  private scriptService = new ScriptService();
  private scriptRepo = new ScriptRepository();
  private serialConnectionManager = SerialConnectionManager.getInstance();
  private nodeRepo = new SerialNodeRepository();
  private userRepo = new UserRepository();

  constructor(private snapshotProvider: SnapshotProvider) {}

  async execute(toolName: string, argumentsPayload: Record<string, unknown>, context: ToolExecutionContext): Promise<unknown> {
    const actor = this.userRepo.findById(context.userId);
    if (!actor) {
      throw new Error('User not found');
    }
    const node = this.nodeRepo.getById(context.nodeId);
    if (!node) {
      throw new Error('Node not found');
    }
    if (!isOwnerOrAdmin(node.ownerUserId, actor)) {
      throw new Error('Forbidden');
    }

    if (toolName === 'node.info') {
      return node;
    }

    if (toolName === 'terminal.snapshot' || toolName === 'serial.read') {
      return this.snapshotProvider(context.nodeId, Number(argumentsPayload.limit) || 20);
    }

    if (toolName === 'serial.write') {
      const data = String(argumentsPayload.data || '');
      if (!data) {
        throw new Error('serial.write requires data');
      }
      const state = this.serialConnectionManager.getState(context.nodeId);
      if (state !== 'connected' && state !== 'ready') {
        throw new Error('Serial transport is not connected');
      }
      this.serialConnectionManager.write(context.nodeId, data);
      return { ok: true, bytesWritten: Buffer.byteLength(data, 'utf-8') };
    }

    if (toolName === 'script.run') {
      const scriptId = Number(argumentsPayload.scriptId);
      if (!Number.isInteger(scriptId) || scriptId <= 0) {
        throw new Error('script.run requires a valid scriptId');
      }
      const script = this.scriptRepo.getById(scriptId);
      if (!script) {
        throw new Error('Script not found');
      }
      if (!isOwnerOrAdmin(script.ownerUserId, actor)) {
        throw new Error('Forbidden');
      }
      if (!isOwnerOrAdmin(node.ownerUserId, actor) || (actor.role !== 'admin' && script.ownerUserId !== node.ownerUserId)) {
        throw new Error('Script and node belong to different owners');
      }
      const runId = await this.scriptService.runScript(scriptId, context.nodeId, context.userId);
      return { ok: true, runId };
    }

    throw new Error('Unknown tool');
  }
}
