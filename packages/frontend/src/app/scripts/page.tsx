"use client";
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import { Play, Plus } from 'lucide-react';

interface Script {
  id: number;
  name: string;
  description?: string;
  commands: any[];
  lastRun?: string;
}

export default function ScriptsPage() {
  const [scripts, setScripts] = useState<Script[] | null>(null);

  useEffect(() => {
    fetch('/api/scripts')
      .then((r) => r.json())
      .then((data) => setScripts(data))
      .catch(() => setScripts([]));
  }, []);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <p className="page-kicker">Automation</p>
          <h1 className="page-title">Scripts</h1>
        </div>
        <Link href="/scripts/new" className="action-button-primary gap-2">
          <Plus className="h-4 w-4" />
          New Script
        </Link>
      </div>
      {scripts === null ? (
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
                <th className="px-4 py-2">Description</th>
                <th className="px-4 py-2">Commands</th>
                <th className="px-4 py-2">Last Run</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {scripts.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-400/10 text-emerald-200">
                        <Play className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="font-medium text-white">{s.name}</div>
                        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                          Script #{s.id}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-slate-300">{s.description || '-'}</td>
                  <td className="px-4 py-2 text-slate-400">{s.commands.length}</td>
                  <td className="px-4 py-2 text-slate-400">{s.lastRun || '-'}</td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-2">
                      <button className="action-button">Run</button>
                      <button className="action-button">Edit</button>
                      <button className="action-button border-red-400/20 bg-red-500/10 text-red-100 hover:bg-red-500/20">Delete</button>
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
