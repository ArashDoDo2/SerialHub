import { TraceEntry } from './types';

const TELNET_OPTION_NAMES: Record<number, string> = {
  0x00: 'BINARY',
  0x03: 'SUPPRESS-GO-AHEAD',
  0x2c: 'COM-PORT-OPTION',
};

const TELNET_COMMAND_NAMES: Record<number, string> = {
  0xfb: 'WILL',
  0xfc: 'WONT',
  0xfd: 'DO',
  0xfe: 'DONT',
};

const RFC2217_COMMAND_NAMES: Record<number, string> = {
  0x01: 'SET-BAUDRATE',
  0x02: 'SET-DATASIZE',
  0x03: 'SET-PARITY',
  0x04: 'SET-STOPSIZE',
  0x05: 'SET-CONTROL',
  0x06: 'NOTIFY-LINESTATE',
  0x07: 'NOTIFY-MODEMSTATE',
  0x08: 'FLOWCONTROL-SUSPEND',
  0x09: 'FLOWCONTROL-RESUME',
  0x0a: 'SET-LINESTATE-MASK',
  0x0b: 'SET-MODEMSTATE-MASK',
  0x0c: 'PURGE-DATA',
  0x65: 'SERVER-SET-BAUDRATE',
  0x66: 'SERVER-SET-DATASIZE',
  0x67: 'SERVER-SET-PARITY',
  0x68: 'SERVER-SET-STOPSIZE',
  0x69: 'SERVER-SET-CONTROL',
  0x6a: 'SERVER-NOTIFY-LINESTATE',
  0x6b: 'SERVER-NOTIFY-MODEMSTATE',
  0x6e: 'SERVER-SET-LINESTATE-MASK',
  0x6f: 'SERVER-SET-MODEMSTATE-MASK',
};

const RFC2217_PARITY_NAMES: Record<number, string> = {
  0x01: 'none',
  0x02: 'odd',
  0x03: 'even',
  0x04: 'mark',
  0x05: 'space',
};

const RFC2217_STOP_SIZE_NAMES: Record<number, string> = {
  0x01: '1 stop bit',
  0x02: '2 stop bits',
  0x03: '1.5 stop bits',
};

export function decodeBase64ToBytes(base64: string): Uint8Array {
  if (!base64) {
    return new Uint8Array();
  }

  const raw = window.atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes;
}

export function encodeTextToBase64(value: string): string {
  if (!value) {
    return '';
  }

  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return window.btoa(binary);
}

export function formatHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join(' ');
}

export function formatMixed(bytes: Uint8Array, bytesPerLine = 16): string {
  const lines: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += bytesPerLine) {
    const slice = bytes.slice(offset, offset + bytesPerLine);
    const hex = Array.from(slice)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join(' ')
      .padEnd(bytesPerLine * 3 - 1, ' ');
    const ascii = Array.from(slice)
      .map((byte) => (byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.'))
      .join('');
    lines.push(`${offset.toString(16).padStart(4, '0')}  ${hex}  ${ascii}`);
  }
  return lines.join('\n');
}

export function describeTraceEntry(entry: TraceEntry): string | null {
  if (entry.message) {
    return entry.message;
  }
  if (entry.type === 'telnet-command' && entry.command !== undefined && entry.option !== undefined) {
    const commandName = TELNET_COMMAND_NAMES[entry.command] || `0x${entry.command.toString(16)}`;
    const optionName = TELNET_OPTION_NAMES[entry.option] || `0x${entry.option.toString(16)}`;
    return `${commandName} ${optionName}`;
  }
  if (entry.type === 'rfc2217' && entry.payloadBase64) {
    const bytes = decodeBase64ToBytes(entry.payloadBase64);
    if (bytes.length >= 1) {
      return describeRfc2217Payload(bytes);
    }
  }
  if (entry.error) {
    return entry.error;
  }
  return null;
}

function describeRfc2217Payload(bytes: Uint8Array): string {
  const command = bytes[0];
  const value = bytes.length > 1 ? bytes[1] : undefined;
  const commandName = RFC2217_COMMAND_NAMES[command] || `0x${command.toString(16)}`;

  if (command === 0x65 && bytes.length >= 5) {
    const baudRate =
      ((bytes[1] || 0) << 24) |
      ((bytes[2] || 0) << 16) |
      ((bytes[3] || 0) << 8) |
      (bytes[4] || 0);
    return `${commandName} = ${baudRate >>> 0}`;
  }

  if (command === 0x66 && value !== undefined) {
    return `${commandName} = ${value} data bits`;
  }

  if ((command === 0x67 || command === 0x03) && value !== undefined) {
    return `${commandName} = ${RFC2217_PARITY_NAMES[value] || `0x${value.toString(16)}`}`;
  }

  if ((command === 0x68 || command === 0x04) && value !== undefined) {
    return `${commandName} = ${RFC2217_STOP_SIZE_NAMES[value] || `0x${value.toString(16)}`}`;
  }

  if ((command === 0x69 || command === 0x05) && value !== undefined) {
    return `${commandName} = 0x${value.toString(16).padStart(2, '0')}`;
  }

  if ((command === 0x6a || command === 0x06) && value !== undefined) {
    return `${commandName} = 0x${value.toString(16).padStart(2, '0')} (line state bits)`;
  }

  if ((command === 0x6b || command === 0x07) && value !== undefined) {
    return `${commandName} = 0x${value.toString(16).padStart(2, '0')} (modem state bits)`;
  }

  if ((command === 0x6e || command === 0x0a) && value !== undefined) {
    return `${commandName} = 0x${value.toString(16).padStart(2, '0')} (line-state mask)`;
  }

  if ((command === 0x6f || command === 0x0b) && value !== undefined) {
    return `${commandName} = 0x${value.toString(16).padStart(2, '0')} (modem-state mask)`;
  }

  if (value !== undefined) {
    return `${commandName} = 0x${value.toString(16).padStart(2, '0')}`;
  }

  return commandName;
}
