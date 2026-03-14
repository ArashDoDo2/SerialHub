"use client";

import React, { useState } from 'react';
import { Bell, Menu, Search } from 'lucide-react';
import Sidebar from '@/components/Sidebar';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="relative flex min-h-screen">
      <div
        className={`fixed inset-0 z-30 bg-black/50 backdrop-blur-sm transition md:hidden ${
          sidebarOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={() => setSidebarOpen(false)}
      />
      <div
        className={`fixed inset-y-0 left-0 z-40 transition-transform duration-300 md:static md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar onNavigate={() => setSidebarOpen(false)} />
      </div>
      <div className="relative flex min-h-screen flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
          <div className="flex items-center gap-4 px-4 py-4 md:px-8">
            <button
              type="button"
              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-100 transition hover:bg-white/10 md:hidden"
              onClick={() => setSidebarOpen((open) => !open)}
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-[0.65rem] uppercase tracking-[0.35em] text-cyan-300/70">
                SerialHub Control Plane
              </p>
              <h1 className="truncate text-lg font-semibold text-white md:text-xl">
                Remote hardware orchestration
              </h1>
            </div>
            <div className="hidden items-center gap-3 lg:flex">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300">
                <Search className="h-4 w-4 text-cyan-300" />
                <span>Nodes, scripts, runs</span>
              </div>
              <button
                type="button"
                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-100 transition hover:bg-white/10"
              >
                <Bell className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>
        <main className="relative flex-1 overflow-auto px-4 py-6 md:px-8 md:py-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.16),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(251,191,36,0.12),_transparent_24%),linear-gradient(180deg,_rgba(15,23,42,0.1),_transparent_35%)]" />
          <div className="relative mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
