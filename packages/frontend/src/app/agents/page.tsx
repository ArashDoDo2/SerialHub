"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { Bot, Cpu, Plus, Trash2, Zap } from 'lucide-react';
import Alert from '@/components/ui/Alert';
import StatusIndicator from '@/components/ui/StatusIndicator';
import {
  AgentMode,
  getAgentModes,
  getNodeAgentAssignments,
  removeAgentAssignmentsForDeletedAgent,
  removeAgentMode,
  setAgentMode,
} from '@/lib/aiAgentStorage';

interface Agent {
  id: number;
  name: string;
  endpoint: string;
  authToken: string;
  createdAt: string;
}

interface NodeSummary {
  id: number;
  name: string;
}

interface AgentViewModel extends Agent {
  mode: AgentMode;
  status: 'online' | 'offline' | 'busy';
  assignedNodes: string[];
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [nodes, setNodes] = useState<NodeSummary[]>([]);
  const [name, setName] = useState('');
  const [endpoint, setEndpoint] = useState('ws://localhost:4010');
  const [mode, setMode] = useState<AgentMode>('observer');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const [agentsResponse, nodesResponse] = await Promise.all([
          fetch('/api/ai-observers'),
          fetch('/api/nodes'),
        ]);

        if (!agentsResponse.ok) {
          throw new Error('Failed to load agents.');
        }

        const agentsData = await agentsResponse.json();
        const nodesData = nodesResponse.ok ? await nodesResponse.json() : [];

        if (cancelled) {
          return;
        }

        setAgents(Array.isArray(agentsData) ? agentsData : []);
        setNodes(Array.isArray(nodesData) ? nodesData : []);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load agents.');
          setAgents([]);
          setNodes([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const agentRows = useMemo<AgentViewModel[]>(() => {
    const modes = getAgentModes();
    const assignments = getNodeAgentAssignments();
    const nodeNameById = new Map<number, string>(nodes.map((node) => [node.id, node.name]));
    const assignedNodeIdsByAgent = new Map<number, number[]>();

    for (const [nodeId, assignedAgentId] of Object.entries(assignments)) {
      if (!assignedAgentId) {
        continue;
      }
      const current = assignedNodeIdsByAgent.get(assignedAgentId) ?? [];
      current.push(Number(nodeId));
      assignedNodeIdsByAgent.set(assignedAgentId, current);
    }

    return agents.map((agent) => {
      const storedMode = modes[String(agent.id)]?.mode ?? 'observer';
      const assignedNodeNames = (assignedNodeIdsByAgent.get(agent.id) ?? [])
        .map((nodeId) => nodeNameById.get(nodeId))
        .filter((value): value is string => Boolean(value));

      return {
        ...agent,
        mode: storedMode,
        status: assignedNodeNames.length > 0 ? 'busy' : 'online',
        assignedNodes: assignedNodeNames,
      };
    });
  }, [agents, nodes, refreshKey]);

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/ai-observers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          endpoint: endpoint.trim(),
        }),
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.error || 'Failed to create agent.');
      }

      setAgentMode(body.id, mode);
      setName('');
      setEndpoint('ws://localhost:4010');
      setMode('observer');
      setSuccess(`Agent created. Token: ${body.authToken}`);
      setRefreshKey((current) => current + 1);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create agent.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (agent: AgentViewModel) => {
    const confirmed = window.confirm(`Delete agent "${agent.name}"?`);
    if (!confirmed) {
      return;
    }

    setDeletingId(agent.id);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/ai-observers/${agent.id}`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error('Failed to delete agent.');
      }

      removeAgentMode(agent.id);
      removeAgentAssignmentsForDeletedAgent(agent.id);
      setSuccess(`Agent "${agent.name}" deleted.`);
      setRefreshKey((current) => current + 1);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete agent.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <p className="page-kicker">Automation</p>
          <h1 className="page-title">AI Agents</h1>
        </div>
        <div className="panel-muted flex items-center gap-3 px-4 py-3">
          <Bot className="h-4 w-4 text-cyan-300" />
          <span className="text-sm text-slate-300">Manage passive observers and controller-capable agents</span>
        </div>
      </div>

      {error && <Alert type="error">{error}</Alert>}
      {success && <Alert type="success">{success}</Alert>}

      <section className="panel overflow-hidden">
        <div className="grid gap-0 xl:grid-cols-[0.95fr_1.25fr]">
          <div className="border-b border-white/10 bg-[linear-gradient(180deg,rgba(34,211,238,0.12),rgba(15,23,42,0.22))] p-6 xl:border-b-0 xl:border-r">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs uppercase tracking-[0.28em] text-cyan-100">
              <Zap className="h-3.5 w-3.5" />
              New agent
            </div>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-white">Register an AI agent</h2>
            <p className="mt-3 max-w-md text-sm leading-7 text-slate-400">
              Create a user-scoped AI endpoint for passive observation or controller-assisted workflows.
              Agent-to-node assignment is configured separately from the node detail page.
            </p>
          </div>

          <form className="space-y-5 p-6" onSubmit={handleCreate}>
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <label className="text-xs uppercase tracking-[0.24em] text-slate-500">Name</label>
                <input
                  className="field w-full"
                  placeholder="Lab observer"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-xs uppercase tracking-[0.24em] text-slate-500">Endpoint</label>
                <input
                  className="field w-full"
                  placeholder="ws://localhost:4010"
                  value={endpoint}
                  onChange={(event) => setEndpoint(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-xs uppercase tracking-[0.24em] text-slate-500">Mode</label>
                <select
                  className="field w-full"
                  value={mode}
                  onChange={(event) => setMode(event.target.value as AgentMode)}
                >
                  <option value="observer">Observer</option>
                  <option value="controller">Controller</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end">
              <button type="submit" className="action-button-primary gap-2" disabled={submitting}>
                <Plus className="h-4 w-4" />
                {submitting ? 'Creating...' : 'Create agent'}
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="panel-table overflow-hidden">
        <table className="min-w-full text-left">
          <thead>
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Endpoint</th>
              <th className="px-4 py-3">Mode</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Assigned Nodes</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-sm text-slate-400">
                  Loading agents...
                </td>
              </tr>
            ) : agentRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-sm text-slate-400">
                  No AI agents registered for this account yet.
                </td>
              </tr>
            ) : (
              agentRows.map((agent) => (
                <tr key={agent.id}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-200">
                        {agent.mode === 'controller' ? <Cpu className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                      </div>
                      <div>
                        <div className="font-medium text-white">{agent.name}</div>
                        <div className="font-mono text-xs text-cyan-200">{agent.authToken}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{agent.endpoint}</td>
                  <td className="px-4 py-3 text-slate-300">{agent.mode}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 text-sm text-slate-300">
                      <StatusIndicator status={agent.status} size={3} />
                      <span>{agent.status === 'busy' ? 'assigned' : 'ready'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {agent.assignedNodes.length > 0 ? agent.assignedNodes.join(', ') : 'Unassigned'}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{agent.createdAt}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className="action-button border-red-400/20 bg-red-500/10 px-3 py-2 text-red-100 hover:bg-red-500/20"
                      disabled={deletingId === agent.id}
                      onClick={() => void handleDelete(agent)}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span>{deletingId === agent.id ? 'Deleting...' : 'Delete'}</span>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
