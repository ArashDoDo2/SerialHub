import { BaseRepository } from './BaseRepository.js';

export type SerialNodeConnectionType = 'raw-tcp' | 'rfc2217';

export interface SerialNode {
  id: number;
  name: string;
  description?: string;
  connectionType: SerialNodeConnectionType;
  host: string;
  port: number;
  baudRate: number;
  dataBits: number;
  parity: 'none' | 'even' | 'odd' | 'mark' | 'space';
  stopBits: number;
  isActive: boolean;
  ownerUserId: number;
  createdAt: string;
  updatedAt: string;
}

export class SerialNodeRepository extends BaseRepository {
  getAll(): SerialNode[] {
    return this.prepare('SELECT * FROM serialNodes').all() as SerialNode[];
  }

  getAllForOwner(ownerUserId: number): SerialNode[] {
    return this.prepare('SELECT * FROM serialNodes WHERE ownerUserId = ? ORDER BY updatedAt DESC, id DESC').all(ownerUserId) as SerialNode[];
  }

  getById(id: number): SerialNode | undefined {
    return this.prepare('SELECT * FROM serialNodes WHERE id = ?').get(id) as SerialNode | undefined;
  }

  getByIdForOwner(id: number, ownerUserId: number): SerialNode | undefined {
    return this.prepare('SELECT * FROM serialNodes WHERE id = ? AND ownerUserId = ?').get(id, ownerUserId) as SerialNode | undefined;
  }

  create(node: Partial<SerialNode>): SerialNode {
    const stmt = this.prepare(
      `INSERT INTO serialNodes
       (name, description, connectionType, host, port, baudRate, dataBits, parity, stopBits, isActive, ownerUserId, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    );
    const result = stmt.run(
      node.name,
      node.description || null,
      node.connectionType || 'raw-tcp',
      node.host,
      node.port,
      node.baudRate,
      node.dataBits,
      node.parity,
      node.stopBits,
      node.isActive ? 1 : 0,
      node.ownerUserId
    );
    return this.getById(result.lastInsertRowid as number)!;
  }

  update(id: number, node: Partial<SerialNode>): SerialNode | undefined {
    const fields: string[] = [];
    const values: any[] = [];

    if (node.name !== undefined) { fields.push('name = ?'); values.push(node.name); }
    if (node.description !== undefined) { fields.push('description = ?'); values.push(node.description); }
    if (node.connectionType !== undefined) { fields.push('connectionType = ?'); values.push(node.connectionType); }
    if (node.host !== undefined) { fields.push('host = ?'); values.push(node.host); }
    if (node.port !== undefined) { fields.push('port = ?'); values.push(node.port); }
    if (node.baudRate !== undefined) { fields.push('baudRate = ?'); values.push(node.baudRate); }
    if (node.dataBits !== undefined) { fields.push('dataBits = ?'); values.push(node.dataBits); }
    if (node.parity !== undefined) { fields.push('parity = ?'); values.push(node.parity); }
    if (node.stopBits !== undefined) { fields.push('stopBits = ?'); values.push(node.stopBits); }
    if (node.isActive !== undefined) { fields.push('isActive = ?'); values.push(node.isActive ? 1 : 0); }

    if (fields.length === 0) {
      return this.getById(id);
    }

    values.push(id);
    const sql = `UPDATE serialNodes SET ${fields.join(', ')}, updatedAt = datetime('now') WHERE id = ?`;
    this.prepare(sql).run(...values);
    return this.getById(id);
  }

  delete(id: number): void {
    this.prepare('DELETE FROM serialNodes WHERE id = ?').run(id);
  }
}
