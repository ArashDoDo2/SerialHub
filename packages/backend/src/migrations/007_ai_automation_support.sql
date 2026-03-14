CREATE TABLE IF NOT EXISTS ai_tool_policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  observerId INTEGER NOT NULL UNIQUE,
  allowedToolsJson TEXT NOT NULL,
  approvalRequiredToolsJson TEXT NOT NULL,
  allowedNodesJson TEXT,
  rateLimitsJson TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (observerId) REFERENCES ai_observers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_tool_policies_observerId
ON ai_tool_policies(observerId);

CREATE TABLE IF NOT EXISTS ai_automation_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  observerId INTEGER NOT NULL,
  terminalSessionId INTEGER NOT NULL,
  nodeId INTEGER NOT NULL,
  ownerUserId INTEGER NOT NULL,
  socketId TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'stopped', 'closed', 'error')),
  startedAt TEXT NOT NULL DEFAULT (datetime('now')),
  endedAt TEXT,
  stoppedByUserId INTEGER,
  lastError TEXT,
  FOREIGN KEY (observerId) REFERENCES ai_observers(id) ON DELETE CASCADE,
  FOREIGN KEY (terminalSessionId) REFERENCES terminalSessions(id) ON DELETE CASCADE,
  FOREIGN KEY (nodeId) REFERENCES serialNodes(id) ON DELETE CASCADE,
  FOREIGN KEY (ownerUserId) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (stoppedByUserId) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_automation_sessions_terminalSessionId
ON ai_automation_sessions(terminalSessionId);

CREATE INDEX IF NOT EXISTS idx_ai_automation_sessions_observerId
ON ai_automation_sessions(observerId);

CREATE INDEX IF NOT EXISTS idx_ai_automation_sessions_nodeId
ON ai_automation_sessions(nodeId);

CREATE TABLE IF NOT EXISTS ai_tool_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  observerId INTEGER NOT NULL,
  automationSessionId INTEGER,
  terminalSessionId INTEGER,
  nodeId INTEGER NOT NULL,
  toolName TEXT NOT NULL,
  argumentsJson TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('pending_approval', 'approved', 'rejected', 'executed', 'failed', 'blocked')),
  resultJson TEXT,
  requiresApproval INTEGER NOT NULL DEFAULT 0,
  approvedByUserId INTEGER,
  rejectedByUserId INTEGER,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  resolvedAt TEXT,
  FOREIGN KEY (observerId) REFERENCES ai_observers(id) ON DELETE CASCADE,
  FOREIGN KEY (automationSessionId) REFERENCES ai_automation_sessions(id) ON DELETE SET NULL,
  FOREIGN KEY (terminalSessionId) REFERENCES terminalSessions(id) ON DELETE SET NULL,
  FOREIGN KEY (nodeId) REFERENCES serialNodes(id) ON DELETE CASCADE,
  FOREIGN KEY (approvedByUserId) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (rejectedByUserId) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_tool_actions_nodeId_createdAt
ON ai_tool_actions(nodeId, createdAt DESC);

CREATE INDEX IF NOT EXISTS idx_ai_tool_actions_status
ON ai_tool_actions(status);
