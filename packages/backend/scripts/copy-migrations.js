const fs = require('node:fs');
const path = require('node:path');

const sourceDir = path.resolve(__dirname, '..', 'src', 'migrations');
const targetDir = path.resolve(__dirname, '..', 'dist', 'migrations');

fs.mkdirSync(targetDir, { recursive: true });

for (const file of fs.readdirSync(sourceDir)) {
  if (file.endsWith('.sql')) {
    fs.copyFileSync(path.join(sourceDir, file), path.join(targetDir, file));
  }
}
