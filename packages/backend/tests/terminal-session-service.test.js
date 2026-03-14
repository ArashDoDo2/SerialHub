const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function bootstrap() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'serialhub-test-'));
  process.env.DATABASE_PATH = path.join(tempDir, 'serialhub.db');
  process.env.SESSION_SECRET = 'test-secret';
  delete require.cache[require.resolve('../dist/config/env.js')];
  delete require.cache[require.resolve('../dist/config/database.js')];
  delete require.cache[require.resolve('../dist/config/migrations.js')];
  delete require.cache[require.resolve('../dist/services/TerminalSessionService.js')];
  const { initDatabase, closeDatabase } = require('../dist/config/database.js');
  const { runMigrations } = require('../dist/config/migrations.js');
  initDatabase();
  runMigrations();
  const { TerminalSessionService } = require('../dist/services/TerminalSessionService.js');
  return { tempDir, closeDatabase, TerminalSessionService };
}

test('TerminalSessionService enforces a single active controller per node', () => {
  const { tempDir, closeDatabase, TerminalSessionService } = bootstrap();
  const service = new TerminalSessionService();

  const first = service.acquire(1, 1, 'socket-a');
  assert.equal(first.nodeId, 1);

  assert.throws(() => {
    service.acquire(1, 2, 'socket-b');
  }, /already controlled/);

  service.release('socket-a', 'closed');
  const second = service.acquire(1, 2, 'socket-b');
  assert.equal(second.userId, 2);

  closeDatabase();
  fs.rmSync(tempDir, { recursive: true, force: true });
});
