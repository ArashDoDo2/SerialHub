import { SerialNode } from '../../../repositories/SerialNodeRepository.js';
import {
  TELNET_DO,
  TELNET_DONT,
  TELNET_IAC,
  TELNET_SB,
  TELNET_SE,
  TELNET_WILL,
  TELNET_WONT,
  TelnetNegotiationCommand,
} from '../telnet/TelnetConstants.js';

export const TELNET_OPTION_BINARY = 0x00;
export const TELNET_OPTION_SUPPRESS_GO_AHEAD = 0x03;
export const TELNET_OPTION_COM_PORT = 0x2c;

export const RFC2217_SET_BAUDRATE = 0x01;
export const RFC2217_SET_DATASIZE = 0x02;
export const RFC2217_SET_PARITY = 0x03;
export const RFC2217_SET_STOPSIZE = 0x04;
export const RFC2217_SET_CONTROL = 0x05;
export const RFC2217_NOTIFY_LINESTATE = 0x06;
export const RFC2217_NOTIFY_MODEMSTATE = 0x07;
export const RFC2217_FLOWCONTROL_SUSPEND = 0x08;
export const RFC2217_FLOWCONTROL_RESUME = 0x09;
export const RFC2217_SET_LINESTATE_MASK = 0x0a;
export const RFC2217_SET_MODEMSTATE_MASK = 0x0b;
export const RFC2217_PURGE_DATA = 0x0c;

export const RFC2217_SERVER_OFFSET = 100;

export const RFC2217_SERVER_SET_BAUDRATE = RFC2217_SET_BAUDRATE + RFC2217_SERVER_OFFSET;
export const RFC2217_SERVER_SET_DATASIZE = RFC2217_SET_DATASIZE + RFC2217_SERVER_OFFSET;
export const RFC2217_SERVER_SET_PARITY = RFC2217_SET_PARITY + RFC2217_SERVER_OFFSET;
export const RFC2217_SERVER_SET_STOPSIZE = RFC2217_SET_STOPSIZE + RFC2217_SERVER_OFFSET;
export const RFC2217_SERVER_SET_CONTROL = RFC2217_SET_CONTROL + RFC2217_SERVER_OFFSET;
export const RFC2217_SERVER_NOTIFY_LINESTATE = RFC2217_NOTIFY_LINESTATE + RFC2217_SERVER_OFFSET;
export const RFC2217_SERVER_NOTIFY_MODEMSTATE = RFC2217_NOTIFY_MODEMSTATE + RFC2217_SERVER_OFFSET;
export const RFC2217_SERVER_SET_LINESTATE_MASK = RFC2217_SET_LINESTATE_MASK + RFC2217_SERVER_OFFSET;
export const RFC2217_SERVER_SET_MODEMSTATE_MASK = RFC2217_SET_MODEMSTATE_MASK + RFC2217_SERVER_OFFSET;

export const RFC2217_PARITY_NONE = 0x01;
export const RFC2217_PARITY_ODD = 0x02;
export const RFC2217_PARITY_EVEN = 0x03;
export const RFC2217_PARITY_MARK = 0x04;
export const RFC2217_PARITY_SPACE = 0x05;

export const RFC2217_STOPSIZE_1 = 0x01;
export const RFC2217_STOPSIZE_2 = 0x02;
export const RFC2217_STOPSIZE_1_5 = 0x03;

export const RFC2217_CONTROL_OUTBOUND_FLOW_NONE = 0x01;
export const RFC2217_CONTROL_LINESTATE_MASK_ALL = 0xff;
export const RFC2217_CONTROL_MODEMSTATE_MASK_ALL = 0xff;

export interface Rfc2217SerialSettings {
  baudRate: number;
  dataBits: number;
  parity: number;
  stopBits: number;
  control: number;
  lineStateMask: number;
  modemStateMask: number;
}

export function getTelnetOptionName(option: number): string {
  switch (option) {
    case TELNET_OPTION_BINARY:
      return 'BINARY';
    case TELNET_OPTION_SUPPRESS_GO_AHEAD:
      return 'SUPPRESS-GO-AHEAD';
    case TELNET_OPTION_COM_PORT:
      return 'COM-PORT-OPTION';
    default:
      return `0x${option.toString(16)}`;
  }
}

