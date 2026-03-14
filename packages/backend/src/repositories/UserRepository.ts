import { BaseRepository } from './BaseRepository.js';

export interface User {
  id: number;
  googleId: string;
  email: string;
  name: string;
  avatarUrl?: string;
  role: 'admin' | 'user';
  createdAt: string;
  updatedAt: string;
}

export class UserRepository extends BaseRepository {
  findByEmail(email: string): User | undefined {
    return this.prepare('SELECT * FROM users WHERE email = ?').get(email) as User | undefined;
  }

  findByGoogleId(googleId: string): User | undefined {
    return this.prepare('SELECT * FROM users WHERE googleId = ?').get(googleId) as User | undefined;
  }

  findById(id: number): User | undefined {
    return this.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
  }

  create(user: Partial<User>): User {
    const stmt = this.prepare(
      `INSERT INTO users (googleId, email, name, avatarUrl, role, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    );
    const result = stmt.run(
      user.googleId,
      user.email,
      user.name,
      user.avatarUrl || null,
      user.role || 'user'
    );
    return this.findById(result.lastInsertRowid as number)!;
  }

  update(id: number, data: Partial<User>): User | undefined {
    const fields = [];
    const values: any[] = [];

    if (data.name) {
      fields.push('name = ?');
      values.push(data.name);
    }
    if (data.email) {
      fields.push('email = ?');
      values.push(data.email);
    }
    if (data.avatarUrl) {
      fields.push('avatarUrl = ?');
      values.push(data.avatarUrl);
    }
    if (data.role) {
      fields.push('role = ?');
      values.push(data.role);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    const sql = `UPDATE users SET ${fields.join(', ')}, updatedAt = datetime('now') WHERE id = ?`;
    this.prepare(sql).run(...values);
    return this.findById(id);
  }
}
