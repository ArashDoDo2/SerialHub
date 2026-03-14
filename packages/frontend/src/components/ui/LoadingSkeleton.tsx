import React from 'react';

interface Props {
  className?: string;
}

export default function LoadingSkeleton({ className }: Props) {
  return (
    <div
      className={`animate-pulse rounded-2xl bg-white/8 ${className ?? 'h-4 w-full'}`}
    ></div>
  );
}
