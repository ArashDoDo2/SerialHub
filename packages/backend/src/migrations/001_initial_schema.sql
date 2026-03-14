-- SerialHub SQLite Schema Migration
-- This schema is designed to be compatible with PostgreSQL migration

-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- Users table
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    googleId TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    avatarUrl TEXT,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- DeviceProfiles table
CREATE TABLE deviceProfiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    defaultBaudRate INTEGER NOT NULL,
    notes TEXT,
    ownerUserId INTEGER NOT NULL,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (ownerUserId) REFERENCES users(id) ON DELETE CASCADE
);

-- SerialNodes table
CREATE TABLE serialNodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    connectionType TEXT NOT NULL DEFAULT 'raw-tcp' CHECK (connectionType IN ('raw-tcp', 'rfc2217')),
    host TEXT NOT NULL,
    port INTEGER NOT NULL,
    baudRate INTEGER NOT NULL,
    dataBits INTEGER NOT NULL DEFAULT 8,
    parity TEXT NOT NULL DEFAULT 'none' CHECK (parity IN ('none', 'even', 'odd', 'mark', 'space')),
    stopBits REAL NOT NULL DEFAULT 1.0,
    isActive INTEGER NOT NULL DEFAULT 1,
    ownerUserId INTEGER NOT NULL,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (ownerUserId) REFERENCES users(id) ON DELETE CASCADE
);

-- Scripts table
CREATE TABLE scripts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    commandsJson TEXT NOT NULL, -- JSON array of commands
    defaultDelayMs INTEGER NOT NULL DEFAULT 100,
    timeoutMs INTEGER NOT NULL DEFAULT 30000,
    ownerUserId INTEGER NOT NULL,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (ownerUserId) REFERENCES users(id) ON DELETE CASCADE
);

-- ScriptRuns table
CREATE TABLE scriptRuns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scriptId INTEGER NOT NULL,
    nodeId INTEGER NOT NULL,
    runByUserId INTEGER NOT NULL,
    ownerUserId INTEGER NOT NULL,
    startedAt TEXT NOT NULL DEFAULT (datetime('now')),
    finishedAt TEXT,
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
    outputFilePath TEXT,
    FOREIGN KEY (scriptId) REFERENCES scripts(id) ON DELETE CASCADE,
    FOREIGN KEY (nodeId) REFERENCES serialNodes(id) ON DELETE CASCADE,
    FOREIGN KEY (runByUserId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (ownerUserId) REFERENCES users(id) ON DELETE CASCADE
);

-- TerminalSessions table
CREATE TABLE terminalSessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nodeId INTEGER NOT NULL,
    userId INTEGER NOT NULL,
    startedAt TEXT NOT NULL DEFAULT (datetime('now')),
    finishedAt TEXT,
    logFilePath TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'error')),
    FOREIGN KEY (nodeId) REFERENCES serialNodes(id) ON DELETE CASCADE,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

-- TestCases table
CREATE TABLE testCases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    scriptId INTEGER NOT NULL,
    expectedPattern TEXT,
    failPattern TEXT,
    timeoutMs INTEGER NOT NULL DEFAULT 30000,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (scriptId) REFERENCES scripts(id) ON DELETE CASCADE
);

-- TestRuns table
CREATE TABLE testRuns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nodeId INTEGER NOT NULL,
    deviceProfileId INTEGER,
    runByUserId INTEGER NOT NULL,
    ownerUserId INTEGER NOT NULL,
    startedAt TEXT NOT NULL DEFAULT (datetime('now')),
    finishedAt TEXT,
    overallResult TEXT NOT NULL DEFAULT 'running' CHECK (overallResult IN ('running', 'passed', 'failed', 'partial')),
    reportFilePath TEXT,
    FOREIGN KEY (nodeId) REFERENCES serialNodes(id) ON DELETE CASCADE,
    FOREIGN KEY (deviceProfileId) REFERENCES deviceProfiles(id) ON DELETE SET NULL,
    FOREIGN KEY (runByUserId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (ownerUserId) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX idx_users_googleId ON users(googleId);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_deviceProfiles_ownerUserId ON deviceProfiles(ownerUserId);
CREATE INDEX idx_serialNodes_ownerUserId ON serialNodes(ownerUserId);
CREATE INDEX idx_serialNodes_host_port ON serialNodes(host, port);
CREATE INDEX idx_serialNodes_connectionType ON serialNodes(connectionType);
CREATE INDEX idx_scripts_ownerUserId ON scripts(ownerUserId);
CREATE INDEX idx_scriptRuns_scriptId ON scriptRuns(scriptId);
CREATE INDEX idx_scriptRuns_nodeId ON scriptRuns(nodeId);
CREATE INDEX idx_scriptRuns_runByUserId ON scriptRuns(runByUserId);
CREATE INDEX idx_scriptRuns_ownerUserId ON scriptRuns(ownerUserId);
CREATE INDEX idx_scriptRuns_status ON scriptRuns(status);
CREATE INDEX idx_terminalSessions_nodeId ON terminalSessions(nodeId);
CREATE INDEX idx_terminalSessions_userId ON terminalSessions(userId);
CREATE INDEX idx_terminalSessions_status ON terminalSessions(status);
CREATE INDEX idx_testCases_scriptId ON testCases(scriptId);
CREATE INDEX idx_testRuns_nodeId ON testRuns(nodeId);
CREATE INDEX idx_testRuns_deviceProfileId ON testRuns(deviceProfileId);
CREATE INDEX idx_testRuns_runByUserId ON testRuns(runByUserId);
CREATE INDEX idx_testRuns_ownerUserId ON testRuns(ownerUserId);
CREATE INDEX idx_testRuns_overallResult ON testRuns(overallResult);
