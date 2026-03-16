const fs = require('fs');
const http = require('http');
const https = require('https');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

const repoDir = path.resolve(__dirname, '..');
const primaryServer = path.join(repoDir, 'packages', 'frontend', '.next', 'standalone', 'server.js');
const monorepoServer = path.join(
  repoDir,
  'packages',
  'frontend',
  '.next',
  'standalone',
  'packages',
  'frontend',
  'server.js'
);

const serverPath = fs.existsSync(primaryServer) ? primaryServer : fs.existsSync(monorepoServer) ? monorepoServer : null;

if (!serverPath) {
  console.error('No standalone frontend server.js was found. Build the frontend first.');
  process.exit(1);
}

const publicHost = process.env.HOSTNAME || '0.0.0.0';
const publicPort = Number(process.env.PORT || 3000);
const internalFrontendPortBase = Number(process.env.SERIALHUB_INTERNAL_FRONTEND_PORT || 3100);
const backendTarget = new URL(process.env.SERIALHUB_BACKEND_TARGET || 'http://127.0.0.1:3001');
const childPidFile = path.join(repoDir, 'packages', 'frontend', '.next', 'standalone', '.serialhub-frontend-child.pid');

let frontendTarget;
let child;

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readTrackedChildPid() {
  if (!fs.existsSync(childPidFile)) {
    return null;
  }

  const rawPid = fs.readFileSync(childPidFile, 'utf8').trim();
  const pid = Number(rawPid);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function removeTrackedChildPid() {
  if (fs.existsSync(childPidFile)) {
    fs.rmSync(childPidFile, { force: true });
  }
}

async function stopTrackedChildIfPresent() {
  const trackedPid = readTrackedChildPid();
  if (!trackedPid) {
    return;
  }

  if (!isProcessAlive(trackedPid)) {
    removeTrackedChildPid();
    return;
  }

  process.kill(trackedPid, 'SIGTERM');

  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (!isProcessAlive(trackedPid)) {
      removeTrackedChildPid();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  process.kill(trackedPid, 'SIGKILL');
  removeTrackedChildPid();
}

function findAvailablePort(startPort, host) {
  return new Promise((resolve, reject) => {
    const tryPort = (port) => {
      const tester = net.createServer();
      tester.unref();
      tester.once('error', (error) => {
        if (error && error.code === 'EADDRINUSE') {
          tryPort(port + 1);
          return;
        }
        reject(error);
      });
      tester.once('listening', () => {
        tester.close(() => resolve(port));
      });
      tester.listen(port, host);
    };

    tryPort(startPort);
  });
}

function isBackendPath(requestUrl = '/') {
  try {
    const pathname = new URL(requestUrl, 'http://serialhub.local').pathname;
    return (
      pathname === '/api' ||
      pathname.startsWith('/api/') ||
      pathname === '/socket.io' ||
      pathname.startsWith('/socket.io/')
    );
  } catch {
    return requestUrl === '/api' || requestUrl.startsWith('/api/') || requestUrl === '/socket.io' || requestUrl.startsWith('/socket.io/');
  }
}

function pickTarget(requestUrl = '/') {
  if (isBackendPath(requestUrl)) {
    return backendTarget;
  }

  return frontendTarget;
}

function proxyHttpRequest(clientReq, clientRes) {
  const target = pickTarget(clientReq.url);
  const transport = target.protocol === 'https:' ? https : http;

  const proxyReq = transport.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      method: clientReq.method,
      path: clientReq.url,
      headers: {
        ...clientReq.headers,
        host: target.host,
      },
    },
    (proxyRes) => {
      clientRes.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(clientRes);
    }
  );

  proxyReq.on('error', (error) => {
    if (!clientRes.headersSent) {
      clientRes.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    }
    clientRes.end(`Proxy request failed: ${error.message}`);
  });

  clientReq.pipe(proxyReq);
}

function proxyUpgradeRequest(request, socket, head) {
  const target = pickTarget(request.url);
  const targetPort = Number(target.port || (target.protocol === 'https:' ? 443 : 80));
  const upstream = net.connect(targetPort, target.hostname, () => {
    let headerBlock = `${request.method} ${request.url} HTTP/${request.httpVersion}\r\n`;
    for (let index = 0; index < request.rawHeaders.length; index += 2) {
      const headerName = request.rawHeaders[index];
      const headerValue = request.rawHeaders[index + 1];
      if (headerName.toLowerCase() === 'host') {
        continue;
      }
      headerBlock += `${headerName}: ${headerValue}\r\n`;
    }
    headerBlock += `Host: ${target.host}\r\n\r\n`;

    upstream.write(headerBlock);
    if (head.length > 0) {
      upstream.write(head);
    }

    socket.pipe(upstream).pipe(socket);
  });

  upstream.on('error', () => {
    socket.destroy();
  });
}

const proxyServer = http.createServer(proxyHttpRequest);

proxyServer.on('upgrade', proxyUpgradeRequest);

proxyServer.on('clientError', (error, socket) => {
  socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  console.error(`Standalone frontend proxy client error: ${error.message}`);
});

let shuttingDown = false;

function shutdown(signal = 'SIGTERM') {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  proxyServer.close(() => {
    if (child && !child.killed) {
      child.kill(signal);
    }
    removeTrackedChildPid();
  });
}

async function main() {
  await stopTrackedChildIfPresent();

  const selectedInternalPort = await findAvailablePort(internalFrontendPortBase, '127.0.0.1');
  frontendTarget = new URL(`http://127.0.0.1:${selectedInternalPort}`);

  child = spawn(process.execPath, [serverPath], {
    stdio: 'inherit',
    cwd: path.dirname(serverPath),
    env: {
      ...process.env,
      HOSTNAME: '127.0.0.1',
      PORT: String(selectedInternalPort),
    },
  });

  fs.writeFileSync(childPidFile, `${child.pid}\n`, 'utf8');

  child.on('exit', (code, signal) => {
    removeTrackedChildPid();
    if (shuttingDown) {
      process.exit(code ?? 0);
      return;
    }
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });

  child.on('error', (error) => {
    removeTrackedChildPid();
    console.error(`Failed to start standalone frontend server: ${error.message}`);
    process.exit(1);
  });

  proxyServer.listen(publicPort, publicHost, () => {
    console.log(
      `SerialHub standalone gateway listening on http://${publicHost}:${publicPort} (frontend -> ${frontendTarget.href}, backend -> ${backendTarget.href})`
    );
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    shutdown(signal);
  });
}

process.on('exit', () => {
  removeTrackedChildPid();
});

main().catch((error) => {
  console.error(`Failed to start standalone frontend gateway: ${error.message}`);
  process.exit(1);
});
