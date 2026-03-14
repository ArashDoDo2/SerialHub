import crypto from 'crypto';
import { BaseRepository } from './BaseRepository.js';

export interface AIObserver {
  id: number;
  name: string;
  endpoint: string;
  authToken: string;
  ownerUserId: number;
  createdAt: string;
}

export class AIObserverRepository extends BaseRepository {
  listAll(): AIObserver[] {
    return this.prepare(
      `SELECT id, name, endpoint, authToken, ownerUserId, createdAt
       FROM ai_observers
       ORDER BY createdAt DESC`
    ).all() as AIObserver[];
  }

  listByOwner(ownerUserId: number): AIObserver[] {
    return this.prepare(
      `SELECT id, name, endpoint, authToken, ownerUserId, createdAt
       FROM ai_observers
       WHERE ownerUserId = ?
       ORDER BY createdAt DESC`
    ).all(ownerUserId) as AIObserver[];
  }

  getById(id: number): AIObserver | undefined {
    return this.prepare(
      `SELECT id, name, endpoint, authToken, ownerUserId, createdAt
       FROM ai_observers
       WHERE id = ?`
    ).get(id) as AIObserver | undefined;
  }

  getByAuthToken(authToken: string): AIObserver | undefined {
    return this.prepare(
      `SELECT id, name, endpoint, authToken, ownerUserId, createdAt
       FROM ai_observers
       WHERE authToken = ?`
    ).get(authToken) as AIObserver | undefined;
  }

  create(input: { name: string; endpoint: string; ownerUserId: number }): AIObserver {
    const authToken = crypto.randomBytes(24).toString('hex');
    const result = this.prepare(
      `INSERT INTO ai_observers
       (name, endpoint, authToken, ownerUserId, createdAt)
       VALUES (?, ?, ?, ?, datetime('now'))`
    ).run(input.name, input.endpoint, authToken, input.ownerUserId);

    return this.getById(result.lastInsertRowid as number)!;
  }

  delete(id: number, ownerUserId: number): void {
    this.prepare('DELETE FROM ai_observers WHERE id = ? AND ownerUserId = ?').run(id, ownerUserId);
  }

  deleteAny(id: number): void {
    this.prepare('DELETE FROM ai_observers WHERE id = ?').run(id);
  }
}
