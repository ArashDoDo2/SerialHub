const fs = require('fs');
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

const child = spawn(process.execPath, [serverPath], {
  stdio: 'inherit',
  cwd: path.dirname(serverPath),
  env: process.env,
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

