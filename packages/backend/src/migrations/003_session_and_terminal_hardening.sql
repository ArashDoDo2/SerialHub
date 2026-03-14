CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expire TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire);

ALTER TABLE terminalSessions ADD COLUMN controllerKey TEXT;
ALTER TABLE terminalSessions ADD COLUMN heartbeatAt TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_terminalSessions_active_node_unique
ON terminalSessions(nodeId)
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_terminalSessions_controllerKey
ON terminalSessions(controllerKey);
