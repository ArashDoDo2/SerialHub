-- Seed data for SerialHub database

-- Insert sample users
INSERT INTO users (googleId, email, name, avatarUrl, role) VALUES
('123456789', 'admin@serialhub.com', 'Admin User', 'https://example.com/avatar1.jpg', 'admin'),
('987654321', 'user@serialhub.com', 'Test User', 'https://example.com/avatar2.jpg', 'user');

-- Insert sample device profiles
INSERT INTO deviceProfiles (name, description, defaultBaudRate, notes, ownerUserId) VALUES
('MikroTik Router', 'Standard MikroTik router configuration', 115200, 'Common settings for MikroTik devices', 1),
('Arduino Uno', 'Arduino Uno development board', 9600, 'Standard serial settings for Arduino', 2),
('Raspberry Pi', 'Raspberry Pi serial console', 115200, 'UART settings for Pi', 1);

-- Insert sample serial nodes (assuming users exist)
INSERT INTO serialNodes (name, description, connectionType, host, port, baudRate, dataBits, parity, stopBits, isActive, ownerUserId) VALUES
('MikroTik-1', 'Main office router', 'raw-tcp', '192.168.1.100', 2217, 115200, 8, 'none', 1.0, 1, 1),
('Arduino-Test', 'Development board for testing', 'raw-tcp', '192.168.1.101', 2217, 9600, 8, 'none', 1.0, 1, 2),
('Pi-Console', 'Raspberry Pi serial access', 'raw-tcp', '192.168.1.102', 2217, 115200, 8, 'none', 1.0, 1, 1);

-- Insert sample scripts
INSERT INTO scripts (name, description, commandsJson, defaultDelayMs, timeoutMs, ownerUserId) VALUES
('Ping Test', 'Simple ping test script', '["AT\\r\\n", "WAIT 1000", "AT+CPING=\\"8.8.8.8\\"\\r\\n"]', 500, 10000, 1),
('Device Info', 'Get device information', '["info\\r\\n", "WAIT 2000", "version\\r\\n"]', 1000, 15000, 2),
('Reset Device', 'Reset device to factory settings', '["reset\\r\\n", "WAIT 5000", "confirm\\r\\n"]', 2000, 30000, 1);

-- Insert sample test cases
INSERT INTO testCases (name, description, scriptId, expectedPattern, failPattern, timeoutMs) VALUES
('Ping Success', 'Test successful ping response', 1, 'OK', 'ERROR', 5000),
('Info Response', 'Check device info response', 2, 'Version:', 'Timeout', 10000),
('Reset Confirmation', 'Verify reset operation', 3, 'Reset complete', 'Failed', 20000);
