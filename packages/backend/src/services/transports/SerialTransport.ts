import EventEmitter from 'events';
import { SerialNode, SerialNodeConnectionType } from '../../repositories/SerialNodeRepository.js';

export type SerialTransportState =
  | 'disconnected'
  | 'connecting'
  | 'telnet-negotiating'
  | 'rfc2217-negotiating'
  | 'connected'
  | 'ready'
  | 'error';

export interface TransportCapabilities {
  connectionType: SerialNodeConnectionType;
  binarySafe: boolean;
  appliesSerialSettings: boolean;
  supportsTelnet?: boolean;
  supportsRfc2217?: boolean;
  supportsBaudControl?: boolean;
  supportsFlowControl?: boolean;
  supportsModemSignals?: boolean;
  supportsLineStateNotifications?: boolean;
  supportsModemStateNotifications?: boolean;
  degraded?: boolean;
  degradedReason?: string;
}

export interface TransportStateChangeEvent {
  previousState: SerialTransportState;
  state: SerialTransportState;
}

export abstract class SerialTransport extends EventEmitter {
  protected state: SerialTransportState = 'disconnected';

  constructor(protected readonly node: SerialNode) {
    super();
  }

  abstract connect(): Promise<void>;

  abstract disconnect(): void;

  abstract write(data: Buffer): void;

  abstract getCapabilities(): TransportCapabilities;

  getState(): SerialTransportState {
    return this.state;
  }

  protected setState(state: SerialTransportState): void {
    if (this.state === state) {
      return;
    }

    const previousState = this.state;
    this.state = state;
    this.emit('stateChange', {
      previousState,
      state,
    } satisfies TransportStateChangeEvent);
  }
}
