 "use client";

import React, { useState } from 'react';

export default function LoginPage() {
  const [email, setEmail] = useState('master@serialhub.local');
  const [password, setPassword] = useState('master123456');
  const [error, setError] = useState('');

  const loginWithPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: 'Login failed' }));
      setError(data.error || 'Login failed');
      return;
    }

    window.location.href = '/dashboard';
  };

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-4 rounded-lg bg-panel p-6">
        <h1 className="text-2xl">SerialHub Login</h1>
        <form className="space-y-3" onSubmit={loginWithPassword}>
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded bg-bg px-3 py-2"
            placeholder="Email"
            type="email"
          />
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded bg-bg px-3 py-2"
            placeholder="Password"
            type="password"
          />
          {error ? <div className="text-sm text-red-400">{error}</div> : null}
          <button className="w-full rounded bg-blue-600 px-4 py-2 text-white" type="submit">
            Sign in with Master Account
          </button>
        </form>
        <div className="text-center text-sm text-gray-400">or</div>
        <a
          href="/api/auth/google"
          className="block rounded bg-slate-700 px-4 py-2 text-center text-white"
        >
          Sign in with Google
        </a>
      </div>
    </div>
  );
}
