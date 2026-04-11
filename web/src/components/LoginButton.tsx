'use client';

import { signIn, signOut, useSession } from 'next-auth/react';

export default function LoginButton() {
  const { data: session } = useSession();

  if (session) {
    return (
      <button
        onClick={() => signOut()}
        className="btn"
        style={{ backgroundColor: 'var(--surface-active)', color: 'var(--foreground)' }}
      >
        Sign Out
      </button>
    );
  }

  return (
    <button onClick={() => signIn('strava')} className="btn btn-primary">
      Connect with Strava
    </button>
  );
}
