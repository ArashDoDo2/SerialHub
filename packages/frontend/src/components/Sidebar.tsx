"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  Home,
  Terminal,
  Server,
  Settings,
  FileText,
  BarChart2,
  Play,
  Shield,
  Bot,
} from 'lucide-react';

const items = [
  { href: '/dashboard', label: 'Dashboard', icon: Home },
  { href: '/nodes', label: 'Nodes', icon: Server },
  { href: '/terminal', label: 'Terminal', icon: Terminal },
  { href: '/scripts', label: 'Scripts', icon: Play },
  { href: '/runs', label: 'Runs', icon: FileText },
  { href: '/profiles', label: 'Profiles', icon: BarChart2 },
  { href: '/agents', label: 'Agents', icon: Bot },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`flex h-full min-h-screen flex-col border-r border-white/10 bg-slate-950/90 text-slate-100 shadow-[0_0_60px_rgba(15,23,42,0.45)] backdrop-blur-2xl transition-all duration-300 ease-in-out ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      <div className="border-b border-white/10 px-4 pb-4 pt-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 via-sky-500 to-amber-300 text-sm font-bold text-slate-950 shadow-[0_16px_30px_rgba(34,211,238,0.25)]">
              SH
            </div>
            {!collapsed && (
              <div>
                <div className="text-lg font-semibold tracking-tight text-white">SerialHub</div>
                <div className="text-xs uppercase tracking-[0.28em] text-cyan-300/70">
                  Ops Console
                </div>
              </div>
            )}
          </div>
          <button
            type="button"
            className="hidden rounded-2xl border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/10 md:inline-flex"
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? '>>' : '<<'}
          </button>
        </div>
        {!collapsed && (
          <div className="mt-5 rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-400/10 via-slate-900/80 to-amber-300/10 p-4">
            <div className="flex items-center gap-2 text-cyan-200">
              <Activity className="h-4 w-4" />
              <span className="text-sm font-medium">Control plane online</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Terminal locking, scripts, and run history are available from one workspace.
            </p>
          </div>
        )}
      </div>
      <nav className="flex-1 space-y-1 px-3 py-5">
        {!collapsed && (
          <div className="px-3 pb-2 text-[0.65rem] uppercase tracking-[0.32em] text-slate-500">
            Workspace
          </div>
        )}
        {items.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`group relative flex items-center gap-3 overflow-hidden rounded-2xl px-4 py-3 text-sm font-medium transition-all duration-200 ${
                active
                  ? 'bg-white text-slate-950 shadow-[0_16px_32px_rgba(248,250,252,0.16)]'
                  : 'text-slate-300 hover:bg-white/6 hover:text-white'
              }`}
            >
              <span
                className={`absolute inset-y-2 left-1 w-1 rounded-full transition ${
                  active ? 'bg-gradient-to-b from-cyan-400 to-amber-300' : 'bg-transparent'
                }`}
              />
              <Icon
                className={`h-5 w-5 shrink-0 ${
                  active ? 'text-sky-600' : 'text-slate-500 group-hover:text-cyan-300'
                }`}
              />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-4">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-300/15 text-amber-200">
            <Shield className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-sm font-medium text-white">Local admin mode</div>
              <div className="truncate text-xs text-slate-400">Development session bypass enabled</div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
