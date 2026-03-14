import { TerminalSessionRepository } from '../repositories/TerminalSessionRepository.js';
import { config } from '../config/env.js';

export class TerminalSessionService {
  private repo = new TerminalSessionRepository();
  private ttlSeconds = Math.floor(config.terminal.sessionTtlMs / 1000);

  reconcileStartupSessions(): number {
    return this.repo.closeAllActive('error');
  }

  acquire(nodeId: number, userId: number, controllerKey: string) {
    this.cleanupExpired();
    const existingForController = this.repo.getActiveByController(controllerKey);
    if (existingForController) {
      if (existingForController.nodeId !== nodeId) {
        throw new Error('Controller is already attached to another node');
      }
      this.repo.touch(existingForController.id);
      return existingForController;
    }

    const active = this.repo.getActiveByNode(nodeId);
    if (active) {
      throw new Error('Node is already controlled by another active session');
    }

    return this.repo.create({
      nodeId,
      userId,
      status: 'active',
      controllerKey,
    });
  }

  release(controllerKey: string, status: 'closed' | 'error' = 'closed'): void {
    this.repo.closeByController(controllerKey, status);
  }

  getActiveByController(controllerKey: string) {
    this.cleanupExpired();
    return this.repo.getActiveByController(controllerKey);
  }

  ensureAvailableForScript(nodeId: number): void {
    this.cleanupExpired();
    const active = this.repo.getActiveByNode(nodeId);
    if (active) {
      throw new Error('Node is currently locked by an active terminal session');
    }
  }

  touch(controllerKey: string): void {
    const active = this.repo.getActiveByController(controllerKey);
    if (active) {
      this.repo.touch(active.id);
    }
  }

  bindSocket(controllerKey: string, socketId: string) {
    const active = this.repo.getActiveByController(controllerKey);
    if (!active) {
      return undefined;
    }
    return this.repo.bindSocket(active.id, socketId);
  }

  isControlledBySocket(controllerKey: string, socketId: string): boolean {
    const active = this.repo.getActiveByController(controllerKey);
    return Boolean(active && active.controllingSocketId === socketId);
  }

  releaseIfControlledBySocket(
    controllerKey: string,
    socketId: string,
    status: 'closed' | 'error' = 'closed'
  ): boolean {
    if (!this.isControlledBySocket(controllerKey, socketId)) {
      return false;
    }
    this.repo.closeByController(controllerKey, status);
    return true;
  }

  cleanupExpired(): number {
    return this.repo.closeExpiredActive(this.ttlSeconds);
  }

  releaseAllActive(status: 'closed' | 'error' = 'error'): number {
    return this.repo.closeAllActive(status);
  }
}
