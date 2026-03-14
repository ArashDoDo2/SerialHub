"use client";

export const dynamic = 'force-dynamic';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import {
  Activity,
  Binary,
  Bot,
  Cable,
  Clock3,
  Eraser,
  Eye,
  EyeOff,
  Sparkles,
  Plug2,
  Power,
  SendHorizontal,
} from 'lucide-react';
import StatusIndicator from '@/components/ui/StatusIndicator';

if (typeof window !== 'undefined') {
  require('xterm/css/xterm.css');
}

interface NodeItem {
  id: number;
  name: string;
  connectionType?: 'raw-tcp' | 'rfc2217';
}

interface TerminalChunk {
  id: number;
  timestamp: string;
  text: string;
  payloadBase64: string;
  payloadLength: number;
}

interface TraceEntry {
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

interface TransportCapabilities {
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

interface AIObservation {
  id: number;
  observerId: number;
  nodeId: number;
  observationType: 'result' | 'summary';
  severity: 'info' | 'warning' | 'critical';
  title?: string;
  content: string;
  createdAt: string;
}

interface AICopilotHypothesis {
  label: string;
  confidence: number;
}

interface AICopilotSuggestedAction {
  type: 'serial_command' | 'script';
  command?: string;
  scriptId?: number;
  scriptName?: string;
  reason: string;
}

interface AICopilotSuggestion {
  id: number;
  observerId: number;
  nodeId: number;
  suggestionType: 'suggestion' | 'summary';
  summary: string;
  hypotheses: AICopilotHypothesis[];
  suggestedActions: AICopilotSuggestedAction[];
  createdAt: string;
}

interface AIToolAction {
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

type DisplayMode = 'text' | 'hex' | 'mixed';

const MAX_TERMINAL_CHUNKS = 250;
const MAX_TRACE_ENTRIES = 250;

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

function decodeBase64ToBytes(base64: string): Uint8Array {
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

function encodeTextToBase64(value: string): string {
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

function formatHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join(' ');
}

function formatMixed(bytes: Uint8Array, bytesPerLine = 16): string {
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

function describeTraceEntry(entry: TraceEntry): string | null {
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

function resolveBackendUrl(): string {
  if (typeof window === 'undefined') {
    return process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
  }

  if (process.env.NEXT_PUBLIC_BACKEND_URL) {
    return process.env.NEXT_PUBLIC_BACKEND_URL;
  }

  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:3001`;
}

export default function TerminalPage() {
  const termRef = useRef<HTMLDivElement>(null);
  const termInstance = useRef<any>(null);
  const socketRef = useRef<any>(null);
  const controllerKeyRef = useRef<string>('');
  const showTimestampRef = useRef(false);
  const debugEnabledRef = useRef(false);
  const connectedRef = useRef(false);
  const lineEndingRef = useRef<'LF' | 'CR' | 'CRLF'>('LF');
  const selectedNodeIdRef = useRef<number | null>(null);
  const sessionIdRef = useRef<number | null>(null);
  const [nodes, setNodes] = useState<NodeItem[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [status, setStatus] = useState<'connected' | 'disconnected' | 'error'>('disconnected');
  const [connected, setConnected] = useState(false);
  const [showTimestamp, setShowTimestamp] = useState(false);
  const [lineEnding, setLineEnding] = useState<'LF' | 'CR' | 'CRLF'>('LF');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('text');
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [traceOpen, setTraceOpen] = useState(false);
  const [terminalChunks, setTerminalChunks] = useState<TerminalChunk[]>([]);
  const [traceEntries, setTraceEntries] = useState<TraceEntry[]>([]);
  const [transportCapabilities, setTransportCapabilities] = useState<TransportCapabilities | null>(null);
  const [transportState, setTransportState] = useState<string>('disconnected');
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [aiObservations, setAiObservations] = useState<AIObservation[]>([]);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [copilotSuggestions, setCopilotSuggestions] = useState<AICopilotSuggestion[]>([]);
  const [commandDraft, setCommandDraft] = useState('');
  const [aiActions, setAiActions] = useState<AIToolAction[]>([]);
  const [automationEnabled, setAutomationEnabled] = useState(false);
  const [automationObserverCount, setAutomationObserverCount] = useState(0);
  const [actionBusyId, setActionBusyId] = useState<number | null>(null);
  const [developerMode, setDeveloperMode] = useState(false);
  const [requestedNodeId, setRequestedNodeId] = useState<number | null>(null);

  const backendUrl = useMemo(() => resolveBackendUrl(), []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    setDeveloperMode(params.get('debug') === '1');

    const parsedNodeId = Number(params.get('nodeId'));
    setRequestedNodeId(Number.isInteger(parsedNodeId) && parsedNodeId > 0 ? parsedNodeId : null);
  }, []);

  const sendTerminalInput = (data: string) => {
    if (!data || !connectedRef.current || !selectedNodeIdRef.current || !socketRef.current) {
      return false;
    }

    socketRef.current.emit('terminal:input', { nodeId: selectedNodeIdRef.current, data });
    return true;
  };

  const pushLocalTrace = (
    entry: Omit<TraceEntry, 'id' | 'timestamp' | 'payloadBase64' | 'payloadLength'> & {
      payloadBase64?: string;
      payloadLength?: number;
    }
  ) => {
    if (!(developerMode && debugEnabledRef.current)) {
      return;
    }

    setTraceEntries((current) => {
      const next = [
        ...current,
        {
          id: current.length > 0 ? current[current.length - 1].id + 1 : 1,
          timestamp: new Date().toISOString(),
          payloadBase64: entry.payloadBase64 || '',
          payloadLength: entry.payloadLength ?? 0,
          ...entry,
        },
      ];
      return next.slice(-MAX_TRACE_ENTRIES);
    });
  };

  useEffect(() => {
    fetch('/api/nodes')
      .then((response) => response.json())
      .then((data) => {
        setNodes(Array.isArray(data) ? data : []);
        if (Array.isArray(data) && data.length > 0) {
          const matchingNode = data.find((node) => node.id === requestedNodeId);
          setSelectedNodeId(matchingNode?.id ?? data[0].id);
        }
      })
      .catch(() => {
        setNodes([]);
      });
  }, [requestedNodeId]);

  useEffect(() => {
    if (!selectedNodeId) {
      setAiObservations([]);
      setCopilotSuggestions([]);
      setAiActions([]);
      return;
    }

    fetch(`/api/ai-observations?nodeId=${selectedNodeId}&limit=12`)
      .then((response) => response.json())
      .then((data) => {
        setAiObservations(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        setAiObservations([]);
      });

    fetch(`/api/ai-copilot/suggestions?nodeId=${selectedNodeId}&limit=12`)
      .then((response) => response.json())
      .then((data) => {
        setCopilotSuggestions(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        setCopilotSuggestions([]);
      });

    fetch(`/api/ai-automation/actions?nodeId=${selectedNodeId}&limit=12`)
      .then((response) => response.json())
      .then((data) => {
        setAiActions(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        setAiActions([]);
      });
  }, [selectedNodeId]);

  useEffect(() => {
    if (!sessionId) {
      setAutomationEnabled(false);
      setAutomationObserverCount(0);
      return;
    }

    fetch(`/api/ai-automation/sessions/${sessionId}`)
      .then((response) => response.json())
      .then((data) => {
        setAutomationEnabled(Boolean(data.enabled));
        setAutomationObserverCount(Number(data.observerCount) || 0);
      })
      .catch(() => {
        setAutomationEnabled(false);
        setAutomationObserverCount(0);
      });
  }, [sessionId]);

  useEffect(() => {
    showTimestampRef.current = showTimestamp;
  }, [showTimestamp]);

  useEffect(() => {
    debugEnabledRef.current = debugEnabled;
  }, [debugEnabled]);

  useEffect(() => {
    connectedRef.current = connected;
  }, [connected]);

  useEffect(() => {
    lineEndingRef.current = lineEnding;
  }, [lineEnding]);

  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId;
  }, [selectedNodeId]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    controllerKeyRef.current =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `terminal-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    let cancelled = false;
    let frameHandle = 0;
    let term: any;

    const mountTerminal = async (attempt = 0) => {
      const host = termRef.current;
      if (cancelled) {
        return;
      }

      if (!host || !host.isConnected || host.clientWidth === 0 || host.clientHeight === 0) {
        if (attempt < 10) {
          frameHandle = window.requestAnimationFrame(() => {
            void mountTerminal(attempt + 1);
          });
        }
        return;
      }

      const xtermModule = await import('xterm');
      if (cancelled) {
        return;
      }

      term = new xtermModule.Terminal({
        theme: { background: '#000000', cursor: 'block' },
        scrollback: 1000,
        cursorBlink: true,
      });
      termInstance.current = term;
      term.open(host);
      term.focus();

      const pinViewportToBottom = () => {
        window.requestAnimationFrame(() => {
          try {
            term.scrollToBottom();
          } catch {
            // ignore transient viewport refresh issues
          }
        });
      };

      host.addEventListener('click', () => {
        term.focus();
      });

      term.onData((data: string) => {
        if (data === '\r') {
          const suffix =
            lineEndingRef.current === 'CRLF'
              ? '\r\n'
              : lineEndingRef.current === 'CR'
                ? '\r'
                : '\n';
          const sent = sendTerminalInput(suffix);
          if (!sent) {
            return;
          }
          pushLocalTrace({
            direction: 'outbound',
            type: 'data',
            payloadBase64: encodeTextToBase64(suffix),
            payloadLength: suffix.length,
            sessionId: sessionIdRef.current ?? undefined,
            message: 'Interactive terminal input: [enter]',
          });
          return;
        }

        if (data === '\u0003') {
          const sent = sendTerminalInput(data);
          if (!sent) {
            return;
          }
          pushLocalTrace({
            direction: 'outbound',
            type: 'data',
            payloadBase64: encodeTextToBase64(data),
            payloadLength: data.length,
            sessionId: sessionIdRef.current ?? undefined,
            message: 'Interactive terminal input: Ctrl+C',
          });
          return;
        }

        const sent = sendTerminalInput(data);
        if (!sent) {
          return;
        }
        pushLocalTrace({
          direction: 'outbound',
          type: 'data',
          payloadBase64: encodeTextToBase64(data),
          payloadLength: data.length,
          sessionId: sessionIdRef.current ?? undefined,
          message: `Interactive terminal input: ${data}`,
        });
        pinViewportToBottom();
      });
    };

    frameHandle = window.requestAnimationFrame(() => {
      void mountTerminal();
    });

    const socket = io(backendUrl, { withCredentials: true });
    socketRef.current = socket;

    socket.on('connect', () => {
      setLastError(null);
      pushLocalTrace({
        direction: 'inbound',
        type: 'control',
        message: `Realtime socket connected to ${backendUrl}`,
      });
    });

    socket.on('connect_error', (error: Error) => {
      setLastError(`Realtime socket connection failed: ${error.message}`);
      pushLocalTrace({
        direction: 'inbound',
        type: 'control',
        error: error.message,
        message: `Realtime socket connection failed: ${error.message}`,
      });
    });

    socket.on('terminal:data', (msg: { data: string; payloadBase64?: string; payloadLength?: number }) => {
      const prefix = showTimestampRef.current ? `[${new Date().toISOString()}] ` : '';
      term.write(prefix + msg.data);
      window.requestAnimationFrame(() => {
        try {
          term.scrollToBottom();
        } catch {
          // ignore transient viewport refresh issues
        }
      });
      if (!(developerMode && debugEnabledRef.current)) {
        return;
      }
      setTerminalChunks((current) => {
        const next = [
          ...current,
          {
            id: current.length > 0 ? current[current.length - 1].id + 1 : 1,
            timestamp: new Date().toISOString(),
            text: msg.data,
            payloadBase64: msg.payloadBase64 || '',
            payloadLength: msg.payloadLength ?? 0,
          },
        ];
        return next.slice(-MAX_TERMINAL_CHUNKS);
      });
    });

    socket.on('terminal:connected', () => {
      setStatus('connected');
      setConnected(true);
      setLastError(null);
      pushLocalTrace({
        direction: 'inbound',
        type: 'control',
        message: 'Terminal session connected',
      });
    });

    socket.on('terminal:disconnected', () => {
      setStatus('disconnected');
      setConnected(false);
      pushLocalTrace({
        direction: 'inbound',
        type: 'control',
        message: 'Terminal session disconnected',
      });
    });

    socket.on('terminal:error', (msg: { error?: string }) => {
      setStatus('error');
      setConnected(false);
      setLastError(msg.error || 'Terminal error');
      pushLocalTrace({
        direction: 'inbound',
        type: 'control',
        error: msg.error || 'Terminal error',
        message: msg.error || 'Terminal error',
      });
    });

    socket.on(
      'terminal:capabilities',
      (msg: { state?: string; capabilities?: TransportCapabilities | null }) => {
        const nextState = msg.state || 'disconnected';
        setTransportState(nextState);
        setTransportCapabilities(msg.capabilities || null);
        if (nextState === 'connected' || nextState === 'ready') {
          setStatus('connected');
          setConnected(true);
          setLastError(null);
        } else if (nextState === 'disconnected') {
          setStatus('disconnected');
          setConnected(false);
        } else if (nextState === 'error') {
          setStatus('error');
          setConnected(false);
        }
        pushLocalTrace({
          direction: 'inbound',
          type: 'control',
          message: `Capability update: state=${nextState} transport=${msg.capabilities?.connectionType || 'unknown'}`,
        });
      }
    );

    socket.on('terminal:trace', (entry: Omit<TraceEntry, 'id'>) => {
      setTraceEntries((current) => {
        const next = [
          ...current,
          {
            ...entry,
            id: current.length > 0 ? current[current.length - 1].id + 1 : 1,
          },
        ];
        return next.slice(-MAX_TRACE_ENTRIES);
      });
    });

    socket.on('ai:observation', (observation: AIObservation) => {
      setAiObservations((current) => [observation, ...current.filter((item) => item.id !== observation.id)].slice(0, 12));
    });

    socket.on('ai:copilot:suggestion', (suggestion: AICopilotSuggestion) => {
      setCopilotSuggestions((current) => [suggestion, ...current.filter((item) => item.id !== suggestion.id)].slice(0, 12));
    });

    socket.on('ai:automation:action', (action: AIToolAction) => {
      setAiActions((current) => [action, ...current.filter((item) => item.id !== action.id)].slice(0, 12));
    });

    socket.on('ai:automation:session', (payload: { enabled?: boolean; observerCount?: number }) => {
      setAutomationEnabled(Boolean(payload.enabled));
      setAutomationObserverCount(Number(payload.observerCount) || 0);
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameHandle);
      socket.disconnect();
      term?.dispose();
      termInstance.current = null;
    };
  }, [backendUrl]);

  useEffect(() => {
    if (!socketRef.current) {
      return;
    }

    socketRef.current.emit('terminal:debug:set', { enabled: developerMode && debugEnabled });
  }, [debugEnabled, developerMode]);

  useEffect(() => {
    if (!socketRef.current || !connected || !selectedNodeId || !sessionId) {
      return;
    }

    const timer = window.setInterval(() => {
      if (!socketRef.current?.connected) {
        return;
      }
      socketRef.current.emit('terminal:heartbeat', {
        nodeId: selectedNodeIdRef.current,
        controllerKey: controllerKeyRef.current,
        sessionId: sessionIdRef.current,
      });
    }, 15000);

    return () => {
      window.clearInterval(timer);
    };
  }, [connected, selectedNodeId, sessionId]);

  useEffect(() => {
    if (!debugEnabled) {
      setDisplayMode('text');
      setTraceOpen(false);
    }
  }, [debugEnabled]);

  const connectToNode = async () => {
    if (!selectedNodeId) {
      setLastError('Select a node before connecting.');
      pushLocalTrace({
        direction: 'outbound',
        type: 'control',
        error: 'Connect blocked: no node selected',
        message: 'Connect blocked: no node selected',
      });
      return;
    }

    if (!socketRef.current?.connected) {
      setLastError('Realtime socket is not connected yet. Wait a moment and try again.');
      pushLocalTrace({
        direction: 'outbound',
        type: 'control',
        error: 'Connect blocked: realtime socket not connected',
        message: 'Connect blocked: realtime socket not connected',
      });
      return;
    }

    setLastError(null);
    pushLocalTrace({
      direction: 'outbound',
      type: 'control',
      message: `Requesting terminal start for node ${selectedNodeId}`,
    });

    const response = await fetch('/api/terminal/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeId: selectedNodeId, controllerKey: controllerKeyRef.current }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setStatus('error');
      setConnected(false);
      const message = payload?.error || 'Failed to acquire terminal control';
      setLastError(message);
      termInstance.current?.write(`\r\n[${message}]\r\n`);
      pushLocalTrace({
        direction: 'inbound',
        type: 'control',
        error: message,
        message,
      });
      return;
    }

    const result = await response.json();
    setSessionId(result.sessionId ?? null);
    pushLocalTrace({
      direction: 'outbound',
      type: 'control',
      sessionId: result.sessionId,
      message: `Terminal start acknowledged with session ${result.sessionId}`,
    });
    socketRef.current.emit('terminal:subscribe', {
      nodeId: selectedNodeId,
      controllerKey: controllerKeyRef.current,
      sessionId: result.sessionId,
    });
  };

  const disconnectFromNode = async () => {
    if (!selectedNodeId || !socketRef.current?.connected) {
      return;
    }

    pushLocalTrace({
      direction: 'outbound',
      type: 'control',
      sessionId: sessionId ?? undefined,
      message: `Requesting terminal stop for node ${selectedNodeId}`,
    });
    socketRef.current.emit('terminal:unsubscribe', {
      nodeId: selectedNodeId,
      controllerKey: controllerKeyRef.current,
      sessionId: sessionId ?? undefined,
    });

    await fetch('/api/terminal/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeId: selectedNodeId, controllerKey: controllerKeyRef.current }),
    });

    setStatus('disconnected');
    setConnected(false);
    setTransportCapabilities(null);
    setTransportState('disconnected');
    setSessionId(null);
    setLastError(null);
  };

  const sendCommand = (command: string) => {
    if (!command) {
      return;
    }

    const suffix = lineEnding === 'CRLF' ? '\r\n' : lineEnding === 'CR' ? '\r' : '\n';
    const sent = sendTerminalInput(command + suffix);
    if (!sent) {
      return;
    }
    termInstance.current?.write(`\r\n> ${command}${suffix}`);
    pushLocalTrace({
      direction: 'outbound',
      type: 'data',
      payloadBase64: encodeTextToBase64(command + suffix),
      payloadLength: (command + suffix).length,
      sessionId: sessionIdRef.current ?? undefined,
      message: `Command input: ${command}`,
    });
  };

  const dismissSuggestion = (suggestionId: number) => {
    setCopilotSuggestions((current) => current.filter((item) => item.id !== suggestionId));
  };

  const startAutomationSession = async () => {
    if (!selectedNodeId || !sessionId) {
      return;
    }
    const response = await fetch('/api/ai-automation/sessions/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ terminalSessionId: sessionId, nodeId: selectedNodeId }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setLastError(payload?.error || 'Failed to start AI session');
      return;
    }
    const payload = await response.json();
    setAutomationEnabled(Boolean(payload.enabled));
    setAutomationObserverCount(Number(payload.observerCount) || 0);
  };

  const stopAutomationSession = async () => {
    if (!selectedNodeId || !sessionId) {
      return;
    }
    const response = await fetch('/api/ai-automation/sessions/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ terminalSessionId: sessionId, nodeId: selectedNodeId }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setLastError(payload?.error || 'Failed to stop AI session');
      return;
    }
    setAutomationEnabled(false);
    setAutomationObserverCount(0);
  };

  const approveAction = async (actionId: number) => {
    setActionBusyId(actionId);
    try {
      const response = await fetch(`/api/ai-automation/actions/${actionId}/approve`, { method: 'POST' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setLastError(payload?.error || 'Failed to approve action');
        return;
      }
      if (payload?.action) {
        setAiActions((current) => [payload.action, ...current.filter((item) => item.id !== payload.action.id)].slice(0, 12));
      }
    } finally {
      setActionBusyId(null);
    }
  };

  const rejectAction = async (actionId: number) => {
    setActionBusyId(actionId);
    try {
      const response = await fetch(`/api/ai-automation/actions/${actionId}/reject`, { method: 'POST' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setLastError(payload?.error || 'Failed to reject action');
        return;
      }
      setAiActions((current) => [payload, ...current.filter((item) => item.id !== payload.id)].slice(0, 12));
    } finally {
      setActionBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <p className="page-kicker">Exclusive Control</p>
          <h1 className="page-title">Terminal</h1>
        </div>
        <div className="panel-muted flex items-center gap-3 px-4 py-3">
          <Clock3 className="h-4 w-4 text-cyan-300" />
          <span className="text-sm text-slate-300">Single-controller serial session</span>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <div className="panel space-y-5 p-5">
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Session</div>
            <div className="mt-2 flex items-center justify-between">
              <div className="text-xl font-semibold text-white">Connection controls</div>
              <StatusIndicator status={status} />
            </div>
            {lastError && (
              <div className="mt-3 rounded-2xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                {lastError}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <label className="text-xs uppercase tracking-[0.24em] text-slate-500">Target node</label>
            <select
              value={selectedNodeId ?? ''}
              onChange={(event) => setSelectedNodeId(Number(event.target.value))}
              className="field w-full"
            >
              <option value="" disabled>
                Select node
              </option>
              {nodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={connectToNode}
              disabled={!selectedNodeId || connected}
              className="action-button-primary gap-2"
            >
              <Plug2 className="h-4 w-4" />
              Connect
            </button>
            <button
              type="button"
              onClick={disconnectFromNode}
              disabled={!selectedNodeId || !connected}
              className="action-button gap-2"
            >
              <Power className="h-4 w-4" />
              Disconnect
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                termInstance.current?.clear();
                setTerminalChunks([]);
                setTraceEntries([]);
              }}
              className="action-button gap-2"
            >
              <Eraser className="h-4 w-4" />
              Clear
            </button>
            <select
              value={lineEnding}
              onChange={(event) => setLineEnding(event.target.value as 'LF' | 'CR' | 'CRLF')}
              className="field"
            >
              <option value="LF">LF</option>
              <option value="CR">CR</option>
              <option value="CRLF">CRLF</option>
            </select>
          </div>

          <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
            <span className="inline-flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-amber-200" />
              Show timestamps
            </span>
            <input
              type="checkbox"
              checked={showTimestamp}
              onChange={() => setShowTimestamp((value) => !value)}
              className="h-4 w-4 rounded border-white/10 bg-slate-950/70 text-cyan-300"
            />
          </label>

          <div className="rounded-[24px] border border-cyan-400/15 bg-gradient-to-br from-cyan-300/10 to-slate-900/60 p-4">
            <div className="flex items-center gap-2 text-cyan-100">
              <Cable className="h-4 w-4" />
              <span className="text-sm font-medium">Live serial routing</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Terminal control is exclusive. Release the session before running automation on the
              same node.
            </p>
          </div>

          {developerMode && (
            <div className="space-y-3 rounded-[24px] border border-amber-400/15 bg-amber-300/5 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.24em] text-amber-200/70">Developer</div>
                  <div className="mt-1 text-sm font-medium text-white">Debug tools</div>
                </div>
                <button
                  type="button"
                  className="action-button gap-2 px-3 py-2"
                  onClick={() => setDebugEnabled((value) => !value)}
                >
                  {debugEnabled ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  {debugEnabled ? 'Disable' : 'Enable'}
                </button>
              </div>

              {debugEnabled && (
                <>
                  <div className="space-y-2">
                    <label className="text-xs uppercase tracking-[0.24em] text-slate-500">Display mode</label>
                    <select
                      value={displayMode}
                      onChange={(event) => setDisplayMode(event.target.value as DisplayMode)}
                      className="field w-full"
                    >
                      <option value="text">Text</option>
                      <option value="hex">Hex</option>
                      <option value="mixed">Mixed</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    className="action-button w-full justify-center gap-2"
                    onClick={() => setTraceOpen((value) => !value)}
                  >
                    <Activity className="h-4 w-4" />
                    {traceOpen ? 'Hide Protocol Trace' : 'Show Protocol Trace'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="panel overflow-hidden p-4">
          <div className="mb-4 flex items-center justify-between rounded-[22px] border border-white/10 bg-white/5 px-4 py-3">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Console</div>
              <div className="mt-1 text-sm text-slate-300">
                {displayMode === 'text' ? 'Raw serial stream and manual input' : 'Binary-safe serial viewer'}
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-slate-500">
              <SendHorizontal className="h-4 w-4 text-cyan-300" />
              {displayMode}
            </div>
          </div>
          <div className="relative min-h-[420px]">
            <div
              ref={termRef}
              className={`absolute inset-0 overflow-auto rounded-[24px] border border-white/10 bg-[#020617] p-2 ${
                displayMode === 'text' ? '' : 'pointer-events-none opacity-0'
              }`}
            />
            {displayMode !== 'text' && (
              <div className="absolute inset-0 overflow-auto rounded-[24px] border border-white/10 bg-[#020617] p-4 font-mono text-xs leading-6 text-cyan-100">
              {terminalChunks.length === 0 ? (
                <div className="text-slate-500">No serial data captured yet.</div>
              ) : (
                terminalChunks.map((chunk) => {
                  const bytes = decodeBase64ToBytes(chunk.payloadBase64);
                  return (
                    <div key={chunk.id} className="border-b border-white/5 py-2 last:border-b-0">
                      <div className="mb-1 text-[11px] uppercase tracking-[0.2em] text-slate-500">
                        {chunk.timestamp} | {chunk.payloadLength} bytes
                      </div>
                      <pre className="whitespace-pre-wrap break-all">
                        {displayMode === 'hex' ? formatHex(bytes) : formatMixed(bytes)}
                      </pre>
                    </div>
                  );
                })
              )}
              </div>
            )}
          </div>
          <div className="mt-4">
            <input
              type="text"
              placeholder="Type a command and press Enter"
              className="field w-full"
              value={commandDraft}
              onChange={(event) => setCommandDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  sendCommand(commandDraft);
                  setCommandDraft('');
                }
              }}
            />
          </div>

          <div className="mt-4 rounded-[22px] border border-cyan-400/15 bg-cyan-300/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-slate-500">
                <Bot className="h-4 w-4 text-cyan-300" />
                AI copilot
              </div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                Suggestions only
              </div>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Copilot can summarize serial output and suggest commands or scripts. It cannot execute anything on the device.
            </p>
            <div className="mt-4 space-y-3">
              {copilotSuggestions.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-3 py-3 text-sm text-slate-400">
                  No copilot suggestions for this node yet.
                </div>
              ) : (
                copilotSuggestions.map((suggestion) => (
                  <div
                    key={suggestion.id}
                    className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-4 text-sm text-slate-300"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-white">{suggestion.summary}</div>
                        <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                          {suggestion.suggestionType} • {suggestion.createdAt}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="action-button px-3 py-2 text-xs"
                        onClick={() => dismissSuggestion(suggestion.id)}
                      >
                        Ignore
                      </button>
                    </div>

                    {suggestion.hypotheses.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {suggestion.hypotheses.map((hypothesis, index) => (
                          <div
                            key={`${suggestion.id}-hypothesis-${index}`}
                            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-slate-300"
                          >
                            {hypothesis.label} {(hypothesis.confidence * 100).toFixed(0)}%
                          </div>
                        ))}
                      </div>
                    )}

                    {suggestion.suggestedActions.length > 0 && (
                      <div className="mt-4 space-y-2">
                        {suggestion.suggestedActions.map((action, index) => (
                          <div
                            key={`${suggestion.id}-action-${index}`}
                            className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3"
                          >
                            <div className="text-white">
                              {action.type === 'serial_command'
                                ? action.command
                                : action.scriptName || (action.scriptId ? `Script #${action.scriptId}` : 'Suggested script')}
                            </div>
                            <div className="mt-1 text-sm leading-6 text-slate-400">{action.reason}</div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {action.type === 'serial_command' && action.command && (
                                <button
                                  type="button"
                                  className="action-button px-3 py-2 text-xs"
                                  onClick={() => setCommandDraft(action.command || '')}
                                >
                                  Use in input
                                </button>
                              )}
                              {action.type === 'script' && (
                                <a
                                  href={action.scriptId ? `/scripts?scriptId=${action.scriptId}` : '/scripts'}
                                  className="action-button inline-flex items-center px-3 py-2 text-xs"
                                >
                                  Open scripts
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-4 rounded-[22px] border border-emerald-400/15 bg-emerald-300/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-slate-500">AI Actions</div>
                <div className="mt-1 text-sm text-slate-300">
                  Optional tool-driven AI automation with approval control
                </div>
              </div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                {automationEnabled ? `active • ${automationObserverCount} agents` : 'inactive'}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="action-button-primary px-3 py-2 text-xs"
                disabled={!connected || !sessionId || automationEnabled}
                onClick={() => void startAutomationSession()}
              >
                Enable AI session
              </button>
              <button
                type="button"
                className="action-button px-3 py-2 text-xs"
                disabled={!sessionId || !automationEnabled}
                onClick={() => void stopAutomationSession()}
              >
                Stop AI session
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {aiActions.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-3 py-3 text-sm text-slate-400">
                  No AI tool actions recorded for this node yet.
                </div>
              ) : (
                aiActions.map((action) => (
                  <div key={action.id} className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-4 text-sm text-slate-300">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-white">{action.toolName}</div>
                        <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                          {action.status} • {action.createdAt}
                        </div>
                      </div>
                      {action.status === 'pending_approval' && (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="action-button-primary px-3 py-2 text-xs"
                            disabled={actionBusyId === action.id}
                            onClick={() => void approveAction(action.id)}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="action-button px-3 py-2 text-xs"
                            disabled={actionBusyId === action.id}
                            onClick={() => void rejectAction(action.id)}
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                    <pre className="mt-3 whitespace-pre-wrap break-all rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-xs text-cyan-100">
                      {JSON.stringify(action.arguments, null, 2)}
                    </pre>
                    {action.result !== null && action.result !== undefined && (
                      <pre className="mt-3 whitespace-pre-wrap break-all rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-xs text-slate-300">
                        {JSON.stringify(action.result, null, 2)}
                      </pre>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {developerMode && debugEnabled && (
            <div className="mt-4 space-y-4">
              <div className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-3">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-slate-500">
                  <Binary className="h-4 w-4 text-cyan-300" />
                  Transport capabilities
                </div>
                <div className="mt-3 grid gap-2 text-sm text-slate-300 md:grid-cols-2">
                  <div>State: <span className="text-white">{transportState}</span></div>
                  <div>Transport: <span className="text-white">{transportCapabilities?.connectionType ?? nodes.find((node) => node.id === selectedNodeId)?.connectionType ?? 'unknown'}</span></div>
                  <div>RFC2217: <span className="text-white">{transportCapabilities?.supportsRfc2217 ? 'yes' : 'no'}</span></div>
                  <div>Baud control: <span className="text-white">{transportCapabilities?.supportsBaudControl ? 'yes' : 'no'}</span></div>
                  <div>Flow control: <span className="text-white">{transportCapabilities?.supportsFlowControl ? 'yes' : 'no'}</span></div>
                  <div>Modem signals: <span className="text-white">{transportCapabilities?.supportsModemSignals ? 'yes' : 'no'}</span></div>
                </div>
                {transportCapabilities?.degraded && (
                  <div className="mt-3 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
                    Degraded: {transportCapabilities.degradedReason || 'Partial transport capability'}
                  </div>
                )}
              </div>

              <div className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-slate-500">
                    <Sparkles className="h-4 w-4 text-cyan-300" />
                    AI observer
                  </div>
                  <button
                    type="button"
                    className="action-button gap-2 px-3 py-2"
                    onClick={() => setShowAiPanel((value) => !value)}
                  >
                    {showAiPanel ? 'Hide' : 'Show'}
                  </button>
                </div>
                {showAiPanel && (
                  <div className="mt-3 space-y-3">
                    {aiObservations.length === 0 ? (
                      <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-3 py-3 text-sm text-slate-400">
                        No AI observer analysis for this node yet.
                      </div>
                    ) : (
                      aiObservations.map((observation) => (
                        <div
                          key={observation.id}
                          className="rounded-2xl border border-white/10 bg-slate-950/40 px-3 py-3 text-sm text-slate-300"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-medium text-white">
                              {observation.title || observation.observationType}
                            </div>
                            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                              {observation.severity}
                            </div>
                          </div>
                          <div className="mt-2 leading-6 text-slate-300">{observation.content}</div>
                          <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                            {observation.createdAt}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {traceOpen && (
                <div className="rounded-[22px] border border-white/10 bg-[#020617] p-4">
                  <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-slate-500">
                    <Activity className="h-4 w-4 text-cyan-300" />
                    Protocol trace
                  </div>
                  <div className="max-h-[320px] space-y-3 overflow-auto font-mono text-xs">
                    {traceEntries.length === 0 ? (
                      <div className="text-slate-500">Protocol trace is enabled but no frames have been captured yet.</div>
                    ) : (
                      traceEntries.map((entry) => (
                        <div key={entry.id} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                            <span>{entry.timestamp}</span>
                            <span>{entry.direction}</span>
                            <span>{entry.type}</span>
                            <span>{entry.payloadLength} bytes</span>
                          </div>
                          {describeTraceEntry(entry) && (
                            <div className="mt-2 text-[11px] text-slate-400">{describeTraceEntry(entry)}</div>
                          )}
                          <pre className="mt-2 whitespace-pre-wrap break-all text-cyan-100">
                            {entry.payloadLength > 0
                              ? formatHex(decodeBase64ToBytes(entry.payloadBase64))
                              : 'no payload'}
                          </pre>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
