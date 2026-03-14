import EventEmitter from 'events';
import { SerialNode } from '../../../repositories/SerialNodeRepository.js';
import { TelnetCommandEvent, TelnetSubnegotiationEvent } from '../telnet/TelnetParser.js';
import {
  TELNET_DO,
  TELNET_DONT,
  TELNET_WILL,
  TELNET_WONT,
} from '../telnet/TelnetConstants.js';
import {
  decodeBaudRate,
  decodeByteValue,
  encodeBaudRate,
  encodeByteValue,
  encodeRfc2217Subnegotiation,
  encodeTelnetNegotiation,
  getDesiredSerialSettings,
  getExpectedServerCommand,
  getRfc2217CommandName,
  getTelnetOptionName,
  RFC2217_NOTIFY_LINESTATE,
  RFC2217_NOTIFY_MODEMSTATE,
  RFC2217_SERVER_NOTIFY_LINESTATE,
  RFC2217_SERVER_NOTIFY_MODEMSTATE,
  RFC2217_SERVER_SET_BAUDRATE,
  RFC2217_SERVER_SET_CONTROL,
  RFC2217_SERVER_SET_DATASIZE,
  RFC2217_SERVER_SET_LINESTATE_MASK,
  RFC2217_SERVER_SET_MODEMSTATE_MASK,
  RFC2217_SERVER_SET_PARITY,
  RFC2217_SERVER_SET_STOPSIZE,
  RFC2217_SET_BAUDRATE,
  RFC2217_SET_CONTROL,
  RFC2217_SET_DATASIZE,
  RFC2217_SET_LINESTATE_MASK,
  RFC2217_SET_MODEMSTATE_MASK,
  RFC2217_SET_PARITY,
  RFC2217_SET_STOPSIZE,
  Rfc2217SerialSettings,
  TELNET_OPTION_BINARY,
  TELNET_OPTION_COM_PORT,
  TELNET_OPTION_SUPPRESS_GO_AHEAD,
} from './Rfc2217Constants.js';

type OptionStatus = 'inactive' | 'requested' | 'enabled' | 'rejected';

interface PendingRfc2217Request<T> {
  key: string;
  command: number;
  decode: (payload: Buffer) => T;
  expectedValue: T;
  required: boolean;
  description: string;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
}

export interface Rfc2217ReadyEvent {
  degraded: boolean;
  degradedReason?: string;
}

interface Rfc2217NegotiatorOptions {
  node: SerialNode;
  writeRaw: (payload: Buffer) => void;
  negotiationTimeoutMs?: number;
}

export class Rfc2217Negotiator extends EventEmitter {
  private readonly desiredSettings: Rfc2217SerialSettings;
  private readonly negotiationTimeoutMs: number;
  private readonly localOptions = new Map<number, OptionStatus>();
  private readonly remoteOptions = new Map<number, OptionStatus>();
  private readonly pending = new Map<string, PendingRfc2217Request<unknown>>();
  private degradedReasons = new Set<string>();
  private ready = false;
  private readyPromise?: Promise<void>;
  private readyResolve?: () => void;
  private readyReject?: (error: Error) => void;
  private readyTimeout?: NodeJS.Timeout;
  private settingsStarted = false;
  private lineStateSupported = false;
  private modemStateSupported = false;

  constructor(private readonly options: Rfc2217NegotiatorOptions) {
    super();
    this.desiredSettings = getDesiredSerialSettings(options.node);
    this.negotiationTimeoutMs = options.negotiationTimeoutMs ?? 5000;
  }

  start(): Promise<void> {
    if (this.readyPromise) {
      return this.readyPromise;
    }

    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    this.armReadyTimeout();

    this.requestLocalOption(TELNET_OPTION_BINARY);
    this.requestRemoteOption(TELNET_OPTION_BINARY);
    this.requestLocalOption(TELNET_OPTION_SUPPRESS_GO_AHEAD);
    this.requestRemoteOption(TELNET_OPTION_SUPPRESS_GO_AHEAD);
    this.requestLocalOption(TELNET_OPTION_COM_PORT);
    this.requestRemoteOption(TELNET_OPTION_COM_PORT);
    this.maybeAdvance();

    return this.readyPromise;
  }

  reset(): void {
    if (this.readyTimeout) {
      clearTimeout(this.readyTimeout);
      this.readyTimeout = undefined;
    }

    for (const pending of this.pending.values()) {
      pending.reject(new Error('RFC2217 negotiation reset'));
    }

    this.pending.clear();
    this.ready = false;
    this.readyPromise = undefined;
    this.readyResolve = undefined;
    this.readyReject = undefined;
    this.settingsStarted = false;
    this.localOptions.clear();
    this.remoteOptions.clear();
    this.degradedReasons.clear();
    this.lineStateSupported = false;
    this.modemStateSupported = false;
  }

  getDiagnostics(): {
    degraded: boolean;
    degradedReason?: string;
    lineStateSupported: boolean;
    modemStateSupported: boolean;
  } {
    return {
      degraded: this.degradedReasons.size > 0,
      degradedReason: this.getDegradedReason(),
      lineStateSupported: this.lineStateSupported,
      modemStateSupported: this.modemStateSupported,
    };
  }

