import EventEmitter from 'events';
import {
  TELNET_DO,
  TELNET_DONT,
  TELNET_IAC,
  TELNET_SB,
  TELNET_SE,
  TELNET_WILL,
  TELNET_WONT,
  TelnetNegotiationCommand,
} from './TelnetConstants.js';
import { TelnetParserState } from './TelnetStateMachine.js';

export interface TelnetCommandEvent {
  command: TelnetNegotiationCommand;
  option: number;
}

export interface TelnetSubnegotiationEvent {
  option: number;
  payload: Buffer;
}

export class TelnetParser extends EventEmitter {
  private state: TelnetParserState = 'DATA';
  private dataBytes: number[] = [];
  private pendingCommand?: TelnetNegotiationCommand;
  private subnegotiationOption?: number;
  private subnegotiationBytes: number[] = [];

  push(chunk: Buffer): void {
    for (const byte of chunk) {
      this.consumeByte(byte);
    }

    if (this.state === 'DATA') {
      this.flushData();
    }
  }

  reset(): void {
    this.state = 'DATA';
    this.dataBytes = [];
    this.pendingCommand = undefined;
    this.subnegotiationOption = undefined;
    this.subnegotiationBytes = [];
  }

  getState(): TelnetParserState {
    return this.state;
  }

  private consumeByte(byte: number): void {
    switch (this.state) {
      case 'DATA':
        if (byte === TELNET_IAC) {
          this.state = 'IAC';
          return;
        }
        this.dataBytes.push(byte);
        return;

      case 'IAC':
        if (byte === TELNET_IAC) {
          this.dataBytes.push(TELNET_IAC);
          this.state = 'DATA';
          return;
        }
        if (this.isNegotiationCommand(byte)) {
          this.flushData();
          this.pendingCommand = byte;
          this.state = 'COMMAND';
          return;
        }
        if (byte === TELNET_SB) {
          this.flushData();
          this.subnegotiationOption = undefined;
          this.subnegotiationBytes = [];
          this.state = 'SUBNEGOTIATION';
          return;
        }
        this.state = 'DATA';
        return;

      case 'COMMAND':
        if (this.pendingCommand === undefined) {
          this.state = 'DATA';
          return;
        }
        this.emit('command', {
          command: this.pendingCommand,
          option: byte,
        } satisfies TelnetCommandEvent);
        this.pendingCommand = undefined;
        this.state = 'DATA';
        return;

      case 'SUBNEGOTIATION':
        if (this.subnegotiationOption === undefined) {
          this.subnegotiationOption = byte;
          return;
        }
        if (byte === TELNET_IAC) {
          this.state = 'SUBNEGOTIATION_IAC';
          return;
        }
        this.subnegotiationBytes.push(byte);
        return;

      case 'SUBNEGOTIATION_IAC':
        if (byte === TELNET_IAC) {
          this.subnegotiationBytes.push(TELNET_IAC);
          this.state = 'SUBNEGOTIATION';
          return;
        }
        if (byte === TELNET_SE) {
          if (this.subnegotiationOption !== undefined) {
            this.emit('subnegotiation', {
              option: this.subnegotiationOption,
              payload: Buffer.from(this.subnegotiationBytes),
            } satisfies TelnetSubnegotiationEvent);
          }
          this.subnegotiationOption = undefined;
          this.subnegotiationBytes = [];
          this.state = 'DATA';
          return;
        }

        // Malformed subnegotiation. Preserve bytes rather than dropping them.
        this.subnegotiationBytes.push(TELNET_IAC, byte);
        this.state = 'SUBNEGOTIATION';
        return;
    }
  }

  private flushData(): void {
    if (this.dataBytes.length === 0) {
      return;
    }

    this.emit('data', Buffer.from(this.dataBytes));
    this.dataBytes = [];
  }

  private isNegotiationCommand(byte: number): byte is TelnetNegotiationCommand {
    return byte === TELNET_DO || byte === TELNET_DONT || byte === TELNET_WILL || byte === TELNET_WONT;
  }
}
