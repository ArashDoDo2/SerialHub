export interface NodeItem {
  id: number;
  name: string;
  connectionType?: 'raw-tcp' | 'rfc2217';
  isActive?: boolean;
}

export interface TerminalChunk {
  id: number;
  timestamp: string;
  text: string;
  payloadBase64: string;
  payloadLength: number;
}

export interface TraceEntry {
  id: number;
  timestamp: string;
  direction: 'inbound' | 'outbound';
  type: 'data' | 'telnet-command' | 'rfc2217' | 'control';
  payloadBase64: string;
  payloadLength: number;
  command?: number;
  option?: number;
  error?: string;
  sessionId?: number;
  message?: string;
}

export interface TransportCapabilities {
  connectionType?: 'raw-tcp' | 'rfc2217';
  binarySafe?: boolean;
  appliesSerialSettings?: boolean;
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

export interface AIObservation {
  id: number;
  observerId: number;
  nodeId: number;
  observationType: 'result' | 'summary';
  severity: 'info' | 'warning' | 'critical';
  title?: string;
  content: string;
  createdAt: string;
}

export interface AICopilotHypothesis {
  label: string;
  confidence: number;
}

export interface AICopilotSuggestedAction {
  type: 'serial_command' | 'script';
  command?: string;
  scriptId?: number;
  scriptName?: string;
  reason: string;
}

export interface AICopilotSuggestion {
  id: number;
  observerId: number;
  nodeId: number;
  suggestionType: 'suggestion' | 'summary';
  summary: string;
  hypotheses: AICopilotHypothesis[];
  suggestedActions: AICopilotSuggestedAction[];
  createdAt: string;
}

export interface AIToolAction {
  id: number;
  observerId: number;
  terminalSessionId?: number;
  nodeId: number;
  toolName: string;
  status: 'pending_approval' | 'approved' | 'rejected' | 'executed' | 'failed' | 'blocked';
  arguments: Record<string, unknown>;
  result: unknown;
  requiresApproval: number;
  createdAt: string;
}

export interface TerminalLockInfo {
  sessionId: number;
  userId: number;
  userName: string;
  userEmail: string;
  clientAddress: string;
  startedAt: string;
  heartbeatAt?: string;
}

export type DisplayMode = 'text' | 'hex' | 'mixed';
