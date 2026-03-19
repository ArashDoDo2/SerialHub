"use client";

import { Activity, Cable, Clock3, Eraser, Eye, EyeOff, Plug2, Power } from 'lucide-react';
import StatusIndicator from '@/components/ui/StatusIndicator';
import { DisplayMode, NodeItem, TerminalLockInfo } from './types';

interface SessionControlsProps {
  status: 'connected' | 'disconnected' | 'error';
  lastError: string | null;
  lockInfo: TerminalLockInfo | null;
  nodes: NodeItem[];
  selectedNodeId: number | null;
  connected: boolean;
  lineEnding: 'LF' | 'CR' | 'CRLF';
  showTimestamp: boolean;
  developerMode: boolean;
  debugEnabled: boolean;
  displayMode: DisplayMode;
  traceOpen: boolean;
  onSelectedNodeIdChange: (value: number | null) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onClear: () => void;
  onLineEndingChange: (value: 'LF' | 'CR' | 'CRLF') => void;
  onShowTimestampToggle: () => void;
  onDebugToggle: () => void;
  onDisplayModeChange: (value: DisplayMode) => void;
  onTraceToggle: () => void;
}

export default function SessionControls({
  status,
  lastError,
  lockInfo,
  nodes,
  selectedNodeId,
  connected,
  lineEnding,
  showTimestamp,
  developerMode,
  debugEnabled,
  displayMode,
  traceOpen,
  onSelectedNodeIdChange,
  onConnect,
  onDisconnect,
  onClear,
  onLineEndingChange,
  onShowTimestampToggle,
  onDebugToggle,
  onDisplayModeChange,
  onTraceToggle,
}: SessionControlsProps) {
  return (
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
        {lockInfo && (
          <div className="mt-3 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-3 py-3 text-sm text-amber-100">
            <div className="font-medium text-amber-50">Current controller</div>
            <div className="mt-2 space-y-1 text-amber-100/90">
              <div>
                User: <span className="text-amber-50">{lockInfo.userName}</span> ({lockInfo.userEmail})
              </div>
              <div>
                IP: <span className="text-amber-50">{lockInfo.clientAddress}</span>
              </div>
              <div>
                Since: <span className="text-amber-50">{lockInfo.startedAt}</span>
              </div>
              {lockInfo.heartbeatAt && (
                <div>
                  Last heartbeat: <span className="text-amber-50">{lockInfo.heartbeatAt}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <label className="text-xs uppercase tracking-[0.24em] text-slate-500">Target node</label>
        <select
          value={selectedNodeId ?? ''}
          onChange={(event) => onSelectedNodeIdChange(event.target.value ? Number(event.target.value) : null)}
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
          onClick={onConnect}
          disabled={!selectedNodeId || connected}
          className="action-button-primary gap-2"
        >
          <Plug2 className="h-4 w-4" />
          Connect
        </button>
        <button
          type="button"
          onClick={onDisconnect}
          disabled={!selectedNodeId || !connected}
          className="action-button gap-2"
        >
          <Power className="h-4 w-4" />
          Disconnect
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={onClear} className="action-button gap-2">
          <Eraser className="h-4 w-4" />
          Clear
        </button>
        <select
          value={lineEnding}
          onChange={(event) => onLineEndingChange(event.target.value as 'LF' | 'CR' | 'CRLF')}
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
          onChange={onShowTimestampToggle}
          className="h-4 w-4 rounded border-white/10 bg-slate-950/70 text-cyan-300"
        />
      </label>

      <div className="rounded-[24px] border border-cyan-400/15 bg-gradient-to-br from-cyan-300/10 to-slate-900/60 p-4">
        <div className="flex items-center gap-2 text-cyan-100">
          <Cable className="h-4 w-4" />
          <span className="text-sm font-medium">Live serial routing</span>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Terminal control is exclusive. Release the session before running automation on the same
          node.
        </p>
      </div>

      {developerMode && (
        <div className="space-y-3 rounded-[24px] border border-amber-400/15 bg-amber-300/5 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-amber-200/70">Developer</div>
              <div className="mt-1 text-sm font-medium text-white">Debug tools</div>
            </div>
            <button type="button" className="action-button gap-2 px-3 py-2" onClick={onDebugToggle}>
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
                  onChange={(event) => onDisplayModeChange(event.target.value as DisplayMode)}
                  className="field w-full"
                >
                  <option value="text">Text</option>
                  <option value="hex">Hex</option>
                  <option value="mixed">Mixed</option>
                </select>
              </div>
              <button type="button" className="action-button w-full justify-center gap-2" onClick={onTraceToggle}>
                <Activity className="h-4 w-4" />
                {traceOpen ? 'Hide Protocol Trace' : 'Show Protocol Trace'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