  handleTelnetCommand(event: TelnetCommandEvent): void {
    const { command, option } = event;
    if (!this.isSupportedOption(option)) {
      if (command === TELNET_DO) {
        this.options.writeRaw(encodeTelnetNegotiation(TELNET_WONT, option));
      } else if (command === TELNET_WILL) {
        this.options.writeRaw(encodeTelnetNegotiation(TELNET_DONT, option));
      }
      this.addDegradedReason(`Remote requested unsupported Telnet option ${getTelnetOptionName(option)}`);
      return;
    }

    if (command === TELNET_WILL) {
      this.remoteOptions.set(option, 'enabled');
      if (option === TELNET_OPTION_COM_PORT) {
        this.emit('protocolLog', { level: 'debug', message: 'Remote enabled COM-PORT-OPTION', option });
      }
      return void this.maybeAdvance();
    }

    if (command === TELNET_WONT) {
      this.remoteOptions.set(option, 'rejected');
      if (option === TELNET_OPTION_COM_PORT) {
        this.fail(new Error('Remote server rejected COM-PORT-OPTION'));
        return;
      }
      this.addDegradedReason(`Remote rejected ${getTelnetOptionName(option)}`);
      return void this.maybeAdvance();
    }

    if (command === TELNET_DO) {
      this.localOptions.set(option, 'enabled');
      return void this.maybeAdvance();
    }

    if (command === TELNET_DONT) {
      this.localOptions.set(option, 'rejected');
      if (option === TELNET_OPTION_COM_PORT) {
        this.fail(new Error('Remote server refused local COM-PORT-OPTION'));
        return;
      }
      this.addDegradedReason(`Remote refused local ${getTelnetOptionName(option)}`);
      return void this.maybeAdvance();
    }
  }

  handleSubnegotiation(event: TelnetSubnegotiationEvent): void {
    if (event.option !== TELNET_OPTION_COM_PORT || event.payload.length === 0) {
      return;
    }

    const command = event.payload[0];
    const payload = event.payload.subarray(1);
    const pendingKey = this.findPendingKey(command);

    if (command === RFC2217_SERVER_NOTIFY_LINESTATE || command === RFC2217_NOTIFY_LINESTATE) {
      if (payload.length === 1) {
        this.lineStateSupported = true;
        this.emit('lineState', payload[0]);
      }
      return;
    }

    if (command === RFC2217_SERVER_NOTIFY_MODEMSTATE || command === RFC2217_NOTIFY_MODEMSTATE) {
      if (payload.length === 1) {
        this.modemStateSupported = true;
        this.emit('modemState', payload[0]);
      }
      return;
    }

    if (!pendingKey) {
      this.emit('protocolLog', {
        level: 'debug',
        message: `Ignoring unexpected RFC2217 subnegotiation ${getRfc2217CommandName(command)}`,
        command,
      });
      return;
    }

    const pending = this.pending.get(pendingKey);
    if (!pending) {
      return;
    }

    this.pending.delete(pendingKey);

    try {
      const value = pending.decode(payload);
      if (value !== pending.expectedValue) {
        const message =
          `${pending.description} acknowledged unexpected value ${String(value)} ` +
          `(expected ${String(pending.expectedValue)})`;
        if (pending.required) {
          this.fail(new Error(message));
          return;
        }
        this.addDegradedReason(message);
      }
      pending.resolve(value);
    } catch (error) {
      if (pending.required) {
        this.fail(error instanceof Error ? error : new Error('Failed to decode RFC2217 response'));
        return;
      }
      this.addDegradedReason(
        `${pending.description} response decode failed: ${error instanceof Error ? error.message : 'unknown error'}`
      );
      pending.resolve(pending.expectedValue);
    }

    this.maybeFinishReady();
  }

  fail(error: Error): void {
    if (this.readyTimeout) {
      clearTimeout(this.readyTimeout);
      this.readyTimeout = undefined;
    }

    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
    this.readyReject?.(error);
  }

  private armReadyTimeout(): void {
    this.readyTimeout = setTimeout(() => {
      if (!this.isComPortOptionActive()) {
        this.fail(new Error('RFC2217 negotiation timed out before COM-PORT-OPTION became active'));
        return;
      }

      const requiredPending = Array.from(this.pending.values()).filter((pending) => pending.required);
      if (requiredPending.length > 0) {
        this.fail(
          new Error(
            `RFC2217 negotiation timed out waiting for required settings: ` +
            requiredPending.map((pending) => pending.description).join(', ')
          )
        );
        return;
      }

      const optionalPending = Array.from(this.pending.values());
      if (optionalPending.length > 0) {
        this.addDegradedReason(
          `RFC2217 server did not acknowledge optional settings: ` +
          optionalPending.map((pending) => pending.description).join(', ')
        );
        for (const pending of optionalPending) {
          this.pending.delete(pending.key);
          pending.resolve(pending.expectedValue);
        }
      } else {
        this.addDegradedReason('RFC2217 negotiation completed with partial server support');
      }

      this.maybeFinishReady();
    }, this.negotiationTimeoutMs);
  }

