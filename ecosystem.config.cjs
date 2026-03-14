module.exports = {
  apps: [
    {
      name: 'serialhub-backend',
      cwd: './packages/backend',
      script: './dist/server.js',
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'serialhub-frontend',
      cwd: './packages/frontend/.next/standalone',
      script: './server.js',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
        HOSTNAME: '0.0.0.0',
      },
    },
  ],
};
