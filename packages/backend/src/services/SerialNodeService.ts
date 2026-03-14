import { SerialNodeRepository, SerialNode } from '../repositories/SerialNodeRepository.js';
import { createSerialTransport } from './transports/TransportFactory.js';

export class SerialNodeService {
  private repo = new SerialNodeRepository();

  list(): SerialNode[] {
    return this.repo.getAll();
  }

  listForOwner(ownerUserId: number): SerialNode[] {
    return this.repo.getAllForOwner(ownerUserId);
  }

  get(id: number): SerialNode | undefined {
    return this.repo.getById(id);
  }

  getForOwner(id: number, ownerUserId: number): SerialNode | undefined {
    return this.repo.getByIdForOwner(id, ownerUserId);
  }

  create(node: Partial<SerialNode>): SerialNode {
    return this.repo.create(node);
  }

  update(id: number, node: Partial<SerialNode>): SerialNode | undefined {
    return this.repo.update(id, node);
  }

  delete(id: number): void {
    this.repo.delete(id);
  }

  async testConnection(id: number, timeout = 5000): Promise<'online' | 'offline' | 'error'> {
    const node = this.get(id);
    if (!node) {
      throw new Error('Node not found');
    }

    const transport = createSerialTransport(node, timeout);
    transport.on('error', () => {
      // avoid EventEmitter's special-case unhandled error behavior during probes
    });

    try {
      await transport.connect();
      transport.disconnect();
      return 'online';
    } catch (error) {
      transport.disconnect();
      if (error instanceof Error && /timed out/i.test(error.message)) {
        return 'offline';
      }
      return 'error';
    }
  }
}
