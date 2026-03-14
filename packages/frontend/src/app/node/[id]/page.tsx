"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Alert from '@/components/ui/Alert';
import Card from '@/components/ui/Card';
import StatusIndicator from '@/components/ui/StatusIndicator';
import { Bot } from 'lucide-react';
import { getNodeAgentAssignments, setNodeAgentAssignment } from '@/lib/aiAgentStorage';
import { probeNodeStatus } from '@/lib/nodeStatus';

interface Props {
  params: { id: string };
}

interface Node {
  id: number;
  name: string;
  description?: string;
  connectionType: 'raw-tcp' | 'rfc2217';
  host: string;
  port: number;
  baudRate: number;
  dataBits: number;
  parity: string;
  stopBits: number;
  profile?: string;
  status?: 'online' | 'offline' | 'busy' | 'error';
}

interface Agent {
  id: number;
  name: string;
  endpoint: string;
  createdAt: string;
}

export default function NodeDetailPage({ params }: Props) {
  const [node, setNode] = useState<Node | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [agentMessage, setAgentMessage] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetch(`/api/nodes/${params.id}`), fetch('/api/ai-observers')])
      .then(async ([nodeResponse, agentsResponse]) => {
        const nodeData = await nodeResponse.json();
        const agentData = agentsResponse.ok ? await agentsResponse.json() : [];
        const liveStatus = await probeNodeStatus(Number(params.id));
        setNode({
          ...nodeData,
          status: liveStatus,
        });
        setAgents(Array.isArray(agentData) ? agentData : []);
      })
      .catch(() => {
        setNode(null);
        setAgents([]);
      });
  }, [params.id]);

  useEffect(() => {
    if (!node) {
      return;
    }
    const assignment = getNodeAgentAssignments()[String(node.id)];
    setSelectedAgentId(assignment ? String(assignment) : '');
  }, [node]);

  if (!node) {
    return <div className="text-xl">Loading...</div>;
  }

  const assignedAgent = agents.find((agent) => String(agent.id) === selectedAgentId);

  const handleAssignmentChange = (value: string) => {
    setSelectedAgentId(value);
    setNodeAgentAssignment(node.id, value ? Number(value) : null);
    setAgentMessage(value ? 'AI agent assignment saved for this node.' : 'AI agent assignment cleared.');
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-4xl font-bold">{node.name}</h1>
        <StatusIndicator status={node.status ?? 'offline'} size={4} />
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card title="Serial Settings">
          <ul className="space-y-1 text-sm">
            <li>Connection: {node.connectionType}</li>
            <li>Host: {node.host}</li>
            <li>Port: {node.port}</li>
            <li>Baud: {node.baudRate}</li>
            <li>Data bits: {node.dataBits}</li>
            <li>Parity: {node.parity}</li>
            <li>Stop bits: {node.stopBits}</li>
          </ul>
        </Card>
        <Card title="Device Profile" subtitle={node.profile || 'None assigned'} />
      </div>

      <section className="panel p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-200">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <div className="text-lg font-semibold text-white">Node Settings</div>
            <div className="text-sm text-slate-400">
              Assign a user-scoped AI agent to this node for observation or controller workflows.
            </div>
          </div>
        </div>

        {agentMessage && <Alert type="success">{agentMessage}</Alert>}

        <div className="mt-5 grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.24em] text-slate-500">AI Agent</label>
            <select
              className="field w-full"
              value={selectedAgentId}
              onChange={(event) => handleAssignmentChange(event.target.value)}
            >
              <option value="">No agent assigned</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </div>
          <Link href="/agents" className="action-button">
            Manage agents
          </Link>
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-400">
          {assignedAgent
            ? `Assigned agent endpoint: ${assignedAgent.endpoint}`
            : 'No agent is assigned to this node yet.'}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-2xl font-semibold">Terminal Control</h2>
        <p className="text-sm text-gray-400">
          Terminal control is exclusive. Opening a terminal will acquire the node lock for your session.
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-2xl font-semibold">Quick Actions</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Link href={`/terminal?nodeId=${node.id}`}>
            <Card title="Open Terminal" />
          </Link>
          <Link href="/scripts">
            <Card title="Run Script" />
          </Link>
          <Link href="/runs">
            <Card title="View Runs" />
          </Link>
        </div>
      </section>
    </div>
  );
}
