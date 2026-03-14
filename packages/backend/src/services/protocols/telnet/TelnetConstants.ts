export const TELNET_IAC = 0xff;
export const TELNET_DONT = 0xfe;
export const TELNET_DO = 0xfd;
export const TELNET_WONT = 0xfc;
export const TELNET_WILL = 0xfb;
export const TELNET_SB = 0xfa;
export const TELNET_SE = 0xf0;

export type TelnetNegotiationCommand =
  | typeof TELNET_DO
  | typeof TELNET_DONT
  | typeof TELNET_WILL
  | typeof TELNET_WONT;

export function getTelnetCommandName(command: number): string {
  switch (command) {
    case TELNET_DO:
      return 'DO';
    case TELNET_DONT:
      return 'DONT';
    case TELNET_WILL:
      return 'WILL';
    case TELNET_WONT:
      return 'WONT';
    case TELNET_SB:
      return 'SB';
    case TELNET_SE:
      return 'SE';
    case TELNET_IAC:
      return 'IAC';
    default:
      return `0x${command.toString(16)}`;
  }
}
