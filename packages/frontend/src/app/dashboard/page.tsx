"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Cpu, FileText, Play, Server, Terminal, Zap } from 'lucide-react';
import Card from '@/components/ui/Card';
import { probeNodeStatuses } from '@/lib/nodeStatus';

interface DashboardStats {
  activeNodes: number | null;
  totalNodes: number;
  recentRuns: number;
}

interface DashboardNode {
  id: number;
  isActive?: boolean;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    activeNodes: null,
    totalNodes: 0,
    recentRuns: 0,
  });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [nodesResponse, runsResponse] = await Promise.all([fetch('/api/nodes'), fetch('/api/runs')]);
        const nodes = await nodesResponse.json();
        const runs = await runsResponse.json();
        const nodeList = Array.isArray(nodes) ? (nodes as DashboardNode[]) : [];
        const probeTargets = nodeList.filter((node) => node.isActive !== false).map((node) => node.id);

        if (!cancelled) {
          setStats({
            activeNodes: null,
            totalNodes: nodeList.length,
            recentRuns: Array.isArray(runs) ? runs.length : 0,
          });
        }

        const statuses = await probeNodeStatuses(probeTargets);

        if (!cancelled) {
          setStats((current) => ({
            ...current,
            activeNodes: probeTargets.filter((nodeId) => statuses[nodeId] === 'online').length,
          }));
        }
      } catch {
        if (!cancelled) {
          setStats({
            activeNodes: null,
            totalNodes: 0,
            recentRuns: 0,
          });
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const activeNodeDisplay = stats.activeNodes === null ? 'Checking...' : stats.activeNodes;
  const activeNodeSubtitle =
    stats.activeNodes === null ? 'Checking live reachability...' : 'Currently ready for control';

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(135deg,rgba(34,211,238,0.16),rgba(15,23,42,0.95)_34%,rgba(251,191,36,0.12))] p-8 shadow-[0_24px_80px_rgba(2,6,23,0.38)]">
        <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-cyan-300/15 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-40 w-40 rounded-full bg-amber-300/10 blur-3xl" />
        <div className="relative grid gap-8 lg:grid-cols-[1.4fr_0.9fr] lg:items-end">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-xs font-medium uppercase tracking-[0.28em] text-cyan-100">
              <Zap className="h-4 w-4" />
              Live operations fabric
            </div>
            <div className="max-w-2xl space-y-3">
              <h1 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">
                Hardware control with a cleaner surface and faster feedback.
              </h1>
              <p className="text-base leading-7 text-slate-300 md:text-lg">
                Monitor nodes, open an exclusive terminal, and launch scripted runs from a single
                operational workspace.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/terminal"
                className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-100"
              >
                Open terminal
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/scripts"
                className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Review scripts
              </Link>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
            <div className="rounded-[28px] border border-white/10 bg-black/20 p-5 backdrop-blur-xl">
              <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Active nodes</div>
              <div className="mt-3 text-4xl font-semibold text-white">{activeNodeDisplay}</div>
              <div className="mt-2 text-sm text-cyan-200">{activeNodeSubtitle}</div>
            </div>
            <div className="rounded-[28px] border border-white/10 bg-black/20 p-5 backdrop-blur-xl">
              <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Total nodes</div>
              <div className="mt-3 text-4xl font-semibold text-white">{stats.totalNodes}</div>
              <div className="mt-2 text-sm text-slate-300">Registered serial endpoints</div>
            </div>
            <div className="rounded-[28px] border border-white/10 bg-black/20 p-5 backdrop-blur-xl">
              <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Recent runs</div>
              <div className="mt-3 text-4xl font-semibold text-white">{stats.recentRuns}</div>
              <div className="mt-2 text-sm text-amber-200">Captured automation history</div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-slate-500">Overview</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                Platform health
              </h2>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <Card title={activeNodeDisplay} subtitle="Nodes ready for an exclusive terminal session" icon={<Server className="h-5 w-5" />} />
            <Card title={stats.totalNodes} subtitle="Configured devices and simulators in inventory" icon={<Cpu className="h-5 w-5" />} />
            <Card title={stats.recentRuns} subtitle="Recorded automation runs available for inspection" icon={<Play className="h-5 w-5" />} />
          </div>
        </div>
        <Card
          title="Operational rhythm"
          subtitle="Suggested flow"
          icon={<Zap className="h-5 w-5" />}
          className="bg-[linear-gradient(180deg,rgba(15,23,42,0.72),rgba(15,23,42,0.42))]"
        >
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              Verify node availability before claiming the terminal lock.
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              Use scripts after interactive control is released to avoid contention.
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              Inspect runs and serial output together when diagnosing failures.
            </div>
          </div>
        </Card>
      </div>

      <section className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-[0.32em] text-slate-500">Launchpad</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Quick actions</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Link href="/terminal">
            <Card title="Terminal" subtitle="Take live control of a node" icon={<Terminal className="h-5 w-5" />} />
          </Link>
          <Link href="/scripts">
            <Card title="Run Script" subtitle="Launch repeatable serial workflows" icon={<Play className="h-5 w-5" />} />
          </Link>
          <Link href="/runs">
            <Card title="View Logs" subtitle="Inspect execution history and logs" icon={<FileText className="h-5 w-5" />} />
          </Link>
          <Link href="/nodes">
            <Card title="Manage Nodes" subtitle="Review targets and connection data" icon={<Server className="h-5 w-5" />} />
          </Link>
        </div>
      </section>
    </div>
  );
}
