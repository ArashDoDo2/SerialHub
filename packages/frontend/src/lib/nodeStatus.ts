"use client";

export type LiveNodeStatus = 'online' | 'offline' | 'error';

export async function probeNodeStatus(nodeId: number): Promise<LiveNodeStatus> {
  try {
    const response = await fetch(`/api/nodes/${nodeId}/test`, {
      method: 'POST',
    });

    if (!response.ok) {
      return 'error';
    }

    const payload = await response.json().catch(() => null);
    if (payload?.status === 'online' || payload?.status === 'offline' || payload?.status === 'error') {
      return payload.status;
    }

    return 'error';
  } catch {
    return 'error';
  }
}

export async function probeNodeStatuses(nodeIds: number[]): Promise<Record<number, LiveNodeStatus>> {
  const entries = await Promise.all(
    nodeIds.map(async (nodeId) => [nodeId, await probeNodeStatus(nodeId)] as const)
  );

  return Object.fromEntries(entries) as Record<number, LiveNodeStatus>;
}
