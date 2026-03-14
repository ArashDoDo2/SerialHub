module.exports = {
  apps: [
    {
      name: 'serialhub-backend',
      cwd: './packages/backend',
      script: './dist/server.js',
    },
    {
      name: 'serialhub-frontend',
      cwd: '.',
      script: './scripts/start-frontend-standalone.cjs',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
        HOSTNAME: '0.0.0.0',
      },
    },
  ],
};
