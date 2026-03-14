import React from 'react';
import clsx from 'clsx';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'online' | 'offline' | 'busy' | 'error' | string;
  className?: string;
}

const colorMap: Record<string, string> = {
  online: 'bg-status-online text-black',
  offline: 'bg-status-offline text-white',
  busy: 'bg-status-busy text-black',
  error: 'bg-status-error text-white',
};

export default function Badge({ children, variant = 'online', className }: BadgeProps) {
  const color = colorMap[variant] || 'bg-gray-500 text-white';
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        color,
        className
      )}
    >
      {children}
    </span>
  );
}