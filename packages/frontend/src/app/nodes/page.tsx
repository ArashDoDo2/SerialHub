"use client";

import React, { useEffect, useState } from 'react';
import Alert from '@/components/ui/Alert';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import StatusIndicator from '@/components/ui/StatusIndicator';
import { Cable, Pencil, Plus, Server, Trash2, X } from 'lucide-react';
import { probeNodeStatuses } from '@/lib/nodeStatus';

interface Node {
  id: number;
  name: string;
  description?: string;
  connectionType?: 'raw-tcp' | 'rfc2217';
  host: string;
  port: number;
  baudRate: number;
  dataBits?: number;
  parity?: 'none' | 'even' | 'odd' | 'mark' | 'space';
  stopBits?: number;
  isActive?: boolean;
  status: 'online' | 'offline' | 'busy' | 'error';
  lastActivity: string;
}

interface CreateNodeForm {
  name: string;
  description: string;
  connectionType: 'raw-tcp' | 'rfc2217';
  host: string;
  port: string;
  baudRate: string;
  dataBits: string;
  parity: 'none' | 'even' | 'odd' | 'mark' | 'space';
  stopBits: string;
  isActive: boolean;
}

const initialForm: CreateNodeForm = {
  name: '',
  description: '',
  connectionType: 'raw-tcp',
  host: '',
  port: '23',
  baudRate: '115200',
  dataBits: '8',
  parity: 'none',
  stopBits: '1',
  isActive: true,
};

