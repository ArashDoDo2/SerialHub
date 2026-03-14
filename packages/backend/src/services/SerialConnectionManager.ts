import EventEmitter from 'events';
import { SerialNodeService } from './SerialNodeService.js';
import { logger } from '../config/logger.js';
import { SerialTransport, SerialTransportState, TransportCapabilities } from './transports/SerialTransport.js';
import { SerialNode } from '../repositories/SerialNodeRepository.js';
import { getTelnetCommandName } from './protocols/telnet/TelnetConstants.js';
import { getRfc2217CommandName } from './protocols/rfc2217/Rfc2217Constants.js';
import { createSerialTransport } from './transports/TransportFactory.js';

interface ConnectionRecord {
  nodeId: number;
  node: SerialNode;
  transport: SerialTransport;
  state: SerialTransportState;
  reconnectAttempts: number;
  reconnectTimer?: NodeJS.Timeout;
  closedByUser: boolean;
  connectPromise: Promise<void>;
}

export const connectionEvents = new EventEmitter();

export class SerialConnectionManager {
  private static instance: SerialConnectionManager;
  private connections = new Map<number, ConnectionRecord>();
  private subscribers = new Map<number, Set<string>>();
  private nodeService = new SerialNodeService();
  private readonly connectTimeoutMs = 5000;
  private readonly maxReconnectDelayMs = 30000;

  private constructor() {}

  static getInstance(): SerialConnectionManager {
    if (!SerialConnectionManager.instance) {
      SerialConnectionManager.instance = new SerialConnectionManager();
    }
    return SerialConnectionManager.instance;
  }

  async openConnection(nodeId: number): Promise<void> {
    const existing = this.connections.get(nodeId);
    if (existing) {
      await existing.connectPromise;
      return;
    }

    const node = this.nodeService.get(nodeId);
    if (!node) {
      throw new Error('Node not found');
    }

    const record = this.createRecord(node);
    this.connections.set(nodeId, record);

    try {
      await record.connectPromise;
    } catch (error) {
      if (!this.shouldKeepAlive(nodeId)) {
        this.clearReconnect(record);
        this.connections.delete(nodeId);
      }
      throw error;
    }
  }

  closeConnection(nodeId: number): void {
    const record = this.connections.get(nodeId);
    if (!record) {
      return;
    }

    record.closedByUser = true;
    this.clearReconnect(record);
    record.transport.disconnect();
    this.connections.delete(nodeId);
    this.emitState(nodeId, 'disconnected');
  }

  closeAllConnections(): void {
    for (const nodeId of Array.from(this.connections.keys())) {
      this.closeConnection(nodeId);
    }
  }

  write(nodeId: number, data: string | Buffer): void {
    const record = this.connections.get(nodeId);
    if (!record || (record.state !== 'connected' && record.state !== 'ready')) {
      throw new Error('Connection not open');
    }

    const payload = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf-8');
    record.transport.write(payload);
  }

  subscribe(nodeId: number, sessionId: string): void {
    const subscribers = this.subscribers.get(nodeId) ?? new Set<string>();
    subscribers.add(sessionId);
    this.subscribers.set(nodeId, subscribers);
  }

  unsubscribe(nodeId: number, sessionId: string): void {
    const subscribers = this.subscribers.get(nodeId);
    if (!subscribers) {
      return;
    }

    subscribers.delete(sessionId);
    if (subscribers.size === 0) {
      this.subscribers.delete(nodeId);
    }
  }

  unsubscribeAll(sessionId: string): number[] {
    const affectedNodes: number[] = [];
    for (const [nodeId, subscribers] of this.subscribers.entries()) {
      if (subscribers.delete(sessionId)) {
        affectedNodes.push(nodeId);
      }
      if (subscribers.size === 0) {
        this.subscribers.delete(nodeId);
      }
    }
    return affectedNodes;
  }

  hasSubscribers(nodeId: number): boolean {
    return (this.subscribers.get(nodeId)?.size ?? 0) > 0;
  }

  getSubscriberIds(nodeId: number): string[] {
    return Array.from(this.subscribers.get(nodeId) ?? []);
  }

  getState(nodeId: number): SerialTransportState {
    return this.connections.get(nodeId)?.state ?? 'disconnected';
  }

  getCapabilities(nodeId: number): TransportCapabilities | undefined {
    return this.connections.get(nodeId)?.transport.getCapabilities();
  }

  private createRecord(node: SerialNode): ConnectionRecord {
    const transport = this.createTransport(node);
    const record: ConnectionRecord = {
      nodeId: node.id,
      node,
      transport,
      state: 'disconnected',
      reconnectAttempts: 0,
      closedByUser: false,
      connectPromise: Promise.resolve(),
    };

    record.connectPromise = this.connectRecord(record);
    return record;
  }

