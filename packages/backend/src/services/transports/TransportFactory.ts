import { SerialNode } from '../../repositories/SerialNodeRepository.js';
import { RawTcpTransport } from './RawTcpTransport.js';
import { Rfc2217Transport } from './Rfc2217Transport.js';
import { SerialTransport } from './SerialTransport.js';

export function createSerialTransport(node: SerialNode, connectTimeoutMs = 5000): SerialTransport {
  switch (node.connectionType) {
    case 'raw-tcp':
      return new RawTcpTransport(node, connectTimeoutMs);
    case 'rfc2217':
      return new Rfc2217Transport(node, connectTimeoutMs);
    default:
      throw new Error(`Unsupported connection type "${(node as SerialNode).connectionType}"`);
  }
}
