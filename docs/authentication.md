# Authentication and Authorization

SerialHub uses Passport.js, session cookies, and owner-scoped authorization.

## Supported Login Modes

### Google OAuth

Google OAuth remains the primary login path for normal environments.

Required backend environment variables:

```env
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3001/api/auth/google/callback
SESSION_SECRET=a_secure_random_string
```

Routes:

- `GET /api/auth/google`
- `GET /api/auth/google/callback`
- `GET /api/auth/google/failure`

### Development-Only Local Auth

For local testing, backend also supports `POST /api/auth/login`.

Required environment variables:

```env
LOCAL_AUTH_ENABLED=true
LOCAL_AUTH_EMAIL=master@serialhub.local
LOCAL_AUTH_PASSWORD=master123456
LOCAL_AUTH_NAME=Local Master
```

This mode is only valid in `NODE_ENV=development`. Startup fails if `LOCAL_AUTH_ENABLED=true` in production.

## Session Model

- sessions are managed with `express-session`
- session data is stored in SQLite
- the current user is available through `req.user`
- `GET /api/auth/me` returns the active user or `401`
- `POST /api/auth/logout` logs out and destroys the server-side session

## Authorization Model

SerialHub uses:

- `user`
- `admin`

Most resource access is owner-scoped:

- normal users can access only their own nodes, scripts, runs, and AI resources
- admins can access all resources

## WebSocket Auth

Socket.IO connections reuse the authenticated HTTP session. Event handlers then perform per-event authorization before subscribing, reading, writing, or stopping terminal sessions.

## Notes

- local auth is for development only
- the backend enforces same-origin checks for state-changing requests
- multi-tenant scoping applies to REST routes and Socket.IO event handlers
