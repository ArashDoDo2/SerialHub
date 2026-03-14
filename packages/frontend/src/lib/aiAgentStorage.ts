"use client";

export type AgentMode = 'observer' | 'controller';

type AgentMetaRecord = Record<string, { mode: AgentMode }>;
type NodeAssignmentRecord = Record<string, number | null>;

const AGENT_META_KEY = 'serialhub.agentMeta';
const NODE_ASSIGNMENT_KEY = 'serialhub.nodeAgentAssignments';

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readJson<T>(key: string, fallback: T): T {
  if (!canUseStorage()) {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

export function getAgentModes(): AgentMetaRecord {
  return readJson<AgentMetaRecord>(AGENT_META_KEY, {});
}

export function setAgentMode(agentId: number, mode: AgentMode): void {
  const current = getAgentModes();
  current[String(agentId)] = { mode };
  writeJson(AGENT_META_KEY, current);
}

export function removeAgentMode(agentId: number): void {
  const current = getAgentModes();
  delete current[String(agentId)];
  writeJson(AGENT_META_KEY, current);
}

export function getNodeAgentAssignments(): NodeAssignmentRecord {
  return readJson<NodeAssignmentRecord>(NODE_ASSIGNMENT_KEY, {});
}

export function setNodeAgentAssignment(nodeId: number, agentId: number | null): void {
  const current = getNodeAgentAssignments();
  current[String(nodeId)] = agentId;
  writeJson(NODE_ASSIGNMENT_KEY, current);
}

export function removeAgentAssignmentsForDeletedAgent(agentId: number): void {
  const current = getNodeAgentAssignments();
  let changed = false;

  for (const [nodeId, assignedAgentId] of Object.entries(current)) {
    if (assignedAgentId === agentId) {
      current[nodeId] = null;
      changed = true;
    }
  }

  if (changed) {
    writeJson(NODE_ASSIGNMENT_KEY, current);
  }
}