export function getRfc2217CommandName(command: number): string {
  switch (command) {
    case RFC2217_SET_BAUDRATE:
      return 'SET-BAUDRATE';
    case RFC2217_SET_DATASIZE:
      return 'SET-DATASIZE';
    case RFC2217_SET_PARITY:
      return 'SET-PARITY';
    case RFC2217_SET_STOPSIZE:
      return 'SET-STOPSIZE';
    case RFC2217_SET_CONTROL:
      return 'SET-CONTROL';
    case RFC2217_NOTIFY_LINESTATE:
      return 'NOTIFY-LINESTATE';
    case RFC2217_NOTIFY_MODEMSTATE:
      return 'NOTIFY-MODEMSTATE';
    case RFC2217_SET_LINESTATE_MASK:
      return 'SET-LINESTATE-MASK';
    case RFC2217_SET_MODEMSTATE_MASK:
      return 'SET-MODEMSTATE-MASK';
    case RFC2217_SERVER_SET_BAUDRATE:
      return 'SERVER-SET-BAUDRATE';
    case RFC2217_SERVER_SET_DATASIZE:
      return 'SERVER-SET-DATASIZE';
    case RFC2217_SERVER_SET_PARITY:
      return 'SERVER-SET-PARITY';
    case RFC2217_SERVER_SET_STOPSIZE:
      return 'SERVER-SET-STOPSIZE';
    case RFC2217_SERVER_SET_CONTROL:
      return 'SERVER-SET-CONTROL';
    case RFC2217_SERVER_NOTIFY_LINESTATE:
      return 'SERVER-NOTIFY-LINESTATE';
    case RFC2217_SERVER_NOTIFY_MODEMSTATE:
      return 'SERVER-NOTIFY-MODEMSTATE';
    case RFC2217_SERVER_SET_LINESTATE_MASK:
      return 'SERVER-SET-LINESTATE-MASK';
    case RFC2217_SERVER_SET_MODEMSTATE_MASK:
      return 'SERVER-SET-MODEMSTATE-MASK';
    default:
      return `0x${command.toString(16)}`;
  }
}

export function getExpectedServerCommand(command: number): number {
  return command + RFC2217_SERVER_OFFSET;
}

export function encodeRfc2217Subnegotiation(command: number, payload: Buffer = Buffer.alloc(0)): Buffer {
  const framed = Buffer.concat([
    Buffer.from([TELNET_IAC, TELNET_SB, TELNET_OPTION_COM_PORT, command]),
    escapeTelnetData(payload),
    Buffer.from([TELNET_IAC, TELNET_SE]),
  ]);

  return framed;
}

export function encodeTelnetNegotiation(command: TelnetNegotiationCommand, option: number): Buffer {
  return Buffer.from([TELNET_IAC, command, option]);
}

export function escapeTelnetData(payload: Buffer): Buffer {
  const bytes: number[] = [];
  for (const byte of payload) {
    bytes.push(byte);
    if (byte === TELNET_IAC) {
      bytes.push(TELNET_IAC);
    }
  }
  return Buffer.from(bytes);
}

export function getDesiredSerialSettings(node: SerialNode): Rfc2217SerialSettings {
  return {
    baudRate: node.baudRate,
    dataBits: node.dataBits,
    parity: mapParity(node.parity),
    stopBits: mapStopBits(node.stopBits),
    control: RFC2217_CONTROL_OUTBOUND_FLOW_NONE,
    lineStateMask: RFC2217_CONTROL_LINESTATE_MASK_ALL,
    modemStateMask: RFC2217_CONTROL_MODEMSTATE_MASK_ALL,
  };
}

export function encodeBaudRate(value: number): Buffer {
  const payload = Buffer.alloc(4);
  payload.writeUInt32BE(value >>> 0, 0);
  return payload;
}

export function decodeBaudRate(payload: Buffer): number {
  if (payload.length !== 4) {
    throw new Error(`Invalid baud rate payload length ${payload.length}`);
  }

  return payload.readUInt32BE(0);
}

export function encodeByteValue(value: number): Buffer {
  return Buffer.from([value & 0xff]);
}

export function decodeByteValue(payload: Buffer): number {
  if (payload.length !== 1) {
    throw new Error(`Invalid RFC2217 byte payload length ${payload.length}`);
  }

  return payload[0];
}

export function isTelnetEnableCommand(command: number): command is typeof TELNET_DO | typeof TELNET_WILL {
  return command === TELNET_DO || command === TELNET_WILL;
}

export function isTelnetDisableCommand(command: number): command is typeof TELNET_DONT | typeof TELNET_WONT {
  return command === TELNET_DONT || command === TELNET_WONT;
}

function mapParity(parity: SerialNode['parity']): number {
  switch (parity) {
    case 'none':
      return RFC2217_PARITY_NONE;
    case 'odd':
      return RFC2217_PARITY_ODD;
    case 'even':
      return RFC2217_PARITY_EVEN;
    case 'mark':
      return RFC2217_PARITY_MARK;
    case 'space':
      return RFC2217_PARITY_SPACE;
  }
}

function mapStopBits(stopBits: number): number {
  if (stopBits === 1) {
    return RFC2217_STOPSIZE_1;
  }
  if (stopBits === 2) {
    return RFC2217_STOPSIZE_2;
  }
  return RFC2217_STOPSIZE_1_5;
}
