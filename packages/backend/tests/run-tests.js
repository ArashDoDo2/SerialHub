const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

function clearModules() {
  const modules = [
    '../dist/config/env.js',
    '../dist/config/database.js',
    '../dist/config/migrations.js',
    '../dist/config/SQLiteSessionStore.js',
    '../dist/repositories/BaseRepository.js',
    '../dist/repositories/SerialNodeRepository.js',
    '../dist/repositories/ScriptRepository.js',
    '../dist/repositories/ScriptRunRepository.js',
    '../dist/repositories/TerminalSessionRepository.js',
    '../dist/repositories/AIObserverRepository.js',
    '../dist/repositories/AIObserverSessionRepository.js',
    '../dist/repositories/AIObservationRepository.js',
    '../dist/repositories/UserRepository.js',
    '../dist/repositories/AICopilotSessionRepository.js',
    '../dist/repositories/AICopilotSuggestionRepository.js',
    '../dist/repositories/AIToolPolicyRepository.js',
    '../dist/repositories/AIAutomationSessionRepository.js',
    '../dist/repositories/AIToolActionRepository.js',
    '../dist/services/SerialNodeService.js',
    '../dist/services/TerminalSessionService.js',
    '../dist/services/SerialConnectionManager.js',
    '../dist/services/ScriptService.js',
    '../dist/services/AIObserverService.js',
    '../dist/services/AICopilotService.js',
    '../dist/services/AIAutomationService.js',
    '../dist/services/PolicyEngine.js',
    '../dist/services/ToolRegistry.js',
    '../dist/services/transports/TransportFactory.js',
    '../dist/services/transports/RawTcpTransport.js',
    '../dist/services/transports/Rfc2217Transport.js',
    '../dist/services/protocols/telnet/TelnetConstants.js',
    '../dist/services/protocols/telnet/TelnetStateMachine.js',
    '../dist/services/protocols/telnet/TelnetParser.js',
    '../dist/services/protocols/rfc2217/Rfc2217Constants.js',
    '../dist/services/protocols/rfc2217/Rfc2217Negotiator.js',
  ];

  for (const modulePath of modules) {
    try {
      delete require.cache[require.resolve(modulePath)];
    } catch (_error) {
      // ignore cache misses
    }
  }
}

