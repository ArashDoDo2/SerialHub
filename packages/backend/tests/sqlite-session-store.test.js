const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function bootstrap() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'serialhub-session-test-'));
  process.env.DATABASE_PATH = path.join(tempDir, 'serialhub.db');
  process.env.SESSION_SECRET = 'test-secret';
  delete require.cache[require.resolve('../dist/config/env.js')];
  delete require.cache[require.resolve('../dist/config/database.js')];
  delete require.cache[require.resolve('../dist/config/SQLiteSessionStore.js')];
  const { initDatabase, closeDatabase } = require('../dist/config/database.js');
  initDatabase();
  const { SQLiteSessionStore } = require('../dist/config/SQLiteSessionStore.js');
  return { tempDir, closeDatabase, SQLiteSessionStore };
}

test('SQLiteSessionStore persists and retrieves sessions', async () => {
  const { tempDir, closeDatabase, SQLiteSessionStore } = bootstrap();
  const store = new SQLiteSessionStore();
  const sid = 'session-1';
  const session = {
    cookie: { maxAge: 1000 },
    passport: { user: 1 },
  };

  await new Promise((resolve, reject) => {
    store.set(sid, session, (error) => (error ? reject(error) : resolve()));
  });

  const loaded = await new Promise((resolve, reject) => {
    store.get(sid, (error, value) => (error ? reject(error) : resolve(value)));
  });

  assert.equal(loaded.passport.user, 1);

  closeDatabase();
  fs.rmSync(tempDir, { recursive: true, force: true });
});
