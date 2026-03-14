import React from 'react';
import clsx from 'clsx';

interface AlertProps {
  type?: 'error' | 'warning' | 'info' | 'success';
  children: React.ReactNode;
  className?: string;
}

const colorMap: Record<string, string> = {
  error: 'border-red-400/25 bg-red-500/12 text-red-100',
  warning: 'border-amber-300/25 bg-amber-400/12 text-amber-100',
  info: 'border-cyan-300/25 bg-cyan-400/12 text-cyan-100',
  success: 'border-emerald-400/25 bg-emerald-400/12 text-emerald-100',
};

export default function Alert({ type = 'info', children, className }: AlertProps) {
  const color = colorMap[type] || colorMap.info;
  return (
    <div
      className={clsx(
        'rounded-2xl border px-4 py-3 text-sm shadow-[0_12px_32px_rgba(2,6,23,0.18)]',
        color,
        className
      )}
      role="alert"
    >
      {children}
    </div>
  );
}