  private requestLocalOption(option: number): void {
    this.localOptions.set(option, 'requested');
    this.options.writeRaw(encodeTelnetNegotiation(TELNET_WILL, option));
  }

  private requestRemoteOption(option: number): void {
    this.remoteOptions.set(option, 'requested');
    this.options.writeRaw(encodeTelnetNegotiation(TELNET_DO, option));
  }

  private maybeAdvance(): void {
    if (!this.isComPortOptionActive()) {
      return;
    }

    if (!this.settingsStarted) {
      this.settingsStarted = true;
      this.emit('rfc2217Negotiating');
      void this.applySerialSettings();
      return;
    }

    this.maybeFinishReady();
  }

  private isComPortOptionActive(): boolean {
    return this.localOptions.get(TELNET_OPTION_COM_PORT) === 'enabled' &&
      this.remoteOptions.get(TELNET_OPTION_COM_PORT) === 'enabled';
  }

  private async applySerialSettings(): Promise<void> {
    try {
      await this.sendRequest({
        command: RFC2217_SET_BAUDRATE,
        payload: encodeBaudRate(this.desiredSettings.baudRate),
        decode: decodeBaudRate,
        expectedValue: this.desiredSettings.baudRate,
        required: true,
        description: 'baud rate',
      });
      await this.sendRequest({
        command: RFC2217_SET_DATASIZE,
        payload: encodeByteValue(this.desiredSettings.dataBits),
        decode: decodeByteValue,
        expectedValue: this.desiredSettings.dataBits,
        required: true,
        description: 'data size',
      });
      await this.sendRequest({
        command: RFC2217_SET_PARITY,
        payload: encodeByteValue(this.desiredSettings.parity),
        decode: decodeByteValue,
        expectedValue: this.desiredSettings.parity,
        required: true,
        description: 'parity',
      });
      await this.sendRequest({
        command: RFC2217_SET_STOPSIZE,
        payload: encodeByteValue(this.desiredSettings.stopBits),
        decode: decodeByteValue,
        expectedValue: this.desiredSettings.stopBits,
        required: true,
        description: 'stop bits',
      });
      await this.sendRequest({
        command: RFC2217_SET_CONTROL,
        payload: encodeByteValue(this.desiredSettings.control),
        decode: decodeByteValue,
        expectedValue: this.desiredSettings.control,
        required: false,
        description: 'control mode',
      });
      await this.sendRequest({
        command: RFC2217_SET_LINESTATE_MASK,
        payload: encodeByteValue(this.desiredSettings.lineStateMask),
        decode: decodeByteValue,
        expectedValue: this.desiredSettings.lineStateMask,
        required: false,
        description: 'line state mask',
      });
      await this.sendRequest({
        command: RFC2217_SET_MODEMSTATE_MASK,
        payload: encodeByteValue(this.desiredSettings.modemStateMask),
        decode: decodeByteValue,
        expectedValue: this.desiredSettings.modemStateMask,
        required: false,
        description: 'modem state mask',
      });
      this.maybeFinishReady();
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error('RFC2217 negotiation failed'));
    }
  }

  private sendRequest<T>(request: {
    command: number;
    payload: Buffer;
    decode: (payload: Buffer) => T;
    expectedValue: T;
    required: boolean;
    description: string;
  }): Promise<T> {
    const responseCommand = getExpectedServerCommand(request.command);
    const key = `${responseCommand}:${request.description}`;

    return new Promise<T>((resolve, reject) => {
      this.pending.set(key, {
        key,
        command: responseCommand,
        decode: request.decode,
        expectedValue: request.expectedValue,
        required: request.required,
        description: request.description,
        resolve,
        reject,
      });
      this.options.writeRaw(encodeRfc2217Subnegotiation(request.command, request.payload));
    });
  }

  private maybeFinishReady(): void {
    if (this.ready || !this.settingsStarted || this.pending.size > 0) {
      return;
    }

    this.ready = true;
    if (this.readyTimeout) {
      clearTimeout(this.readyTimeout);
      this.readyTimeout = undefined;
    }

    const event: Rfc2217ReadyEvent = {
      degraded: this.degradedReasons.size > 0,
      degradedReason: this.getDegradedReason(),
    };
    this.emit('ready', event);
    this.readyResolve?.();
  }

  private addDegradedReason(reason: string): void {
    this.degradedReasons.add(reason);
  }

  private getDegradedReason(): string | undefined {
    if (this.degradedReasons.size === 0) {
      return undefined;
    }
    return Array.from(this.degradedReasons).join('; ');
  }

  private findPendingKey(command: number): string | undefined {
    for (const [key, pending] of this.pending.entries()) {
      if (pending.command === command) {
        return key;
      }
    }
    return undefined;
  }

  private isSupportedOption(option: number): boolean {
    return option === TELNET_OPTION_BINARY ||
      option === TELNET_OPTION_SUPPRESS_GO_AHEAD ||
      option === TELNET_OPTION_COM_PORT;
  }
}
