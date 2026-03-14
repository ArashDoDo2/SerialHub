import net from 'net';
import { SerialNode } from '../../repositories/SerialNodeRepository.js';
import { logger } from '../../config/logger.js';
import { TelnetCommandEvent, TelnetParser, TelnetSubnegotiationEvent } from '../protocols/telnet/TelnetParser.js';
import { escapeTelnetData, getTelnetOptionName } from '../protocols/rfc2217/Rfc2217Constants.js';
import { Rfc2217Negotiator } from '../protocols/rfc2217/Rfc2217Negotiator.js';
import { SerialTransport, TransportCapabilities } from './SerialTransport.js';

export class Rfc2217Transport extends SerialTransport {
  private socket?: net.Socket;
  private connectPromise?: Promise<void>;
  private readonly telnetParser = new TelnetParser();
  private readonly negotiator: Rfc2217Negotiator;
  private degraded = false;
  private degradedReason?: string;
  private supportsLineStateNotifications = false;
  private supportsModemStateNotifications = false;

  constructor(node: SerialNode, private readonly connectTimeoutMs = 5000) {
    super(node);
    this.negotiator = new Rfc2217Negotiator({
      node,
      writeRaw: (payload) => this.writeRaw(payload),
      negotiationTimeoutMs: connectTimeoutMs,
    });
    this.bindParserEvents();
    this.bindNegotiatorEvents();
  }

  connect(): Promise<void> {
    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.setState('connecting');
    this.connectPromise = new Promise<void>((resolve, reject) => {
      const socket = new net.Socket();
      let settled = false;
      this.socket = socket;

      socket.setKeepAlive(true);
      socket.setNoDelay(true);
      socket.setTimeout(this.connectTimeoutMs);

      socket.once('connect', async () => {
        socket.setTimeout(0);
        this.setState('telnet-negotiating');

        try {
          await this.negotiator.start();
          this.setState('ready');
          settled = true;
          resolve();
        } catch (error) {
          this.setState('error');
          this.emit('error', error);
          socket.destroy(error instanceof Error ? error : undefined);
          if (!settled) {
            settled = true;
            reject(error);
          }
        }
      });

      socket.on('data', (data: Buffer) => {
        this.telnetParser.push(data);
      });

      socket.on('timeout', () => {
        const error = new Error('RFC2217 serial connection timed out');
        this.setState('error');
        this.emit('error', error);
        socket.destroy(error);
      });

      socket.on('error', (error) => {
        this.setState('error');
        this.emit('error', error);
        if (!settled) {
          settled = true;
          reject(error);
        }
      });

      socket.on('close', () => {
        this.socket = undefined;
        this.connectPromise = undefined;
        this.telnetParser.reset();
        this.negotiator.reset();
        this.setState('disconnected');
        this.emit('close');
        if (!settled) {
          settled = true;
          reject(new Error('RFC2217 connection closed before negotiation completed'));
        }
      });

      socket.connect(this.node.port, this.node.host);
    });

    return this.connectPromise;
  }

  disconnect(): void {
    const socket = this.socket;
    this.socket = undefined;
    this.connectPromise = undefined;
    this.negotiator.reset();
    if (!socket) {
      this.setState('disconnected');
      return;
    }
    socket.destroy();
  }

  write(data: Buffer): void {
    if (!this.socket || this.getState() !== 'ready' || this.socket.destroyed) {
      throw new Error('RFC2217 transport is not ready');
    }

    this.writeRaw(escapeTelnetData(data));
  }

  getCapabilities(): TransportCapabilities {
    return {
      connectionType: 'rfc2217',
      binarySafe: true,
      appliesSerialSettings: true,
      supportsTelnet: true,
      supportsRfc2217: true,
      supportsBaudControl: true,
      supportsFlowControl: false,
      supportsModemSignals: this.supportsLineStateNotifications || this.supportsModemStateNotifications,
      supportsLineStateNotifications: this.supportsLineStateNotifications,
      supportsModemStateNotifications: this.supportsModemStateNotifications,
      degraded: this.degraded,
      degradedReason: this.degradedReason,
    };
  }

  private bindParserEvents(): void {
    this.telnetParser.on('data', (data: Buffer) => {
      this.emit('data', data);
    });
    this.telnetParser.on('command', (event: TelnetCommandEvent) => {
      this.emit('telnetCommand', event);
      this.negotiator.handleTelnetCommand(event);
    });
    this.telnetParser.on('subnegotiation', (event: TelnetSubnegotiationEvent) => {
      this.emit('telnetSubnegotiation', event);
      this.negotiator.handleSubnegotiation(event);
    });
  }

  private bindNegotiatorEvents(): void {
    this.negotiator.on('ready', ({ degraded, degradedReason }) => {
      this.degraded = degraded;
      this.degradedReason = degradedReason;
      if (degraded) {
        this.emit('degraded', { reason: degradedReason });
      }
    });

    this.negotiator.on('rfc2217Negotiating', () => {
      this.setState('rfc2217-negotiating');
    });

    this.negotiator.on('lineState', (lineState: number) => {
      this.supportsLineStateNotifications = true;
      this.emit('lineState', { lineState });
    });

    this.negotiator.on('modemState', (modemState: number) => {
      this.supportsModemStateNotifications = true;
      this.emit('modemState', { modemState });
    });

    this.negotiator.on('protocolLog', (payload: { level: 'debug' | 'warn'; message: string; option?: number }) => {
      logger[payload.level](
        {
          nodeId: this.node.id,
          connectionType: this.node.connectionType,
          option: payload.option,
          optionName: payload.option === undefined ? undefined : getTelnetOptionName(payload.option),
        },
        payload.message
      );
    });

    this.negotiator.on('ready', () => {
      this.supportsLineStateNotifications = this.negotiator.getDiagnostics().lineStateSupported;
      this.supportsModemStateNotifications = this.negotiator.getDiagnostics().modemStateSupported;
    });
  }

  private writeRaw(data: Buffer): void {
    if (!this.socket || this.socket.destroyed) {
      throw new Error('Connection not open');
    }

    const writable = this.socket.write(data);
    if (!writable) {
      this.emit('backpressure');
    }
  }
}
