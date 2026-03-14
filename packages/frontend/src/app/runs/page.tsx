"use client";
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import { FileText } from 'lucide-react';

interface Run {
  id: number;
  scriptName: string;
  nodeName: string;
  status: string;
  startedAt: string;
}

export default function RunsPage() {
  const [runs, setRuns] = useState<Run[] | null>(null);

  useEffect(() => {
    fetch('/api/runs')
      .then((r) => r.json())
      .then((data) => setRuns(data))
      .catch(() => setRuns([]));
  }, []);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <p className="page-kicker">Execution History</p>
          <h1 className="page-title">Script Runs</h1>
        </div>
        <div className="panel-muted flex items-center gap-3 px-4 py-3">
          <FileText className="h-4 w-4 text-amber-200" />
          <span className="text-sm text-slate-300">Persisted run timeline and logs</span>
        </div>
      </div>
      {runs === null ? (
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
                <th className="px-4 py-2">ID</th>
                <th className="px-4 py-2">Script</th>
                <th className="px-4 py-2">Node</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Started</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {runs.map((r) => (
                <tr key={r.id} className="cursor-pointer">
                  <td className="px-4 py-2">
                    <Link href={`/runs/${r.id}`} className="font-medium text-cyan-200 hover:text-cyan-100">
                      #{r.id}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-white">{r.scriptName}</td>
                  <td className="px-4 py-2 text-slate-300">{r.nodeName}</td>
                  <td className="px-4 py-2 text-slate-300">{r.status}</td>
                  <td className="px-4 py-2 text-slate-400">{r.startedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