async function withTempDatabase(prefix, fn) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  process.env.DATABASE_PATH = path.join(tempDir, 'serialhub.db');
  process.env.SESSION_SECRET = 'test-secret';
  process.env.LOCAL_AUTH_ENABLED = 'true';
  clearModules();

  const { initDatabase, closeDatabase } = require('../dist/config/database.js');
  initDatabase();

  try {
    return await fn(tempDir, closeDatabase);
  } finally {
    closeDatabase();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function withTcpServer(onConnection, fn) {
  const sockets = new Set();
  const server = net.createServer(onConnection);
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => {
      sockets.delete(socket);
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object');

  try {
    return await fn(address.port);
  } finally {
    for (const socket of sockets) {
      socket.destroy();
    }
    await new Promise((resolve) => server.close(resolve));
  }
}

function waitForEvent(emitter, eventName, predicate = () => true, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      emitter.off(eventName, handler);
      reject(new Error(`Timed out waiting for event ${eventName}`));
    }, timeoutMs);

    const handler = (payload) => {
      if (!predicate(payload)) {
        return;
      }

      clearTimeout(timeout);
      emitter.off(eventName, handler);
      resolve(payload);
    };

    emitter.on(eventName, handler);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function collectTelnetParserEvents(parser) {
  const result = {
    data: [],
    commands: [],
    subnegotiations: [],
  };

  parser.on('data', (payload) => {
    result.data.push(payload);
  });
  parser.on('command', (payload) => {
    result.commands.push(payload);
  });
  parser.on('subnegotiation', (payload) => {
    result.subnegotiations.push(payload);
  });

  return result;
}

function createNode(port, overrides = {}) {
  return {
    id: overrides.id || 1,
    name: overrides.name || 'Test Node',
    connectionType: overrides.connectionType || 'raw-tcp',
    host: overrides.host || '127.0.0.1',
    port,
    baudRate: overrides.baudRate || 115200,
    dataBits: overrides.dataBits || 8,
    parity: overrides.parity || 'none',
    stopBits: overrides.stopBits || 1,
    isActive: overrides.isActive === undefined ? true : overrides.isActive,
    ownerUserId: overrides.ownerUserId || 1,
    createdAt: overrides.createdAt || new Date().toISOString(),
    updatedAt: overrides.updatedAt || new Date().toISOString(),
  };
}

function seedNode(db, port, overrides = {}) {
  const result = db
    .prepare(
      `INSERT INTO serialNodes
       (name, description, connectionType, host, port, baudRate, dataBits, parity, stopBits, isActive, ownerUserId, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    )
    .run(
      overrides.name || 'Test Node',
      overrides.description || null,
      overrides.connectionType || 'raw-tcp',
      overrides.host || '127.0.0.1',
      port,
      overrides.baudRate || 115200,
      overrides.dataBits || 8,
      overrides.parity || 'none',
      overrides.stopBits || 1,
      overrides.isActive === undefined ? 1 : overrides.isActive,
      overrides.ownerUserId || 1
    );

  return result.lastInsertRowid;
}

function seedUser(db, overrides = {}) {
  const suffix = overrides.idSuffix || Math.random().toString(16).slice(2, 8);
  return Number(
    db
      .prepare(
        `INSERT INTO users (googleId, email, name, avatarUrl, role, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
      )
      .run(
        overrides.googleId || `google-${suffix}`,
        overrides.email || `user-${suffix}@serialhub.local`,
        overrides.name || `User ${suffix}`,
        overrides.avatarUrl || null,
        overrides.role || 'user'
      ).lastInsertRowid
  );
}

function seedScript(db, nodeId, overrides = {}) {
  const result = db
    .prepare(
      `INSERT INTO scripts
       (name, description, commandsJson, defaultDelayMs, timeoutMs, ownerUserId, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    )
    .run(
      overrides.name || 'Echo Script',
      overrides.description || null,
      overrides.commandsJson || JSON.stringify(['PING']),
      overrides.defaultDelayMs || 50,
      overrides.timeoutMs || 2000,
      overrides.ownerUserId || 1
    );

  return result.lastInsertRowid;
}

function testTerminalSessionService() {
  return withTempDatabase('serialhub-test-', () => {
    const { runMigrations } = require('../dist/config/migrations.js');
    const { getDatabase } = require('../dist/config/database.js');
    runMigrations();
    const { TerminalSessionService } = require('../dist/services/TerminalSessionService.js');
    const service = new TerminalSessionService();

    const first = service.acquire(1, 1, 'socket-a');
    assert.equal(first.nodeId, 1);

    assert.throws(() => {
      service.acquire(1, 2, 'socket-b');
    }, /already controlled/);

    service.release('socket-a', 'closed');
    const second = service.acquire(1, 2, 'socket-b');
    assert.equal(second.userId, 2);

    service.acquire(2, 1, 'socket-c');
    getDatabase()
      .prepare("UPDATE terminalSessions SET heartbeatAt = datetime('now', '-120 seconds') WHERE controllerKey = ?")
      .run('socket-c');
    assert.equal(service.cleanupExpired(), 1);
    const recovered = service.acquire(2, 2, 'socket-d');
    assert.equal(recovered.userId, 2);
  });
}

function testStartupTerminalSessionRecovery() {
  return withTempDatabase('serialhub-terminal-startup-recovery-', () => {
    const { runMigrations } = require('../dist/config/migrations.js');
    const { getDatabase } = require('../dist/config/database.js');
    runMigrations();

    const db = getDatabase();
    db.prepare(
      `INSERT INTO terminalSessions
       (nodeId, userId, startedAt, status, controllerKey, controllingSocketId, heartbeatAt)
       VALUES (?, ?, datetime('now'), 'active', ?, ?, datetime('now'))`
    ).run(1, 1, 'stale-controller', 'stale-socket');

    const { TerminalSessionService } = require('../dist/services/TerminalSessionService.js');
    const service = new TerminalSessionService();
    assert.equal(service.reconcileStartupSessions(), 1);

    const recovered = db
      .prepare(`SELECT status, finishedAt FROM terminalSessions WHERE controllerKey = ?`)
      .get('stale-controller');
    assert.equal(recovered.status, 'error');
    assert.ok(recovered.finishedAt);
  });
}

function testSQLiteSessionStore() {
  return withTempDatabase('serialhub-session-test-', () => {
    const { SQLiteSessionStore } = require('../dist/config/SQLiteSessionStore.js');
    const store = new SQLiteSessionStore();

    return new Promise((resolve, reject) => {
      store.set('session-1', { cookie: { maxAge: 1000 }, passport: { user: 1 } }, (setError) => {
        if (setError) {
          reject(setError);
          return;
        }

        store.get('session-1', (getError, session) => {
          if (getError) {
            reject(getError);
            return;
          }

          try {
            assert.equal(session.passport.user, 1);
            resolve();
          } catch (assertionError) {
            reject(assertionError);
          }
        });
      });
    });
  });
}

function testLocalAuthCannotRunInProduction() {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousLocalAuthEnabled = process.env.LOCAL_AUTH_ENABLED;
  const previousSessionSecret = process.env.SESSION_SECRET;

  try {
    process.env.NODE_ENV = 'production';
    process.env.LOCAL_AUTH_ENABLED = 'true';
    process.env.SESSION_SECRET = 'secure-production-secret';
    clearModules();

    assert.throws(() => {
      require('../dist/config/env.js');
    }, /LOCAL_AUTH_ENABLED is only supported in development/);
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }

    if (previousLocalAuthEnabled === undefined) {
      delete process.env.LOCAL_AUTH_ENABLED;
    } else {
      process.env.LOCAL_AUTH_ENABLED = previousLocalAuthEnabled;
    }

    if (previousSessionSecret === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = previousSessionSecret;
    }

    clearModules();
  }
}

async function testRawTcpTransportLifecycle() {
  await withTcpServer((socket) => {
    socket.write(Buffer.from('READY'));
    socket.on('data', (data) => {
      socket.write(Buffer.concat([Buffer.from('ECHO:'), data]));
    });
  }, async (port) => {
    const { RawTcpTransport } = require('../dist/services/transports/RawTcpTransport.js');
    const node = {
      id: 1,
      name: 'Raw Node',
      connectionType: 'raw-tcp',
      host: '127.0.0.1',
      port,
      baudRate: 115200,
      dataBits: 8,
      parity: 'none',
      stopBits: 1,
      isActive: true,
      ownerUserId: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const transport = new RawTcpTransport(node, 2000);

    const firstChunk = waitForEvent(transport, 'data');
    await transport.connect();
    assert.equal(transport.getState(), 'connected');
    assert.equal((await firstChunk).toString('utf-8'), 'READY');

    const echoed = waitForEvent(transport, 'data', (data) => data.toString('utf-8').startsWith('ECHO:'));
    transport.write(Buffer.from('HELLO'));
    assert.equal((await echoed).toString('utf-8'), 'ECHO:HELLO');

    const closeEvent = waitForEvent(transport, 'close');
    transport.disconnect();
    await closeEvent;
    assert.equal(transport.getState(), 'disconnected');
  });
}

function testTelnetParserPlainAsciiAndBinaryData() {
  const { TelnetParser } = require('../dist/services/protocols/telnet/TelnetParser.js');
  const parser = new TelnetParser();
  const events = collectTelnetParserEvents(parser);

  parser.push(Buffer.from([0x48, 0x69, 0x00, 0x7f]));

  assert.equal(events.data.length, 1);
  assert.deepEqual(Array.from(events.data[0]), [0x48, 0x69, 0x00, 0x7f]);
  assert.equal(events.commands.length, 0);
  assert.equal(events.subnegotiations.length, 0);
}

function testTelnetParserIacEscaping() {
  const { TelnetParser } = require('../dist/services/protocols/telnet/TelnetParser.js');
  const { TELNET_IAC } = require('../dist/services/protocols/telnet/TelnetConstants.js');
  const parser = new TelnetParser();
  const events = collectTelnetParserEvents(parser);

  parser.push(Buffer.from([0x41, TELNET_IAC, TELNET_IAC, 0x42]));

  assert.equal(events.data.length, 1);
  assert.deepEqual(Array.from(events.data[0]), [0x41, TELNET_IAC, 0x42]);
}

function testTelnetParserNegotiationCommands() {
  const { TelnetParser } = require('../dist/services/protocols/telnet/TelnetParser.js');
  const {
    TELNET_DO,
    TELNET_WILL,
    TELNET_IAC,
  } = require('../dist/services/protocols/telnet/TelnetConstants.js');
  const parser = new TelnetParser();
  const events = collectTelnetParserEvents(parser);

  parser.push(Buffer.from([TELNET_IAC, TELNET_DO]));
  parser.push(Buffer.from([0x03, TELNET_IAC, TELNET_WILL, 0x2c]));

  assert.deepEqual(events.commands, [
    { command: TELNET_DO, option: 0x03 },
    { command: TELNET_WILL, option: 0x2c },
  ]);
}

function testTelnetParserSubnegotiationAndPartialFrames() {
  const { TelnetParser } = require('../dist/services/protocols/telnet/TelnetParser.js');
  const {
    TELNET_IAC,
    TELNET_SB,
    TELNET_SE,
  } = require('../dist/services/protocols/telnet/TelnetConstants.js');
  const parser = new TelnetParser();
  const events = collectTelnetParserEvents(parser);

  parser.push(Buffer.from([0x41, TELNET_IAC, TELNET_SB, 0x2c, 0x01]));
  parser.push(Buffer.from([0x02, TELNET_IAC]));
  parser.push(Buffer.from([TELNET_SE, 0x42]));

  assert.equal(events.data.length, 2);
  assert.deepEqual(Array.from(events.data[0]), [0x41]);
  assert.deepEqual(Array.from(events.data[1]), [0x42]);
  assert.equal(events.subnegotiations.length, 1);
  assert.equal(events.subnegotiations[0].option, 0x2c);
  assert.deepEqual(Array.from(events.subnegotiations[0].payload), [0x01, 0x02]);
}

function testTelnetParserSubnegotiationEscapedIac() {
  const { TelnetParser } = require('../dist/services/protocols/telnet/TelnetParser.js');
  const {
    TELNET_IAC,
    TELNET_SB,
    TELNET_SE,
  } = require('../dist/services/protocols/telnet/TelnetConstants.js');
  const parser = new TelnetParser();
  const events = collectTelnetParserEvents(parser);

  parser.push(Buffer.from([TELNET_IAC, TELNET_SB, 0x18, 0x01, TELNET_IAC, TELNET_IAC, 0x02, TELNET_IAC, TELNET_SE]));

  assert.equal(events.subnegotiations.length, 1);
  assert.equal(events.subnegotiations[0].option, 0x18);
  assert.deepEqual(Array.from(events.subnegotiations[0].payload), [0x01, TELNET_IAC, 0x02]);
}

async function testRawTcpTransportStripsTelnetControlSequences() {
  await withTcpServer((socket) => {
    socket.write(Buffer.from([0x41, 0xff, 0xfb, 0x01, 0x42]));
  }, async (port) => {
    const { RawTcpTransport } = require('../dist/services/transports/RawTcpTransport.js');
    const { TELNET_WILL } = require('../dist/services/protocols/telnet/TelnetConstants.js');
    const node = {
      id: 1,
      name: 'Raw Node',
      connectionType: 'raw-tcp',
      host: '127.0.0.1',
      port,
      baudRate: 115200,
      dataBits: 8,
      parity: 'none',
      stopBits: 1,
      isActive: true,
      ownerUserId: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const transport = new RawTcpTransport(node, 2000);

    const dataEvents = [];
    transport.on('data', (data) => {
      dataEvents.push(data);
    });
    const commandEvent = waitForEvent(transport, 'telnetCommand');
    await transport.connect();
    await sleep(25);

    try {
      assert.deepEqual(await commandEvent, { command: TELNET_WILL, option: 0x01 });
      assert.deepEqual(
        dataEvents.map((data) => Array.from(data)),
        [[0x41], [0x42]]
      );
    } finally {
      transport.disconnect();
      await waitForEvent(transport, 'close');
    }
  });
}

async function testRfc2217TransportNegotiationAndDataFlow() {
  const appliedCommands = [];
  await withTcpServer((socket) => {
    const { TelnetParser } = require('../dist/services/protocols/telnet/TelnetParser.js');
    const {
      TELNET_DO,
      TELNET_WILL,
    } = require('../dist/services/protocols/telnet/TelnetConstants.js');
    const {
      TELNET_OPTION_BINARY,
      TELNET_OPTION_COM_PORT,
      TELNET_OPTION_SUPPRESS_GO_AHEAD,
      encodeRfc2217Subnegotiation,
      encodeTelnetNegotiation,
      getExpectedServerCommand,
      RFC2217_SET_MODEMSTATE_MASK,
    } = require('../dist/services/protocols/rfc2217/Rfc2217Constants.js');

    const parser = new TelnetParser();
    const seenCommands = [];

    parser.on('command', ({ command, option }) => {
      seenCommands.push([command, option]);
      if (command === TELNET_DO || command === TELNET_WILL) {
        socket.write(encodeTelnetNegotiation(command, option));
      }
    });

    parser.on('subnegotiation', ({ option, payload }) => {
      if (option !== TELNET_OPTION_COM_PORT || payload.length === 0) {
        return;
      }

      const command = payload[0];
      const value = payload.subarray(1);
      appliedCommands.push(command);
      socket.write(encodeRfc2217Subnegotiation(getExpectedServerCommand(command), value));

      if (command === RFC2217_SET_MODEMSTATE_MASK) {
        socket.write(Buffer.from('READY'));
      }
    });

    parser.on('data', (data) => {
      socket.write(Buffer.concat([Buffer.from('RFC:'), data]));
    });

    socket.on('data', (data) => parser.push(data));

    setImmediate(() => {
      socket.write(encodeTelnetNegotiation(TELNET_WILL, TELNET_OPTION_BINARY));
      socket.write(encodeTelnetNegotiation(TELNET_WILL, TELNET_OPTION_SUPPRESS_GO_AHEAD));
      socket.write(encodeTelnetNegotiation(TELNET_WILL, TELNET_OPTION_COM_PORT));
      socket.write(encodeTelnetNegotiation(TELNET_DO, TELNET_OPTION_BINARY));
      socket.write(encodeTelnetNegotiation(TELNET_DO, TELNET_OPTION_SUPPRESS_GO_AHEAD));
      socket.write(encodeTelnetNegotiation(TELNET_DO, TELNET_OPTION_COM_PORT));
    });
  }, async (port) => {
    const { Rfc2217Transport } = require('../dist/services/transports/Rfc2217Transport.js');
    const {
      RFC2217_SET_BAUDRATE,
      RFC2217_SET_CONTROL,
      RFC2217_SET_DATASIZE,
      RFC2217_SET_LINESTATE_MASK,
      RFC2217_SET_MODEMSTATE_MASK,
      RFC2217_SET_PARITY,
      RFC2217_SET_STOPSIZE,
    } = require('../dist/services/protocols/rfc2217/Rfc2217Constants.js');

    const transport = new Rfc2217Transport(createNode(port, { connectionType: 'rfc2217' }), 2000);
    const states = [];
    transport.on('stateChange', ({ state }) => {
      states.push(state);
    });

    const readyChunk = waitForEvent(transport, 'data', (data) => data.toString('utf-8') === 'READY');
    await transport.connect();
    assert.equal(transport.getState(), 'ready');
    assert.equal((await readyChunk).toString('utf-8'), 'READY');
    assert.deepEqual(states.slice(0, 4), ['connecting', 'telnet-negotiating', 'rfc2217-negotiating', 'ready']);

    const caps = transport.getCapabilities();
    assert.equal(caps.connectionType, 'rfc2217');
    assert.equal(caps.appliesSerialSettings, true);
    assert.equal(caps.degraded, false);

    const echoed = waitForEvent(transport, 'data', (data) => data.toString('utf-8').startsWith('RFC:'));
    transport.write(Buffer.from('PING'));
    assert.equal((await echoed).toString('utf-8'), 'RFC:PING');

    const closeEvent = waitForEvent(transport, 'close');
    transport.disconnect();
    await closeEvent;

    const requiredCommands = [
      RFC2217_SET_BAUDRATE,
      RFC2217_SET_DATASIZE,
      RFC2217_SET_PARITY,
      RFC2217_SET_STOPSIZE,
      RFC2217_SET_CONTROL,
      RFC2217_SET_LINESTATE_MASK,
      RFC2217_SET_MODEMSTATE_MASK,
    ];
    assert.deepEqual(appliedCommands.slice(0, requiredCommands.length), requiredCommands);
  });
}

async function testRfc2217TransportStatusNotifications() {
  await withTcpServer((socket) => {
    const { TelnetParser } = require('../dist/services/protocols/telnet/TelnetParser.js');
    const {
      TELNET_DO,
      TELNET_WILL,
    } = require('../dist/services/protocols/telnet/TelnetConstants.js');
    const {
      TELNET_OPTION_BINARY,
      TELNET_OPTION_COM_PORT,
      TELNET_OPTION_SUPPRESS_GO_AHEAD,
      encodeRfc2217Subnegotiation,
      encodeTelnetNegotiation,
      getExpectedServerCommand,
      RFC2217_NOTIFY_LINESTATE,
      RFC2217_NOTIFY_MODEMSTATE,
      RFC2217_SET_MODEMSTATE_MASK,
    } = require('../dist/services/protocols/rfc2217/Rfc2217Constants.js');

    const parser = new TelnetParser();

    parser.on('command', ({ command, option }) => {
      if (command === TELNET_DO || command === TELNET_WILL) {
        socket.write(encodeTelnetNegotiation(command, option));
      }
    });

    parser.on('subnegotiation', ({ option, payload }) => {
      if (option !== TELNET_OPTION_COM_PORT || payload.length === 0) {
        return;
      }
      const command = payload[0];
      const value = payload.subarray(1);
      socket.write(encodeRfc2217Subnegotiation(getExpectedServerCommand(command), value));

      if (command === RFC2217_SET_MODEMSTATE_MASK) {
        socket.write(encodeRfc2217Subnegotiation(RFC2217_NOTIFY_LINESTATE, Buffer.from([0x34])));
        socket.write(encodeRfc2217Subnegotiation(RFC2217_NOTIFY_MODEMSTATE, Buffer.from([0x91])));
      }
    });

    socket.on('data', (data) => parser.push(data));

    setImmediate(() => {
      socket.write(encodeTelnetNegotiation(TELNET_WILL, TELNET_OPTION_BINARY));
      socket.write(encodeTelnetNegotiation(TELNET_WILL, TELNET_OPTION_SUPPRESS_GO_AHEAD));
      socket.write(encodeTelnetNegotiation(TELNET_WILL, TELNET_OPTION_COM_PORT));
      socket.write(encodeTelnetNegotiation(TELNET_DO, TELNET_OPTION_BINARY));
      socket.write(encodeTelnetNegotiation(TELNET_DO, TELNET_OPTION_SUPPRESS_GO_AHEAD));
      socket.write(encodeTelnetNegotiation(TELNET_DO, TELNET_OPTION_COM_PORT));
    });
  }, async (port) => {
    const { Rfc2217Transport } = require('../dist/services/transports/Rfc2217Transport.js');
    const transport = new Rfc2217Transport(createNode(port, { connectionType: 'rfc2217' }), 2000);

    const lineStateEvent = waitForEvent(transport, 'lineState');
    const modemStateEvent = waitForEvent(transport, 'modemState');
    await transport.connect();

    assert.deepEqual(await lineStateEvent, { lineState: 0x34 });
    assert.deepEqual(await modemStateEvent, { modemState: 0x91 });
    assert.equal(transport.getCapabilities().supportsLineStateNotifications, true);
    assert.equal(transport.getCapabilities().supportsModemStateNotifications, true);

    transport.disconnect();
    await waitForEvent(transport, 'close');
  });
}

async function testRfc2217TransportPartialServerDegradesCleanly() {
  await withTcpServer((socket) => {
    const { TelnetParser } = require('../dist/services/protocols/telnet/TelnetParser.js');
    const {
      TELNET_DO,
      TELNET_DONT,
      TELNET_WILL,
      TELNET_WONT,
    } = require('../dist/services/protocols/telnet/TelnetConstants.js');
    const {
      TELNET_OPTION_BINARY,
      TELNET_OPTION_COM_PORT,
      TELNET_OPTION_SUPPRESS_GO_AHEAD,
      encodeRfc2217Subnegotiation,
      encodeTelnetNegotiation,
      getExpectedServerCommand,
      RFC2217_SET_CONTROL,
      RFC2217_SET_LINESTATE_MASK,
      RFC2217_SET_MODEMSTATE_MASK,
    } = require('../dist/services/protocols/rfc2217/Rfc2217Constants.js');

    const parser = new TelnetParser();

    parser.on('command', ({ command, option }) => {
      if (option === TELNET_OPTION_SUPPRESS_GO_AHEAD) {
        if (command === TELNET_DO) {
          socket.write(encodeTelnetNegotiation(TELNET_WONT, option));
        } else if (command === TELNET_WILL) {
          socket.write(encodeTelnetNegotiation(TELNET_DONT, option));
        }
        return;
      }

      if (command === TELNET_DO || command === TELNET_WILL) {
        socket.write(encodeTelnetNegotiation(command, option));
      }
    });

    parser.on('subnegotiation', ({ option, payload }) => {
      if (option !== TELNET_OPTION_COM_PORT || payload.length === 0) {
        return;
      }

      const command = payload[0];
      const value = payload.subarray(1);
      if (
        command === RFC2217_SET_CONTROL ||
        command === RFC2217_SET_LINESTATE_MASK ||
        command === RFC2217_SET_MODEMSTATE_MASK
      ) {
        return;
      }
      socket.write(encodeRfc2217Subnegotiation(getExpectedServerCommand(command), value));
    });

    socket.on('data', (data) => parser.push(data));

    setImmediate(() => {
      socket.write(encodeTelnetNegotiation(TELNET_WILL, TELNET_OPTION_BINARY));
      socket.write(encodeTelnetNegotiation(TELNET_WILL, TELNET_OPTION_COM_PORT));
      socket.write(encodeTelnetNegotiation(TELNET_DO, TELNET_OPTION_BINARY));
      socket.write(encodeTelnetNegotiation(TELNET_DO, TELNET_OPTION_COM_PORT));
    });
  }, async (port) => {
    const { Rfc2217Transport } = require('../dist/services/transports/Rfc2217Transport.js');
    const transport = new Rfc2217Transport(createNode(port, { connectionType: 'rfc2217' }), 250);

    await transport.connect();
    assert.equal(transport.getState(), 'ready');
    assert.equal(transport.getCapabilities().degraded, true);
    assert.match(transport.getCapabilities().degradedReason || '', /optional settings|SUPPRESS-GO-AHEAD/);

    transport.disconnect();
    await waitForEvent(transport, 'close');
  });
}

async function testRfc2217ConnectionManagerAndScriptFlow() {
  await withTempDatabase('serialhub-rfc2217-workflow-', async () => {
    const { runMigrations } = require('../dist/config/migrations.js');
    const { getDatabase } = require('../dist/config/database.js');
    runMigrations();

    await withTcpServer((socket) => {
      const { TelnetParser } = require('../dist/services/protocols/telnet/TelnetParser.js');
      const {
        TELNET_DO,
        TELNET_WILL,
      } = require('../dist/services/protocols/telnet/TelnetConstants.js');
      const {
        TELNET_OPTION_BINARY,
        TELNET_OPTION_COM_PORT,
        TELNET_OPTION_SUPPRESS_GO_AHEAD,
        encodeRfc2217Subnegotiation,
        encodeTelnetNegotiation,
        getExpectedServerCommand,
        RFC2217_SET_MODEMSTATE_MASK,
      } = require('../dist/services/protocols/rfc2217/Rfc2217Constants.js');

      const parser = new TelnetParser();

      parser.on('command', ({ command, option }) => {
        if (command === TELNET_DO || command === TELNET_WILL) {
          socket.write(encodeTelnetNegotiation(command, option));
        }
      });

      parser.on('subnegotiation', ({ option, payload }) => {
        if (option !== TELNET_OPTION_COM_PORT || payload.length === 0) {
          return;
        }
        const command = payload[0];
        const value = payload.subarray(1);
        socket.write(encodeRfc2217Subnegotiation(getExpectedServerCommand(command), value));
        if (command === RFC2217_SET_MODEMSTATE_MASK) {
          socket.write(Buffer.from('READY'));
        }
      });

      parser.on('data', (data) => {
        socket.write(Buffer.from(`RESP:${data.toString('utf-8')}`));
      });

      socket.on('data', (data) => parser.push(data));

      setImmediate(() => {
        socket.write(encodeTelnetNegotiation(TELNET_WILL, TELNET_OPTION_BINARY));
        socket.write(encodeTelnetNegotiation(TELNET_WILL, TELNET_OPTION_SUPPRESS_GO_AHEAD));
        socket.write(encodeTelnetNegotiation(TELNET_WILL, TELNET_OPTION_COM_PORT));
        socket.write(encodeTelnetNegotiation(TELNET_DO, TELNET_OPTION_BINARY));
        socket.write(encodeTelnetNegotiation(TELNET_DO, TELNET_OPTION_SUPPRESS_GO_AHEAD));
        socket.write(encodeTelnetNegotiation(TELNET_DO, TELNET_OPTION_COM_PORT));
      });
    }, async (port) => {
      const db = getDatabase();
      const nodeId = seedNode(db, port, { connectionType: 'rfc2217' });
      const scriptId = seedScript(db, nodeId, {
        commandsJson: JSON.stringify(['PING']),
      });

      const { ScriptService } = require('../dist/services/ScriptService.js');
      const { SerialConnectionManager, connectionEvents } = require('../dist/services/SerialConnectionManager.js');
      const service = new ScriptService();
      const manager = SerialConnectionManager.getInstance();
      const readyState = waitForEvent(connectionEvents, 'state', (event) => event.nodeId === nodeId && event.state === 'ready');

      const runId = await service.runScript(scriptId, nodeId, 1);
      await readyState;
      assert.equal(manager.getState(nodeId), 'ready');

      for (let attempt = 0; attempt < 30; attempt += 1) {
        const run = service.getRun(runId);
        if (run?.status === 'completed') {
          const result = service.getRunLog(runId);
          assert.ok(result);
          assert.match(result.output, /> PING/);
          assert.match(result.output, /RESP:PING/);
          connectionEvents.removeAllListeners();
          return;
        }
        if (run?.status === 'failed' || run?.status === 'cancelled') {
          throw new Error(`RFC2217 script run ended unexpectedly with status ${run.status}`);
        }
        await sleep(100);
      }

      throw new Error('RFC2217 script execution did not complete in time');
    });
  });
}

async function testSubscribeBeforeConnectDoesNotBlockConnectionCreation() {
  await withTempDatabase('serialhub-manager-test-', async () => {
    const { runMigrations } = require('../dist/config/migrations.js');
    const { getDatabase } = require('../dist/config/database.js');
    runMigrations();

    await withTcpServer((socket) => {
      socket.on('data', (data) => socket.write(Buffer.concat([Buffer.from('ACK:'), data])));
    }, async (port) => {
      const nodeId = seedNode(getDatabase(), port);
      const { SerialConnectionManager, connectionEvents } = require('../dist/services/SerialConnectionManager.js');
      const manager = SerialConnectionManager.getInstance();

      manager.subscribe(nodeId, 'socket-before-connect');
      assert.equal(manager.getState(nodeId), 'disconnected');

      const connected = waitForEvent(connectionEvents, 'state', (event) => event.nodeId === nodeId && event.state === 'connected');
      await manager.openConnection(nodeId);
      await connected;
      assert.equal(manager.getState(nodeId), 'connected');

      manager.closeConnection(nodeId);
      connectionEvents.removeAllListeners();
    });
  });
}

async function testSerialConnectionManagerStateTransitions() {
  await withTempDatabase('serialhub-manager-state-', async () => {
    const { runMigrations } = require('../dist/config/migrations.js');
    const { getDatabase } = require('../dist/config/database.js');
    runMigrations();

    await withTcpServer((_socket) => {}, async (port) => {
      const nodeId = seedNode(getDatabase(), port);
      const { SerialConnectionManager, connectionEvents } = require('../dist/services/SerialConnectionManager.js');
      const manager = SerialConnectionManager.getInstance();
      const states = [];
      const handler = (event) => {
        if (event.nodeId === nodeId) {
          states.push(event.state);
        }
      };
      connectionEvents.on('state', handler);

      await manager.openConnection(nodeId);
      await sleep(50);
      manager.closeConnection(nodeId);
      await sleep(50);

      connectionEvents.off('state', handler);
      assert.deepEqual(states.slice(0, 3), ['connecting', 'connected', 'disconnected']);
    });
  });
}

async function testRawTcpTerminalWorkflow() {
  await withTempDatabase('serialhub-terminal-workflow-', async () => {
    const { runMigrations } = require('../dist/config/migrations.js');
    const { getDatabase } = require('../dist/config/database.js');
    runMigrations();

    await withTcpServer((socket) => {
      socket.on('data', (data) => socket.write(Buffer.concat([Buffer.from('TERM:'), data])));
    }, async (port) => {
      const nodeId = seedNode(getDatabase(), port);
      const { SerialConnectionManager, connectionEvents } = require('../dist/services/SerialConnectionManager.js');
      const { TerminalSessionService } = require('../dist/services/TerminalSessionService.js');
      const manager = SerialConnectionManager.getInstance();
      const sessions = new TerminalSessionService();

      const session = sessions.acquire(nodeId, 1, 'controller-a');
      manager.subscribe(nodeId, 'socket-1');
      await manager.openConnection(nodeId);
      manager.write(nodeId, 'show version\n');

      const payload = await waitForEvent(
        connectionEvents,
        'data',
        (event) => event.nodeId === nodeId && event.data.toString('utf-8').startsWith('TERM:')
      );

      assert.equal(session.nodeId, nodeId);
      assert.equal(payload.data.toString('utf-8'), 'TERM:show version\n');

      sessions.release('controller-a', 'closed');
      manager.unsubscribe(nodeId, 'socket-1');
      manager.closeConnection(nodeId);
      connectionEvents.removeAllListeners();
    });
  });
}

async function testScriptExecutionWithRawTcpNode() {
  await withTempDatabase('serialhub-script-workflow-', async () => {
    const { runMigrations } = require('../dist/config/migrations.js');
    const { getDatabase } = require('../dist/config/database.js');
    runMigrations();

    await withTcpServer((socket) => {
      socket.on('data', (data) => {
        socket.write(Buffer.from(`RESP:${data.toString('utf-8')}`));
      });
    }, async (port) => {
      const db = getDatabase();
      const nodeId = seedNode(db, port);
      const scriptId = seedScript(db, nodeId, {
        commandsJson: JSON.stringify(['PING']),
      });

      const { ScriptService } = require('../dist/services/ScriptService.js');
      const service = new ScriptService();
      const runId = await service.runScript(scriptId, nodeId, 1);

      for (let attempt = 0; attempt < 30; attempt += 1) {
        const run = service.getRun(runId);
        if (run?.status === 'completed') {
          const result = service.getRunLog(runId);
          assert.ok(result);
          assert.match(result.output, /> PING/);
          assert.match(result.output, /RESP:PING/);
          return;
        }
        if (run?.status === 'failed' || run?.status === 'cancelled') {
          throw new Error(`Script run ended unexpectedly with status ${run.status}`);
        }
        await sleep(100);
      }

      throw new Error('Script execution did not complete in time');
    });
  });
}

async function testUnauthorizedSocketCannotUnsubscribeTerminal() {
  await withTempDatabase('serialhub-terminal-unsubscribe-', async () => {
    const { runMigrations } = require('../dist/config/migrations.js');
    const { TerminalSessionService } = require('../dist/services/TerminalSessionService.js');
    runMigrations();

    const service = new TerminalSessionService();
    service.acquire(1, 1, 'controller-a');
    service.bindSocket('controller-a', 'socket-1');

    assert.equal(service.releaseIfControlledBySocket('controller-a', 'socket-2', 'closed'), false);
    assert.ok(service.getActiveByController('controller-a'));

    assert.equal(service.releaseIfControlledBySocket('controller-a', 'socket-1', 'closed'), true);
    assert.equal(service.getActiveByController('controller-a'), undefined);
  });
}

async function testNodeOwnershipScoping() {
  await withTempDatabase('serialhub-tenant-nodes-', async () => {
    const { runMigrations } = require('../dist/config/migrations.js');
    const { getDatabase } = require('../dist/config/database.js');
    const { SerialNodeService } = require('../dist/services/SerialNodeService.js');
    runMigrations();

    const db = getDatabase();
    const ownerA = seedUser(db, { email: 'owner-a@serialhub.local', name: 'Owner A' });
    const ownerB = seedUser(db, { email: 'owner-b@serialhub.local', name: 'Owner B' });
    const nodeA = Number(seedNode(db, 2501, { name: 'Owner A Node', ownerUserId: ownerA }));
    const nodeB = Number(seedNode(db, 2502, { name: 'Owner B Node', ownerUserId: ownerB }));

    const service = new SerialNodeService();
    const ownerANodes = service.listForOwner(ownerA);
    assert.equal(ownerANodes.length, 1);
    assert.equal(ownerANodes[0].id, nodeA);
    assert.equal(service.getForOwner(nodeA, ownerA)?.ownerUserId, ownerA);
    assert.equal(service.getForOwner(nodeB, ownerA), undefined);
  });
}

async function testScriptExecutionRejectsCrossTenantNode() {
  await withTempDatabase('serialhub-tenant-script-', async () => {
    const { runMigrations } = require('../dist/config/migrations.js');
    const { getDatabase } = require('../dist/config/database.js');
    const { ScriptService } = require('../dist/services/ScriptService.js');
    runMigrations();

    const db = getDatabase();
    const ownerA = seedUser(db, { email: 'script-owner@serialhub.local', name: 'Script Owner' });
    const ownerB = seedUser(db, { email: 'node-owner@serialhub.local', name: 'Node Owner' });
    const nodeId = Number(seedNode(db, 2503, { name: 'Foreign Node', ownerUserId: ownerB }));
    const scriptId = Number(seedScript(db, nodeId, { name: 'Tenant Script', ownerUserId: ownerA }));

    const service = new ScriptService();
    await assert.rejects(() => service.runScript(scriptId, nodeId, ownerA), /different owners/);
  });
}

async function testAIObserversAndCopilotRejectForeignNodes() {
  await withTempDatabase('serialhub-tenant-ai-read-', async () => {
    const { runMigrations } = require('../dist/config/migrations.js');
    const { getDatabase } = require('../dist/config/database.js');
    const { AIObserverService } = require('../dist/services/AIObserverService.js');
    const { AICopilotService } = require('../dist/services/AICopilotService.js');
    runMigrations();

    const db = getDatabase();
    const ownerA = seedUser(db, { email: 'observer-owner@serialhub.local', name: 'Observer Owner' });
    const ownerB = seedUser(db, { email: 'foreign-owner@serialhub.local', name: 'Foreign Owner' });
    const foreignNodeId = Number(seedNode(db, 2504, { name: 'Foreign Node', ownerUserId: ownerB }));

    const observerService = AIObserverService.getInstance();
    const observer = observerService.createObserver({
      name: 'Scoped Observer',
      endpoint: 'ws://localhost:4050',
      ownerUserId: ownerA,
    });

    assert.throws(() => {
      observerService.storeObservation(observer, 'observer-socket-tenant', 'result', {
        nodeId: foreignNodeId,
        content: 'Should not be stored',
      });
    }, /cannot access this node/);

    const copilotService = AICopilotService.getInstance();
    const result = copilotService.handleToolCall(observer, 'copilot-socket-tenant', 'req-tenant', {
      tool: 'node.info',
      nodeId: foreignNodeId,
    });
    assert.equal(result.ok, false);
    assert.match(result.error, /Node not found/);
  });
}

async function testAIAutomationRejectsForeignNodeActions() {
  await withTempDatabase('serialhub-tenant-ai-automation-', async () => {
    const { runMigrations } = require('../dist/config/migrations.js');
    const { getDatabase } = require('../dist/config/database.js');
    const { AIAutomationService } = require('../dist/services/AIAutomationService.js');
    const { AIObserverService } = require('../dist/services/AIObserverService.js');
    runMigrations();

    const db = getDatabase();
    const ownerA = seedUser(db, { email: 'automation-owner@serialhub.local', name: 'Automation Owner' });
    const ownerB = seedUser(db, { email: 'automation-foreign@serialhub.local', name: 'Automation Foreign' });
    const foreignNodeId = Number(seedNode(db, 2505, { name: 'Foreign Automation Node', ownerUserId: ownerB }));
    const terminalSessionId = Number(
      db
        .prepare(
          `INSERT INTO terminalSessions
           (nodeId, userId, status, controllerKey, startedAt, heartbeatAt)
           VALUES (?, ?, 'active', ?, datetime('now'), datetime('now'))`
        )
        .run(foreignNodeId, ownerA, 'tenant-automation-session').lastInsertRowid
    );

    const observer = AIObserverService.getInstance().createObserver({
      name: 'Scoped Automation Agent',
      endpoint: 'ws://localhost:4060',
      ownerUserId: ownerA,
    });

    const service = AIAutomationService.getInstance();
    const fakeSocket = {
      id: 'automation-tenant-socket',
      emit() {},
    };

    service.registerSocket(observer, fakeSocket);
    service.enableTerminalSession({ terminalSessionId, nodeId: foreignNodeId, userId: ownerA });

    await assert.rejects(
      () =>
        service.proposeAction(observer, fakeSocket.id, {
          terminalSessionId,
          nodeId: foreignNodeId,
          tool: 'node.info',
          arguments: {},
        }),
      /cannot access this node/
    );
  });
}

async function testAIAutomationPendingActionCannotExecuteAfterSessionStop() {
  await withTempDatabase('serialhub-ai-automation-stop-', async () => {
    const { runMigrations } = require('../dist/config/migrations.js');
    const { getDatabase } = require('../dist/config/database.js');
    const { AIAutomationService } = require('../dist/services/AIAutomationService.js');
    const { AIObserverService } = require('../dist/services/AIObserverService.js');
    runMigrations();

    const db = getDatabase();
    const nodeId = Number(seedNode(db, 2601, { name: 'Approval Node', ownerUserId: 1 }));
    const terminalSessionId = Number(
      db
        .prepare(
          `INSERT INTO terminalSessions
           (nodeId, userId, status, controllerKey, controllingSocketId, startedAt, heartbeatAt)
           VALUES (?, ?, 'active', ?, ?, datetime('now'), datetime('now'))`
        )
        .run(nodeId, 1, 'approval-session', 'approval-ui-socket').lastInsertRowid
    );

    const observer = AIObserverService.getInstance().createObserver({
      name: 'Approval Automation Agent',
      endpoint: 'ws://localhost:4070',
      ownerUserId: 1,
    });

    const service = AIAutomationService.getInstance();
    const fakeSocket = {
      id: 'approval-agent-socket',
      emit() {},
    };

    service.registerSocket(observer, fakeSocket);
    service.enableTerminalSession({ terminalSessionId, nodeId, userId: 1 });

    const proposed = await service.proposeAction(observer, fakeSocket.id, {
      terminalSessionId,
      nodeId,
      tool: 'serial.write',
      arguments: { data: 'status\r\n' },
    });

    assert.equal(proposed.action.status, 'pending_approval');

    service.disableTerminalSession({
      terminalSessionId,
      nodeId,
      userId: 1,
      reason: 'stopped_for_test',
    });

    await assert.rejects(() => service.approveAction(proposed.action.id, 1), /AI automation session is no longer active/);

    const actions = service.listActions(nodeId, 1, 10);
    const cancelled = actions.find((action) => action.id === proposed.action.id);
    assert.ok(cancelled);
    assert.equal(cancelled.status, 'failed');
    assert.equal(cancelled.result.cancelled, true);
  });
}

async function testAIObserverServicePassiveForwardingAndStorage() {
  await withTempDatabase('serialhub-ai-observer-', async () => {
    const { runMigrations } = require('../dist/config/migrations.js');
    const { getDatabase } = require('../dist/config/database.js');
    const { AIObserverService } = require('../dist/services/AIObserverService.js');
    const { connectionEvents } = require('../dist/services/SerialConnectionManager.js');
    runMigrations();
    const db = getDatabase();
    const nodeId = Number(seedNode(db, 2300, { name: 'AI Node' }));
    const terminalSessionId = Number(
      db
        .prepare(
          `INSERT INTO terminalSessions
           (nodeId, userId, status, controllerKey, startedAt, heartbeatAt)
           VALUES (?, ?, 'active', ?, datetime('now'), datetime('now'))`
        )
        .run(nodeId, 1, 'ai-terminal-session').lastInsertRowid
    );

    const service = AIObserverService.getInstance();
    const observer = service.createObserver({
      name: 'Inspector',
      endpoint: 'ws://localhost:4010',
      ownerUserId: 1,
    });

    const emitted = [];
    const fakeSocket = {
      id: 'observer-socket-1',
      emit(event, payload) {
        emitted.push({ event, payload });
      },
    };

    service.registerSocket(observer, fakeSocket);
    service.startTerminalSession({
      terminalSessionId,
      nodeId,
      userId: 1,
    });

    connectionEvents.emit('data', { nodeId, data: Buffer.from('ALARM') });

    const serialDataEvent = emitted.find((entry) => entry.event === 'serial.data');
    assert.ok(serialDataEvent);
    assert.equal(serialDataEvent.payload.nodeId, nodeId);
    assert.equal(Buffer.from(serialDataEvent.payload.payloadBase64, 'base64').toString('utf-8'), 'ALARM');

    service.storeObservation(observer, fakeSocket.id, 'result', {
      nodeId,
      terminalSessionId,
      severity: 'warning',
      title: 'Alarm detected',
      content: 'Potential boot-loop marker detected in serial output.',
      rawPayload: { matched: 'ALARM' },
    });

    const observations = service.listObservations(nodeId, 1, 10);
    assert.equal(observations.length, 1);
    assert.equal(observations[0].observationType, 'result');
    assert.equal(observations[0].severity, 'warning');
    assert.match(observations[0].content, /boot-loop/i);

    service.endTerminalSession({ terminalSessionId, nodeId, reason: 'closed' });
    assert.ok(emitted.find((entry) => entry.event === 'session.started'));
    assert.ok(emitted.find((entry) => entry.event === 'session.ended'));
  });
}

async function testAICopilotServiceSuggestionsAndReadOnlyTools() {
  await withTempDatabase('serialhub-ai-copilot-', async () => {
    const { runMigrations } = require('../dist/config/migrations.js');
    const { getDatabase } = require('../dist/config/database.js');
    const { AICopilotService } = require('../dist/services/AICopilotService.js');
    const { connectionEvents } = require('../dist/services/SerialConnectionManager.js');
    runMigrations();
    const db = getDatabase();
    const nodeId = Number(seedNode(db, 2400, { name: 'Copilot Node' }));
    const scriptId = Number(seedScript(db, nodeId, { name: 'Recovery Script' }));
    const terminalSessionId = Number(
      db
        .prepare(
          `INSERT INTO terminalSessions
           (nodeId, userId, status, controllerKey, startedAt, heartbeatAt)
           VALUES (?, ?, 'active', ?, datetime('now'), datetime('now'))`
        )
        .run(nodeId, 1, 'copilot-terminal-session').lastInsertRowid
    );

    const { AIObserverService } = require('../dist/services/AIObserverService.js');
    const observer = AIObserverService.getInstance().createObserver({
      name: 'Copilot Agent',
      endpoint: 'ws://localhost:4020',
      ownerUserId: 1,
    });

    const service = AICopilotService.getInstance();
    const emitted = [];
    const fakeSocket = {
      id: 'copilot-socket-1',
      emit(event, payload) {
        emitted.push({ event, payload });
      },
    };

    service.registerSocket(observer, fakeSocket);
    service.startTerminalSession({ terminalSessionId, nodeId, userId: 1 });
    connectionEvents.emit('data', { nodeId, data: Buffer.from('BOOT> ') });
    connectionEvents.emit('data', { nodeId, data: Buffer.from('waiting for input') });

    const serialDataEvent = emitted.find((entry) => entry.event === 'serial.data');
    assert.ok(serialDataEvent);
    assert.equal(serialDataEvent.payload.nodeId, nodeId);

    const snapshotResult = service.handleToolCall(observer, fakeSocket.id, 'req-1', {
      tool: 'terminal.snapshot',
      nodeId,
      limit: 5,
    });
    assert.equal(snapshotResult.ok, true);
    assert.equal(snapshotResult.data.nodeId, nodeId);
    assert.match(snapshotResult.data.textPreview, /waiting for input/);

    const nodeInfoResult = service.handleToolCall(observer, fakeSocket.id, 'req-2', {
      tool: 'node.info',
      nodeId,
    });
    assert.equal(nodeInfoResult.ok, true);
    assert.equal(nodeInfoResult.data.id, nodeId);
    assert.equal(nodeInfoResult.data.name, 'Copilot Node');

    const scriptListResult = service.handleToolCall(observer, fakeSocket.id, 'req-3', {
      tool: 'script.list',
      nodeId,
    });
    assert.equal(scriptListResult.ok, true);
    assert.ok(scriptListResult.data.some((script) => script.id === scriptId));

    service.storeSuggestion(observer, fakeSocket.id, 'suggestion', {
      nodeId,
      terminalSessionId,
      summary: 'Device may be waiting in a boot prompt.',
      hypotheses: [{ label: 'boot_prompt', confidence: 0.82 }],
      suggestedActions: [
        { type: 'serial_command', command: 'reboot', reason: 'Prompt suggests maintenance mode.' },
        { type: 'script', scriptId, scriptName: 'Recovery Script', reason: 'Known recovery path for this prompt.' },
      ],
      rawPayload: { source: 'test' },
    });

    const suggestions = service.listSuggestions(nodeId, 1, 10);
    assert.equal(suggestions.length, 1);
    assert.match(suggestions[0].summary, /boot prompt/i);
    assert.match(suggestions[0].suggestedActionsJson, /Recovery Script/);

    service.endTerminalSession({ terminalSessionId, nodeId, reason: 'closed' });
    assert.ok(emitted.find((entry) => entry.event === 'session.started'));
    assert.ok(emitted.find((entry) => entry.event === 'session.ended'));
  });
}

async function testAIAutomationApprovalFlowAndAudit() {
  await withTempDatabase('serialhub-ai-automation-', async () => {
    const { runMigrations } = require('../dist/config/migrations.js');
    const { getDatabase } = require('../dist/config/database.js');
    const { AIAutomationService } = require('../dist/services/AIAutomationService.js');
    const { AIObserverService } = require('../dist/services/AIObserverService.js');
    const { SerialConnectionManager, connectionEvents } = require('../dist/services/SerialConnectionManager.js');
    runMigrations();

    await withTcpServer((socket) => {
      socket.on('data', (data) => {
        socket.write(Buffer.from(`ACK:${data.toString('utf-8')}`));
      });
    }, async (port) => {
      const db = getDatabase();
      const nodeId = Number(seedNode(db, port, { name: 'Automation Node' }));
      const scriptId = Number(seedScript(db, nodeId, { name: 'AI Recovery' }));
      const terminalSessionId = Number(
        db
          .prepare(
            `INSERT INTO terminalSessions
             (nodeId, userId, status, controllerKey, startedAt, heartbeatAt)
             VALUES (?, ?, 'active', ?, datetime('now'), datetime('now'))`
          )
          .run(nodeId, 1, 'automation-terminal-session').lastInsertRowid
      );

      const observer = AIObserverService.getInstance().createObserver({
        name: 'Automation Agent',
        endpoint: 'ws://localhost:4030',
        ownerUserId: 1,
      });

      const service = AIAutomationService.getInstance();
      const emitted = [];
      const fakeSocket = {
        id: 'automation-socket-1',
        emit(event, payload) {
          emitted.push({ event, payload });
        },
      };

      service.registerSocket(observer, fakeSocket);
      const enabled = service.enableTerminalSession({ terminalSessionId, nodeId, userId: 1 });
      assert.equal(enabled.enabled, true);
      assert.equal(enabled.observerCount, 1);

      const manager = SerialConnectionManager.getInstance();
      manager.subscribe(nodeId, 'automation-ui-socket');
      await manager.openConnection(nodeId);

      const readResult = await service.proposeAction(observer, fakeSocket.id, {
        terminalSessionId,
        nodeId,
        tool: 'node.info',
        arguments: {},
      });
      assert.equal(readResult.action.status, 'executed');
      assert.equal(readResult.result.id, nodeId);

      const proposedWrite = await service.proposeAction(observer, fakeSocket.id, {
        terminalSessionId,
        nodeId,
        tool: 'serial.write',
        arguments: { data: 'AT+STATUS\r\n' },
      });
      assert.equal(proposedWrite.action.status, 'pending_approval');

      const ackEvent = waitForEvent(
        connectionEvents,
        'data',
        (event) => event.nodeId === nodeId && event.data.toString('utf-8').includes('ACK:AT+STATUS')
      );
      const approved = await service.approveAction(proposedWrite.action.id, 1);
      assert.equal(approved.action.status, 'executed');
      assert.match((await ackEvent).data.toString('utf-8'), /ACK:AT\+STATUS/);

      const suggestedScript = await service.proposeAction(observer, fakeSocket.id, {
        terminalSessionId,
        nodeId,
        tool: 'script.run',
        arguments: { scriptId },
      });
      assert.equal(suggestedScript.action.status, 'pending_approval');

      const rejected = service.rejectAction(suggestedScript.action.id, 1);
      assert.equal(rejected.status, 'rejected');

      const actions = service.listActions(nodeId, 1, 10);
      assert.ok(actions.some((action) => action.toolName === 'serial.write' && action.status === 'executed'));
      assert.ok(actions.some((action) => action.toolName === 'script.run' && action.status === 'rejected'));

      const stopped = service.disableTerminalSession({ terminalSessionId, nodeId, userId: 1, reason: 'test_complete' });
      assert.equal(stopped.enabled, false);
      assert.ok(emitted.find((entry) => entry.event === 'session.started'));

      manager.unsubscribe(nodeId, 'automation-ui-socket');
      manager.closeConnection(nodeId);
      connectionEvents.removeAllListeners();
    });
  });
}

(async () => {
  try {
    await testTerminalSessionService();
    await testStartupTerminalSessionRecovery();
    await testSQLiteSessionStore();
    testLocalAuthCannotRunInProduction();
    testTelnetParserPlainAsciiAndBinaryData();
    testTelnetParserIacEscaping();
    testTelnetParserNegotiationCommands();
    testTelnetParserSubnegotiationAndPartialFrames();
    testTelnetParserSubnegotiationEscapedIac();
    await testRawTcpTransportLifecycle();
    await testRawTcpTransportStripsTelnetControlSequences();
    await testRfc2217TransportNegotiationAndDataFlow();
    await testRfc2217TransportStatusNotifications();
    await testRfc2217TransportPartialServerDegradesCleanly();
    await testSubscribeBeforeConnectDoesNotBlockConnectionCreation();
    await testSerialConnectionManagerStateTransitions();
    await testRawTcpTerminalWorkflow();
    await testUnauthorizedSocketCannotUnsubscribeTerminal();
    await testScriptExecutionWithRawTcpNode();
    await testNodeOwnershipScoping();
    await testScriptExecutionRejectsCrossTenantNode();
    await testRfc2217ConnectionManagerAndScriptFlow();
    await testAIObserversAndCopilotRejectForeignNodes();
    await testAIObserverServicePassiveForwardingAndStorage();
    await testAICopilotServiceSuggestionsAndReadOnlyTools();
    await testAIAutomationApprovalFlowAndAudit();
    await testAIAutomationRejectsForeignNodeActions();
    await testAIAutomationPendingActionCannotExecuteAfterSessionStop();
    console.log('All backend checks passed');
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();
