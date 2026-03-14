import React from 'react';

interface Props {
  status: 'online' | 'offline' | 'busy' | 'error' | string;
  size?: number;
}

const colorMap: Record<string, string> = {
  online: 'bg-status-online',
  connected: 'bg-status-online',
  offline: 'bg-status-offline',
  disconnected: 'bg-status-offline',
  busy: 'bg-status-busy',
  error: 'bg-status-error',
};

export default function StatusIndicator({ status, size = 3 }: Props) {
  const color = colorMap[status] || 'bg-gray-500';
  const isConnected = status === 'online' || status === 'connected';
  const isBusy = status === 'busy';
  const isError = status === 'error';
  const isDisconnected = status === 'offline' || status === 'disconnected';
  const pulse = isDisconnected ? 'animate-pulse' : '';
  const beaconClass = isConnected
    ? 'status-beacon-glow status-beacon-glow-connected'
    : isBusy
      ? 'status-beacon-glow status-beacon-glow-busy'
      : isError
        ? 'status-beacon-glow status-beacon-glow-error'
        : isDisconnected
          ? 'status-beacon-glow status-beacon-glow-disconnected'
          : '';
  const coreClass = isConnected
    ? 'status-beacon-core status-beacon-core-connected'
    : isBusy
      ? 'status-beacon-core status-beacon-core-busy'
      : isError
        ? 'status-beacon-core status-beacon-core-error'
        : isDisconnected
          ? 'status-beacon-core status-beacon-core-disconnected'
          : '';
  return (
    <span className="inline-flex items-center gap-2" title={status}>
      <span className="relative inline-flex items-center justify-center" style={{ width: size * 4, height: size * 4 }}>
        <span
          className={`${color} ${pulse} inline-block rounded-full ring-4 ring-white/5`}
          style={{ width: size * 4, height: size * 4 }}
        ></span>
        {(isConnected || isBusy || isError || isDisconnected) && (
          <>
            <span
              className={`${beaconClass} absolute inset-0 rounded-full`}
              style={{ width: size * 4, height: size * 4 }}
            ></span>
            <span
              className={`${coreClass} absolute rounded-full`}
              style={{ width: size * 2, height: size * 2 }}
            ></span>
          </>
        )}
      </span>
      <span className="text-xs font-medium uppercase tracking-[0.24em] text-slate-400">
        {status}
      </span>
    </span>
  );
}
