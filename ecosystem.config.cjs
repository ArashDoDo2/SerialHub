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
        SERIALHUB_INTERNAL_FRONTEND_PORT: '3100',
        SERIALHUB_BACKEND_TARGET: 'http://127.0.0.1:3001',
      },
    },
  ],
};