export default function NodesPage() {
  const [nodes, setNodes] = useState<Node[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingNodeId, setDeletingNodeId] = useState<number | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<number | null>(null);
  const [form, setForm] = useState<CreateNodeForm>(initialForm);

  const loadNodes = async () => {
    try {
      const response = await fetch('/api/nodes');
      const data = await response.json();
      const rawNodes = Array.isArray(data) ? data : [];
      const liveStatuses = await probeNodeStatuses(rawNodes.map((node) => node.id));
      const hydratedNodes = rawNodes.map((node) => ({
        ...node,
        status: liveStatuses[node.id] ?? (node.isActive === false ? 'offline' : 'error'),
        lastActivity:
          liveStatuses[node.id] === 'online'
            ? 'Reachable now'
            : liveStatuses[node.id] === 'offline'
              ? 'No response'
              : 'Probe failed',
      }));
      setNodes(hydratedNodes);
      setError(null);
    } catch (requestError) {
      console.error(requestError);
      setError('Failed to load nodes');
      setNodes([]);
    }
  };

  useEffect(() => {
    loadNodes();
  }, []);

  const updateForm = <K extends keyof CreateNodeForm>(key: K, value: CreateNodeForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const extractValidationMessage = (errors: unknown): string => {
    if (!errors || typeof errors !== 'object') {
      return 'Validation failed.';
    }

    for (const [field, value] of Object.entries(errors as Record<string, unknown>)) {
      if (field === '_errors' || !value || typeof value !== 'object') {
        continue;
      }

      const fieldErrors = (value as { _errors?: unknown })._errors;
      if (Array.isArray(fieldErrors) && typeof fieldErrors[0] === 'string' && fieldErrors[0]) {
        return `${field}: ${fieldErrors[0]}`;
      }
    }

    const rootErrors = (errors as { _errors?: unknown })._errors;
    if (Array.isArray(rootErrors) && typeof rootErrors[0] === 'string' && rootErrors[0]) {
      return rootErrors[0];
    }

    return 'Validation failed.';
  };

  const handleCreateNode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    setIsSubmitting(true);

    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        connectionType: form.connectionType,
        host: form.host.trim(),
        port: Number(form.port),
        baudRate: Number(form.baudRate),
        dataBits: Number(form.dataBits),
        parity: form.parity,
        stopBits: Number(form.stopBits),
        isActive: form.isActive,
      };

      if (!payload.name || !payload.host) {
        throw new Error('Name and host are required.');
      }

      if (
        Number.isNaN(payload.port) ||
        Number.isNaN(payload.baudRate) ||
        Number.isNaN(payload.dataBits) ||
        Number.isNaN(payload.stopBits)
      ) {
        throw new Error('Numeric node parameters are invalid.');
      }

      const isEditing = editingNodeId !== null;
      const response = await fetch(isEditing ? `/api/nodes/${editingNodeId}` : '/api/nodes', {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const responseBody = await response.json().catch(() => null);
        const message =
          responseBody?.error ||
          responseBody?.message ||
          (responseBody?.errors ? extractValidationMessage(responseBody.errors) : 'Failed to save node.');
        throw new Error(message);
      }

      setForm(initialForm);
      setEditingNodeId(null);
      setIsCreating(false);
      setFormSuccess(isEditing ? 'Node updated successfully.' : 'Node created successfully.');
      await loadNodes();
    } catch (submitError) {
      setFormError((submitError as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditNode = (node: Node) => {
    setForm({
      name: node.name,
      description: node.description || '',
      connectionType: node.connectionType ?? 'raw-tcp',
      host: node.host,
      port: String(node.port),
      baudRate: String(node.baudRate),
      dataBits: String(node.dataBits ?? 8),
      parity: node.parity ?? 'none',
      stopBits: String(node.stopBits ?? 1),
      isActive: node.isActive ?? true,
    });
    setEditingNodeId(node.id);
    setFormError(null);
    setFormSuccess(null);
    setIsCreating(true);
  };

  const handleDeleteNode = async (node: Node) => {
    const confirmed = window.confirm(`Delete node "${node.name}"?`);
    if (!confirmed) {
      return;
    }

    setError(null);
    setFormSuccess(null);
    setDeletingNodeId(node.id);

    try {
      const response = await fetch(`/api/nodes/${node.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const responseBody = await response.json().catch(() => null);
        throw new Error(responseBody?.error || 'Failed to delete node.');
      }

      await loadNodes();
      setFormSuccess(`Node "${node.name}" deleted.`);
    } catch (deleteError) {
      setError((deleteError as Error).message);
    } finally {
      setDeletingNodeId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <p className="page-kicker">Infrastructure</p>
          <h1 className="page-title">Nodes</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="panel-muted flex items-center gap-3 px-4 py-3">
            <Server className="h-4 w-4 text-cyan-300" />
            <span className="text-sm text-slate-300">Serial endpoint inventory and live status</span>
          </div>
          <button
            type="button"
            className="action-button-primary gap-2"
            onClick={() => {
              setIsCreating((current) => !current);
              if (isCreating) {
                setForm(initialForm);
                setEditingNodeId(null);
              }
              setFormError(null);
              setFormSuccess(null);
            }}
          >
            {isCreating ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {isCreating ? 'Close Form' : 'Add Node'}
          </button>
        </div>
      </div>

      {formSuccess && <Alert type="success">{formSuccess}</Alert>}
      {error && <Alert type="error">{error}</Alert>}

      {isCreating && (
        <section className="panel overflow-hidden">
          <div className="grid gap-0 xl:grid-cols-[0.95fr_1.25fr]">
            <div className="border-b border-white/10 bg-[linear-gradient(180deg,rgba(34,211,238,0.12),rgba(15,23,42,0.22))] p-6 xl:border-b-0 xl:border-r">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs uppercase tracking-[0.28em] text-cyan-100">
                <Cable className="h-3.5 w-3.5" />
                {editingNodeId ? 'Edit serial target' : 'New serial target'}
              </div>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight text-white">
                {editingNodeId ? 'Update node' : 'Register a node'}
              </h2>
              <p className="mt-3 max-w-md text-sm leading-7 text-slate-400">
                {editingNodeId
                  ? 'Modify transport mode, host, and serial parameters for this serial endpoint.'
                  : 'Add transport mode, host, and serial parameters for a new serial endpoint. Raw TCP and RFC2217 are both supported in the current backend.'}
              </p>
              <div className="mt-6 space-y-3">
                <div className="panel-muted px-4 py-3 text-sm text-slate-300">
                  Recommended defaults: `115200 / 8N1`
                </div>
                <div className="panel-muted px-4 py-3 text-sm text-slate-300">
                  Choose `raw-tcp` for transparent socket streams or `rfc2217` when the remote server should apply serial settings over Telnet.
                </div>
              </div>
            </div>

            <form className="space-y-5 p-6" onSubmit={handleCreateNode}>
              {formError && <Alert type="error">{formError}</Alert>}
              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-xs uppercase tracking-[0.24em] text-slate-500">
                    Connection Type
                  </label>
                  <select
                    value={form.connectionType}
                    onChange={(event) =>
                      updateForm('connectionType', event.target.value as CreateNodeForm['connectionType'])
                    }
                    className="field w-full"
                  >
                    <option value="raw-tcp">Raw TCP</option>
                    <option value="rfc2217">RFC2217</option>
                  </select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-xs uppercase tracking-[0.24em] text-slate-500">Name</label>
                  <input
                    value={form.name}
                    onChange={(event) => updateForm('name', event.target.value)}
                    className="field w-full"
                    placeholder="Bench Router A"
                    required
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-xs uppercase tracking-[0.24em] text-slate-500">
                    Description
                  </label>
                  <textarea
                    value={form.description}
                    onChange={(event) => updateForm('description', event.target.value)}
                    className="field min-h-[110px] w-full resize-y"
                    placeholder="Optional notes about rack, hardware revision, or access path"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-[0.24em] text-slate-500">Host</label>
                  <input
                    value={form.host}
                    onChange={(event) => updateForm('host', event.target.value)}
                    className="field w-full"
                    placeholder="192.168.1.50"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-[0.24em] text-slate-500">Port</label>
                  <input
                    value={form.port}
                    onChange={(event) => updateForm('port', event.target.value)}
                    className="field w-full"
                    inputMode="numeric"
                    placeholder="23"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-[0.24em] text-slate-500">
                    Baud Rate
                  </label>
                  <input
                    value={form.baudRate}
                    onChange={(event) => updateForm('baudRate', event.target.value)}
                    className="field w-full"
                    inputMode="numeric"
                    placeholder="115200"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-[0.24em] text-slate-500">
                    Data Bits
                  </label>
                  <select
                    value={form.dataBits}
                    onChange={(event) => updateForm('dataBits', event.target.value)}
                    className="field w-full"
                  >
                    <option value="5">5</option>
                    <option value="6">6</option>
                    <option value="7">7</option>
                    <option value="8">8</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-[0.24em] text-slate-500">Parity</label>
                  <select
                    value={form.parity}
                    onChange={(event) => updateForm('parity', event.target.value as CreateNodeForm['parity'])}
                    className="field w-full"
                  >
                    <option value="none">None</option>
                    <option value="even">Even</option>
                    <option value="odd">Odd</option>
                    <option value="mark">Mark</option>
                    <option value="space">Space</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-[0.24em] text-slate-500">
                    Stop Bits
                  </label>
                  <select
                    value={form.stopBits}
                    onChange={(event) => updateForm('stopBits', event.target.value)}
                    className="field w-full"
                  >
                    <option value="1">1</option>
                    <option value="1.5">1.5</option>
                    <option value="2">2</option>
                  </select>
                </div>
              </div>

              <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
                <span>Enable this node immediately after creation</span>
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) => updateForm('isActive', event.target.checked)}
                  className="h-4 w-4 rounded border-white/10 bg-slate-950/70 text-cyan-300"
                />
              </label>

              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  className="action-button"
                  onClick={() => {
                    setIsCreating(false);
                    setEditingNodeId(null);
                    setForm(initialForm);
                    setFormError(null);
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="action-button-primary" disabled={isSubmitting}>
                  {isSubmitting
                    ? editingNodeId
                      ? 'Saving...'
                      : 'Creating...'
                    : editingNodeId
                      ? 'Save Changes'
                      : 'Create Node'}
                </button>
              </div>
            </form>
          </div>
        </section>
      )}

      {nodes === null ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <LoadingSkeleton key={i} className="h-8" />
          ))}
        </div>
      ) : (
        <div className="panel-table overflow-x-auto">
          <table className="min-w-full text-left">
            <thead>
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Host</th>
                <th className="px-4 py-2">Port</th>
                <th className="px-4 py-2">Transport</th>
                <th className="px-4 py-2">Baud</th>
                <th className="px-4 py-2">Mode</th>
                <th className="px-4 py-2">Last Activity</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {nodes.map((n) => (
                <tr
                  key={n.id}
                  className="cursor-pointer"
                  onClick={() => {
                    window.location.href = `/node/${n.id}`;
                  }}
                >
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-200">
                        <Server className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="font-medium text-white">{n.name}</div>
                        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                          Node #{n.id}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <StatusIndicator status={n.status} />
                  </td>
                  <td className="px-4 py-2">{n.host}</td>
                  <td className="px-4 py-2">{n.port}</td>
                  <td className="px-4 py-2 text-slate-300">{n.connectionType ?? 'raw-tcp'}</td>
                  <td className="px-4 py-2">{n.baudRate}</td>
                  <td className="px-4 py-2">
                    {`${n.dataBits ?? 8}${(n.parity ?? 'none').slice(0, 1).toUpperCase()}${n.stopBits ?? 1}`}
                  </td>
                  <td className="px-4 py-2 text-slate-400">{n.lastActivity}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        className="action-button px-3 py-2"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleEditNode(n);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        className="action-button border-red-400/20 bg-red-500/10 px-3 py-2 text-red-100 hover:bg-red-500/20"
                        disabled={deletingNodeId === n.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleDeleteNode(n);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span>{deletingNodeId === n.id ? 'Deleting...' : 'Delete'}</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
