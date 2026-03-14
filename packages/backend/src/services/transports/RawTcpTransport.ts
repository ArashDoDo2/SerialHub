import net from 'net';
import { SerialTransport, TransportCapabilities } from './SerialTransport.js';
import { SerialNode } from '../../repositories/SerialNodeRepository.js';
import { TelnetParser, TelnetCommandEvent, TelnetSubnegotiationEvent } from '../protocols/telnet/TelnetParser.js';

export class RawTcpTransport extends SerialTransport {
  private socket?: net.Socket;
  private connectPromise?: Promise<void>;
  private telnetParser = new TelnetParser();

  constructor(node: SerialNode, private readonly connectTimeoutMs = 5000) {
    super(node);
    this.telnetParser.on('data', (data: Buffer) => {
      this.emit('data', data);
    });
    this.telnetParser.on('command', (event: TelnetCommandEvent) => {
      this.emit('telnetCommand', event);
    });
    this.telnetParser.on('subnegotiation', (event: TelnetSubnegotiationEvent) => {
      this.emit('telnetSubnegotiation', event);
    });
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

      socket.once('connect', () => {
        socket.setTimeout(0);
        this.setState('connected');
        settled = true;
        resolve();
      });

      socket.on('data', (data: Buffer) => {
        this.telnetParser.push(data);
      });

      socket.on('timeout', () => {
        const error = new Error('Raw TCP serial connection timed out');
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
        this.setState('disconnected');
        this.emit('close');
        if (!settled) {
          settled = true;
          reject(new Error('Raw TCP serial connection closed before connect completed'));
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
    if (!socket) {
      this.setState('disconnected');
      return;
    }
    socket.destroy();
  }

  write(data: Buffer): void {
    if (!this.socket || this.getState() !== 'connected' || this.socket.destroyed) {
      throw new Error('Connection not open');
    }

    const writable = this.socket.write(data);
    if (!writable) {
      this.emit('backpressure');
    }
  }

  getCapabilities(): TransportCapabilities {
    return {
      connectionType: 'raw-tcp',
      binarySafe: true,
      appliesSerialSettings: false,
      supportsRfc2217: false,
      supportsBaudControl: false,
      supportsFlowControl: false,
      supportsModemSignals: false,
    };
  }
}
