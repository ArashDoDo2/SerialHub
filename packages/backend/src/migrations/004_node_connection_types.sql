ALTER TABLE serialNodes ADD COLUMN connectionType TEXT NOT NULL DEFAULT 'raw-tcp'
CHECK (connectionType IN ('raw-tcp', 'rfc2217'));

CREATE INDEX IF NOT EXISTS idx_serialNodes_connectionType
ON serialNodes(connectionType);
