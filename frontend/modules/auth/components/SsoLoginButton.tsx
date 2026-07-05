// frontend/modules/auth/components/SsoLoginButton.tsx

'use client';

import { useState } from 'react';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Input } from '@/frontend/shared/ui/forms/input';
import { authApi } from '../services/auth.api';

/**
 * Pre-login SSO discovery: the user types their work email, we check
 * app/api/auth/sso/discover for an active connection matching the
 * domain, and if found redirect into the org's SSO flow. Falls back to
 * a friendly message when no connection exists for that domain.
 */
export function SsoLoginButton() {
  const [email, setEmail] = useState('');
  const [checking, setChecking] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const handleCheck = async () => {
    if (!email.includes('@')) return;
    setChecking(true);
    setNotFound(false);
    try {
      const result = await authApi.discoverSso(email);
      if (result.ssoAvailable && result.connectionId) {
        window.location.href = `/api/auth/signin/sso?connectionId=${result.connectionId}`;
      } else {
        setNotFound(true);
      }
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          type="email"
          placeholder="Continue with your work email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button type="button" variant="outline" onClick={handleCheck} disabled={checking}>
          {checking ? 'Checking...' : 'SSO'}
        </Button>
      </div>
      {notFound && (
        <p className="text-xs text-muted-foreground">
          No SSO connection found for that domain. Sign in with your email and password instead.
        </p>
      )}
    </div>
  );
}