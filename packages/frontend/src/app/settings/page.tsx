"use client";

import React, { useEffect, useState } from 'react';
import { Bot, Plus, Trash2 } from 'lucide-react';
import Alert from '@/components/ui/Alert';

interface AIObserver {
  id: number;
  name: string;
  endpoint: string;
  authToken: string;
  createdAt: string;
}

export default function SettingsPage() {
  const [observers, setObservers] = useState<AIObserver[]>([]);
  const [name, setName] = useState('');
  const [endpoint, setEndpoint] = useState('ws://localhost:4010');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadObservers = async () => {
    try {
      const response = await fetch('/api/ai-observers');
      const data = await response.json();
      setObservers(Array.isArray(data) ? data : []);
    } catch {
      setObservers([]);
    }
  };

  useEffect(() => {
    void loadObservers();
  }, []);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const response = await fetch('/api/ai-observers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, endpoint }),
    });

    if (!response.ok) {
      setError('Failed to create AI observer.');
      return;
    }

    const observer = await response.json();
    setName('');
    setEndpoint('ws://localhost:4010');
    setSuccess(`Observer created. Token: ${observer.authToken}`);
    await loadObservers();
  };

  const handleDelete = async (observerId: number) => {
    const response = await fetch(`/api/ai-observers/${observerId}`, { method: 'DELETE' });
    if (!response.ok) {
      setError('Failed to delete AI observer.');
      return;
    }
    await loadObservers();
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <p className="page-kicker">Settings</p>
          <h1 className="page-title">AI Observers</h1>
        </div>
      </div>

      {error && <Alert type="error">{error}</Alert>}
      {success && <Alert type="success">{success}</Alert>}

      <section className="panel p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-200">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <div className="text-lg font-semibold text-white">Register observer / copilot</div>
            <div className="text-sm text-slate-400">
              Passive WebSocket client that receives serial output and may return analysis or copilot suggestions only.
            </div>
          </div>
        </div>

        <form className="grid gap-4 md:grid-cols-[1fr_1fr_auto]" onSubmit={handleCreate}>
          <input
            className="field"
            placeholder="Observer name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
          <input
            className="field"
            placeholder="ws://localhost:4010"
            value={endpoint}
            onChange={(event) => setEndpoint(event.target.value)}
            required
          />
          <button type="submit" className="action-button-primary gap-2">
            <Plus className="h-4 w-4" />
            Add observer
          </button>
        </form>
      </section>

      <section className="panel-table overflow-hidden">
        <table className="min-w-full text-left">
          <thead>
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Endpoint</th>
              <th className="px-4 py-3">Auth Token</th>
              <th className="px-4 py-3">Namespaces</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {observers.map((observer) => (
              <tr key={observer.id}>
                <td className="px-4 py-3 text-white">{observer.name}</td>
                <td className="px-4 py-3 text-slate-300">{observer.endpoint}</td>
                <td className="px-4 py-3 font-mono text-xs text-cyan-200">{observer.authToken}</td>
                <td className="px-4 py-3 text-slate-400">/ai-observers, /ai-copilot</td>
                <td className="px-4 py-3 text-slate-400">{observer.createdAt}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    className="action-button border-red-400/20 bg-red-500/10 px-3 py-2 text-red-100 hover:bg-red-500/20"
                    onClick={() => void handleDelete(observer.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>Delete</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
