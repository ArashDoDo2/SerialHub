import React from 'react';
import clsx from 'clsx';

interface CardProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export default function Card({ title, subtitle, icon, children, className }: CardProps) {
  return (
    <div
      className={clsx(
        'group relative overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.045] p-5 shadow-[0_18px_50px_rgba(2,6,23,0.32)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-cyan-300/30 hover:bg-white/[0.07]',
        className
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent opacity-60" />
      <div className="flex items-start gap-4">
        {icon && (
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400/15 via-sky-500/15 to-amber-300/15 text-cyan-200 ring-1 ring-white/10">
            {icon}
          </div>
        )}
        <div>
          <div className="text-lg font-semibold tracking-tight text-white">{title}</div>
          {subtitle && <div className="mt-1 text-sm text-slate-400">{subtitle}</div>}
        </div>
      </div>
      {children && <div className="mt-5 text-sm text-slate-300">{children}</div>}
    </div>
  );
}
