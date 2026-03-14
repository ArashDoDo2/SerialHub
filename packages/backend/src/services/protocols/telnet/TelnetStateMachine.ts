export type TelnetParserState =
  | 'DATA'
  | 'IAC'
  | 'COMMAND'
  | 'SUBNEGOTIATION'
  | 'SUBNEGOTIATION_IAC';
