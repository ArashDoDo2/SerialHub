CREATE TABLE IF NOT EXISTS ai_observers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  authToken TEXT NOT NULL,
  ownerUserId INTEGER NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (ownerUserId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_observers_authToken
ON ai_observers(authToken);

CREATE INDEX IF NOT EXISTS idx_ai_observers_ownerUserId
ON ai_observers(ownerUserId);

CREATE TABLE IF NOT EXISTS ai_observer_sessions (
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

CREATE INDEX IF NOT EXISTS idx_ai_observer_sessions_observerId
ON ai_observer_sessions(observerId);

CREATE INDEX IF NOT EXISTS idx_ai_observer_sessions_terminalSessionId
ON ai_observer_sessions(terminalSessionId);

CREATE INDEX IF NOT EXISTS idx_ai_observer_sessions_nodeId
ON ai_observer_sessions(nodeId);

CREATE TABLE IF NOT EXISTS ai_observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  observerId INTEGER NOT NULL,
  observerSessionId INTEGER,
  terminalSessionId INTEGER,
  nodeId INTEGER NOT NULL,
  observationType TEXT NOT NULL
    CHECK (observationType IN ('result', 'summary')),
  severity TEXT NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'warning', 'critical')),
  title TEXT,
  content TEXT NOT NULL,
  rawPayloadJson TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (observerId) REFERENCES ai_observers(id) ON DELETE CASCADE,
  FOREIGN KEY (observerSessionId) REFERENCES ai_observer_sessions(id) ON DELETE SET NULL,
  FOREIGN KEY (terminalSessionId) REFERENCES terminalSessions(id) ON DELETE SET NULL,
  FOREIGN KEY (nodeId) REFERENCES serialNodes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_observations_nodeId_createdAt
ON ai_observations(nodeId, createdAt DESC);

CREATE INDEX IF NOT EXISTS idx_ai_observations_observerId
ON ai_observations(observerId);
