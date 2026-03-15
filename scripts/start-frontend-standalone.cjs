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
const internalFrontendPort = Number(process.env.SERIALHUB_INTERNAL_FRONTEND_PORT || 3100);
const backendTarget = new URL(process.env.SERIALHUB_BACKEND_TARGET || 'http://127.0.0.1:3001');
const frontendTarget = new URL(`http://127.0.0.1:${internalFrontendPort}`);

const child = spawn(process.execPath, [serverPath], {
  stdio: 'inherit',
  cwd: path.dirname(serverPath),
  env: {
    ...process.env,
    HOSTNAME: '127.0.0.1',
    PORT: String(internalFrontendPort),
  },
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error(`Failed to start standalone frontend server: ${error.message}`);
  process.exit(1);
});

function pickTarget(requestUrl = '/') {
  if (requestUrl.startsWith('/api/') || requestUrl.startsWith('/socket.io/')) {
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

proxyServer.listen(publicPort, publicHost, () => {
  console.log(
    `SerialHub standalone gateway listening on http://${publicHost}:${publicPort} (frontend -> ${frontendTarget.href}, backend -> ${backendTarget.href})`
  );
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    proxyServer.close(() => {
      child.kill(signal);
    });
  });
}
