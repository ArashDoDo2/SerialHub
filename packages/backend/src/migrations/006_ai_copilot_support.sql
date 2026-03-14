CREATE TABLE IF NOT EXISTS ai_copilot_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  observerId INTEGER NOT NULL,
  terminalSessionId INTEGER,
  nodeId INTEGER NOT NULL,
  ownerUserId INTEGER NOT NULL,
  socketId TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'closed', 'error')),
  startedAt TEXT NOT NULL DEFAULT (datetime('now')),
  endedAt TEXT,
  lastError TEXT,
  FOREIGN KEY (observerId) REFERENCES ai_observers(id) ON DELETE CASCADE,
  FOREIGN KEY (terminalSessionId) REFERENCES terminalSessions(id) ON DELETE SET NULL,
  FOREIGN KEY (nodeId) REFERENCES serialNodes(id) ON DELETE CASCADE,
  FOREIGN KEY (ownerUserId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_copilot_sessions_observerId
ON ai_copilot_sessions(observerId);

CREATE INDEX IF NOT EXISTS idx_ai_copilot_sessions_terminalSessionId
ON ai_copilot_sessions(terminalSessionId);

CREATE INDEX IF NOT EXISTS idx_ai_copilot_sessions_nodeId
ON ai_copilot_sessions(nodeId);

CREATE TABLE IF NOT EXISTS ai_copilot_suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  observerId INTEGER NOT NULL,
  copilotSessionId INTEGER,
  terminalSessionId INTEGER,
  nodeId INTEGER NOT NULL,
  suggestionType TEXT NOT NULL
    CHECK (suggestionType IN ('suggestion', 'summary')),
  summary TEXT NOT NULL,
  hypothesesJson TEXT,
  suggestedActionsJson TEXT,
  rawPayloadJson TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (observerId) REFERENCES ai_observers(id) ON DELETE CASCADE,
  FOREIGN KEY (copilotSessionId) REFERENCES ai_copilot_sessions(id) ON DELETE SET NULL,
  FOREIGN KEY (terminalSessionId) REFERENCES terminalSessions(id) ON DELETE SET NULL,
  FOREIGN KEY (nodeId) REFERENCES serialNodes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_copilot_suggestions_nodeId_createdAt
ON ai_copilot_suggestions(nodeId, createdAt DESC);

CREATE INDEX IF NOT EXISTS idx_ai_copilot_suggestions_observerId
ON ai_copilot_suggestions(observerId);
