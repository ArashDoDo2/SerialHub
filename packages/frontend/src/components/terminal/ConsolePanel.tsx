"use client";

import React from 'react';
import { Activity, Binary, Bot, SendHorizontal, Sparkles } from 'lucide-react';
import {
  AIObservation,
  AICopilotSuggestion,
  AIToolAction,
  DisplayMode,
  NodeItem,
  TerminalChunk,
  TraceEntry,
  TransportCapabilities,
} from './types';
import { decodeBase64ToBytes, describeTraceEntry, formatHex, formatMixed } from './protocol';

interface ConsolePanelProps {
  termRef: React.RefObject<HTMLDivElement>;
  displayMode: DisplayMode;
  terminalChunks: TerminalChunk[];
  commandDraft: string;
  onCommandDraftChange: (value: string) => void;
  onCommandSubmit: () => void;
  copilotSuggestions: AICopilotSuggestion[];
  onDismissSuggestion: (suggestionId: number) => void;
  onUseSuggestedCommand: (command: string) => void;
  automationEnabled: boolean;
  automationObserverCount: number;
  connected: boolean;
  sessionId: number | null;
  aiActions: AIToolAction[];
  actionBusyId: number | null;
  onStartAutomationSession: () => Promise<void>;
  onStopAutomationSession: () => Promise<void>;
  onApproveAction: (actionId: number) => Promise<void>;
  onRejectAction: (actionId: number) => Promise<void>;
  developerMode: boolean;
  debugEnabled: boolean;
  transportState: string;
  transportCapabilities: TransportCapabilities | null;
  nodes: NodeItem[];
  selectedNodeId: number | null;
  showAiPanel: boolean;
  onShowAiPanelToggle: () => void;
  aiObservations: AIObservation[];
  traceOpen: boolean;
  traceEntries: TraceEntry[];
}

export default function ConsolePanel({
  termRef,
  displayMode,
  terminalChunks,
  commandDraft,
  onCommandDraftChange,
  onCommandSubmit,
  copilotSuggestions,
  onDismissSuggestion,
  onUseSuggestedCommand,
  automationEnabled,
  automationObserverCount,
  connected,
  sessionId,
  aiActions,
  actionBusyId,
  onStartAutomationSession,
  onStopAutomationSession,
  onApproveAction,
  onRejectAction,
  developerMode,
  debugEnabled,
  transportState,
  transportCapabilities,
  nodes,
  selectedNodeId,
  showAiPanel,
  onShowAiPanelToggle,
  aiObservations,
  traceOpen,
  traceEntries,
}: ConsolePanelProps) {
  return (
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
          onChange={(event) => onCommandDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              onCommandSubmit();
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
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Suggestions only</div>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Copilot can summarize serial output and suggest commands or scripts. It cannot execute
          anything on the device.
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
                    onClick={() => onDismissSuggestion(suggestion.id)}
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
                            : action.scriptName ||
                              (action.scriptId ? `Script #${action.scriptId}` : 'Suggested script')}
                        </div>
                        <div className="mt-1 text-sm leading-6 text-slate-400">{action.reason}</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {action.type === 'serial_command' && action.command && (
                            <button
                              type="button"
                              className="action-button px-3 py-2 text-xs"
                              onClick={() => onUseSuggestedCommand(action.command || '')}
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
            onClick={() => void onStartAutomationSession()}
          >
            Enable AI session
          </button>
          <button
            type="button"
            className="action-button px-3 py-2 text-xs"
            disabled={!sessionId || !automationEnabled}
            onClick={() => void onStopAutomationSession()}
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
              <div
                key={action.id}
                className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-4 text-sm text-slate-300"
              >
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
                        onClick={() => void onApproveAction(action.id)}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="action-button px-3 py-2 text-xs"
                        disabled={actionBusyId === action.id}
                        onClick={() => void onRejectAction(action.id)}
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
              <div>
                State: <span className="text-white">{transportState}</span>
              </div>
              <div>
                Transport:{' '}
                <span className="text-white">
                  {transportCapabilities?.connectionType ??
                    nodes.find((node) => node.id === selectedNodeId)?.connectionType ??
                    'unknown'}
                </span>
              </div>
              <div>
                RFC2217:{' '}
                <span className="text-white">{transportCapabilities?.supportsRfc2217 ? 'yes' : 'no'}</span>
              </div>
              <div>
                Baud control:{' '}
                <span className="text-white">{transportCapabilities?.supportsBaudControl ? 'yes' : 'no'}</span>
              </div>
              <div>
                Flow control:{' '}
                <span className="text-white">{transportCapabilities?.supportsFlowControl ? 'yes' : 'no'}</span>
              </div>
              <div>
                Modem signals:{' '}
                <span className="text-white">{transportCapabilities?.supportsModemSignals ? 'yes' : 'no'}</span>
              </div>
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
              <button type="button" className="action-button gap-2 px-3 py-2" onClick={onShowAiPanelToggle}>
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
                  <div className="text-slate-500">
                    Protocol trace is enabled but no frames have been captured yet.
                  </div>
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
  );
}
