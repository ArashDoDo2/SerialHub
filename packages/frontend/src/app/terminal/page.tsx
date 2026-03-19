"use client";

export const dynamic = 'force-dynamic';

import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { Clock3 } from 'lucide-react';
import ConsolePanel from '@/components/terminal/ConsolePanel';
import SessionControls from '@/components/terminal/SessionControls';
import {
  AIObservation,
  AICopilotSuggestion,
  AIToolAction,
  DisplayMode,
  NodeItem,
  TerminalChunk,
  TerminalLockInfo,
  TraceEntry,
  TransportCapabilities,
} from '@/components/terminal/types';
import { encodeTextToBase64 } from '@/components/terminal/protocol';

if (typeof window !== 'undefined') {
  require('xterm/css/xterm.css');
}

const MAX_TERMINAL_CHUNKS = 250;
const MAX_TRACE_ENTRIES = 250;

function resolveRealtimeSocketConfig(): {
  url?: string;
  path: string;
  connectionLabel: string;
} {
  if (typeof window === 'undefined') {
    return {
      path: '/socket.io',
      connectionLabel: 'same-origin /socket.io proxy',
    };
  }

  if (process.env.NODE_ENV === 'production') {
    return {
      path: '/socket.io',
      connectionLabel: 'same-origin /socket.io proxy',
    };
  }

  if (process.env.NEXT_PUBLIC_BACKEND_URL) {
    return {
      url: process.env.NEXT_PUBLIC_BACKEND_URL,
      path: '/socket.io',
      connectionLabel: `${process.env.NEXT_PUBLIC_BACKEND_URL}/socket.io`,
    };
  }

  const { protocol, hostname } = window.location;
  const backendUrl = `${protocol}//${hostname}:3001`;
  return {
    url: backendUrl,
    path: '/socket.io',
    connectionLabel: `${backendUrl}/socket.io`,
  };
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
  const [lockInfo, setLockInfo] = useState<TerminalLockInfo | null>(null);
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
        const activeNodes = Array.isArray(data)
          ? data.filter((node): node is NodeItem => node?.isActive !== false)
          : [];
        setNodes(activeNodes);
        if (activeNodes.length > 0) {
          const matchingNode = activeNodes.find((node) => node.id === requestedNodeId);
          setSelectedNodeId(matchingNode?.id ?? activeNodes[0].id);
        } else {
          setSelectedNodeId(null);
        }
      })
      .catch(() => {
        setNodes([]);
        setSelectedNodeId(null);
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

    const realtimeSocketConfig = resolveRealtimeSocketConfig();
    const socket = io(realtimeSocketConfig.url, {
      path: realtimeSocketConfig.path,
      withCredentials: true,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setLastError(null);
      setLockInfo(null);
      pushLocalTrace({
        direction: 'inbound',
        type: 'control',
        message: `Realtime socket connected through ${realtimeSocketConfig.connectionLabel}`,
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
      setLockInfo(null);
      pushLocalTrace({
        direction: 'inbound',
        type: 'control',
        message: 'Terminal session connected',
      });
    });

    socket.on('terminal:disconnected', () => {
      setStatus('disconnected');
      setConnected(false);
      setLockInfo(null);
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
      setLockInfo(null);
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
      setAiObservations((current) =>
        [observation, ...current.filter((item) => item.id !== observation.id)].slice(0, 12)
      );
    });

    socket.on('ai:copilot:suggestion', (suggestion: AICopilotSuggestion) => {
      setCopilotSuggestions((current) =>
        [suggestion, ...current.filter((item) => item.id !== suggestion.id)].slice(0, 12)
      );
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
  }, []);

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
      setLockInfo(null);
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
      setLockInfo(null);
      pushLocalTrace({
        direction: 'outbound',
        type: 'control',
        error: 'Connect blocked: realtime socket not connected',
        message: 'Connect blocked: realtime socket not connected',
      });
      return;
    }

    setLastError(null);
    setLockInfo(null);
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
      setLockInfo(payload?.lockInfo || null);
      termInstance.current?.write(`\r\n[${message}]\r\n`);
      if (payload?.lockInfo) {
        termInstance.current?.write(
          `[locked by ${payload.lockInfo.userName} <${payload.lockInfo.userEmail}> from ${payload.lockInfo.clientAddress} since ${payload.lockInfo.startedAt}]\r\n`
        );
      }
      pushLocalTrace({
        direction: 'inbound',
        type: 'control',
        error: message,
        message: payload?.lockInfo
          ? `${message} (locked by ${payload.lockInfo.userName} from ${payload.lockInfo.clientAddress})`
          : message,
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
    setLockInfo(null);
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
        setAiActions((current) =>
          [payload.action, ...current.filter((item) => item.id !== payload.action.id)].slice(0, 12)
        );
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

  const clearTerminalView = () => {
    termInstance.current?.clear();
    setTerminalChunks([]);
    setTraceEntries([]);
  };

  const submitCommandDraft = () => {
    sendCommand(commandDraft);
    setCommandDraft('');
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
        <SessionControls
          status={status}
          lastError={lastError}
          lockInfo={lockInfo}
          nodes={nodes}
          selectedNodeId={selectedNodeId}
          connected={connected}
          lineEnding={lineEnding}
          showTimestamp={showTimestamp}
          developerMode={developerMode}
          debugEnabled={debugEnabled}
          displayMode={displayMode}
          traceOpen={traceOpen}
          onSelectedNodeIdChange={setSelectedNodeId}
          onConnect={connectToNode}
          onDisconnect={disconnectFromNode}
          onClear={clearTerminalView}
          onLineEndingChange={setLineEnding}
          onShowTimestampToggle={() => setShowTimestamp((value) => !value)}
          onDebugToggle={() => setDebugEnabled((value) => !value)}
          onDisplayModeChange={setDisplayMode}
          onTraceToggle={() => setTraceOpen((value) => !value)}
        />

        <ConsolePanel
          termRef={termRef}
          displayMode={displayMode}
          terminalChunks={terminalChunks}
          commandDraft={commandDraft}
          onCommandDraftChange={setCommandDraft}
          onCommandSubmit={submitCommandDraft}
          copilotSuggestions={copilotSuggestions}
          onDismissSuggestion={dismissSuggestion}
          onUseSuggestedCommand={setCommandDraft}
          automationEnabled={automationEnabled}
          automationObserverCount={automationObserverCount}
          connected={connected}
          sessionId={sessionId}
          aiActions={aiActions}
          actionBusyId={actionBusyId}
          onStartAutomationSession={startAutomationSession}
          onStopAutomationSession={stopAutomationSession}
          onApproveAction={approveAction}
          onRejectAction={rejectAction}
          developerMode={developerMode}
          debugEnabled={debugEnabled}
          transportState={transportState}
          transportCapabilities={transportCapabilities}
          nodes={nodes}
          selectedNodeId={selectedNodeId}
          showAiPanel={showAiPanel}
          onShowAiPanelToggle={() => setShowAiPanel((value) => !value)}
          aiObservations={aiObservations}
          traceOpen={traceOpen}
          traceEntries={traceEntries}
        />
      </div>
    </div>
  );
}