  private createTransport(node: SerialNode): SerialTransport {
    return createSerialTransport(node, this.connectTimeoutMs);
  }

  private connectRecord(record: ConnectionRecord): Promise<void> {
    this.attachTransportListeners(record);
    logger.info(
      { nodeId: record.nodeId, host: record.node.host, port: record.node.port, connectionType: record.node.connectionType },
      'Opening serial transport connection'
    );
    return record.transport.connect();
  }

  private attachTransportListeners(record: ConnectionRecord): void {
    record.transport.on('stateChange', ({ state }: { state: SerialTransportState }) => {
      record.state = state;
      if (state === 'connected' || state === 'ready') {
        record.reconnectAttempts = 0;
      }
      this.emitState(record.nodeId, state);
    });

    record.transport.on('data', (data: Buffer) => {
      connectionEvents.emit('data', { nodeId: record.nodeId, data });
    });

    record.transport.on('error', (error: Error) => {
      logger.error(
        { nodeId: record.nodeId, connectionType: record.node.connectionType, err: error },
        'Serial transport error'
      );
      connectionEvents.emit('transportError', { nodeId: record.nodeId, error });
    });

    record.transport.on('backpressure', () => {
      logger.warn({ nodeId: record.nodeId }, 'Serial transport backpressure detected');
    });

    record.transport.on('telnetCommand', ({ command, option }: { command: number; option: number }) => {
      logger.debug(
        {
          nodeId: record.nodeId,
          connectionType: record.node.connectionType,
          command: getTelnetCommandName(command),
          option,
        },
        'Telnet command received on serial transport'
      );
      connectionEvents.emit('telnetCommand', { nodeId: record.nodeId, command, option });
    });

    record.transport.on(
      'telnetSubnegotiation',
      ({ option, payload }: { option: number; payload: Buffer }) => {
        logger.debug(
          {
            nodeId: record.nodeId,
            connectionType: record.node.connectionType,
            option,
            optionCommand: payload.length > 0 ? getRfc2217CommandName(payload[0]) : undefined,
            payloadHex: payload.toString('hex'),
          },
          'Telnet subnegotiation received on serial transport'
        );
        connectionEvents.emit('telnetSubnegotiation', { nodeId: record.nodeId, option, payload });
      }
    );

    record.transport.on('lineState', ({ lineState }: { lineState: number }) => {
      logger.debug({ nodeId: record.nodeId, lineState }, 'RFC2217 line state update received');
      connectionEvents.emit('lineState', { nodeId: record.nodeId, lineState });
    });

    record.transport.on('modemState', ({ modemState }: { modemState: number }) => {
      logger.debug({ nodeId: record.nodeId, modemState }, 'RFC2217 modem state update received');
      connectionEvents.emit('modemState', { nodeId: record.nodeId, modemState });
    });

    record.transport.on('degraded', ({ reason }: { reason?: string }) => {
      logger.warn(
        { nodeId: record.nodeId, connectionType: record.node.connectionType, reason },
        'Serial transport entered degraded mode'
      );
      connectionEvents.emit('degraded', {
        nodeId: record.nodeId,
        reason,
        capabilities: record.transport.getCapabilities(),
      });
    });

    record.transport.on('close', () => {
      logger.info(
        { nodeId: record.nodeId, closedByUser: record.closedByUser, connectionType: record.node.connectionType },
        'Serial transport closed'
      );

      if (record.closedByUser || !this.shouldKeepAlive(record.nodeId)) {
        this.clearReconnect(record);
        this.connections.delete(record.nodeId);
        return;
      }

      this.scheduleReconnect(record);
    });
  }

  private scheduleReconnect(record: ConnectionRecord): void {
    this.clearReconnect(record);
    record.reconnectAttempts += 1;

    const delay = Math.min(1000 * 2 ** Math.min(record.reconnectAttempts, 5), this.maxReconnectDelayMs);
    record.reconnectTimer = setTimeout(() => {
      const current = this.connections.get(record.nodeId);
      if (!current || current.closedByUser || !this.shouldKeepAlive(record.nodeId)) {
        return;
      }

      const replacement = this.createRecord(current.node);
      replacement.reconnectAttempts = current.reconnectAttempts;
      this.connections.set(record.nodeId, replacement);
      replacement.connectPromise.catch((error) => {
        logger.error({ nodeId: record.nodeId, error }, 'Reconnect attempt failed');
      });
    }, delay);
  }

  private clearReconnect(record: ConnectionRecord): void {
    if (record.reconnectTimer) {
      clearTimeout(record.reconnectTimer);
      record.reconnectTimer = undefined;
    }
  }

  private shouldKeepAlive(nodeId: number): boolean {
    return this.hasSubscribers(nodeId);
  }

  private emitState(nodeId: number, state: SerialTransportState): void {
    connectionEvents.emit('state', { nodeId, state });
  }
}
