// frontend/modules/auth/components/SessionsList.tsx

'use client';

import { useEffect } from 'react';
import { useSessions } from '../hooks/useSessions';
import { Button } from '@/frontend/shared/ui/primitives/button';

export function SessionsList() {
  const { sessions, isLoading, error, refresh, revoke, revokeOthers } = useSessions();

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-medium">Active sessions</h3>
        <Button type="button" variant="outline" size="sm" onClick={() => revokeOthers()}>
          Sign out other devices
        </Button>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
      {isLoading && sessions.length === 0 && <p className="text-sm text-muted-foreground">Loading sessions...</p>}

      <ul className="divide-y rounded border">
        {sessions.map((session) => (
          <li key={session._id} className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-medium">
                {session.deviceLabel || 'Unknown device'} {session.isCurrent && <span className="text-xs text-green-600">(this device)</span>}
              </p>
              <p className="text-xs text-muted-foreground">
                {session.ipAddress || 'Unknown IP'} &middot; last active {new Date(session.lastActiveAt).toLocaleString()}
              </p>
            </div>
            {!session.isCurrent && (
              <Button type="button" variant="ghost" size="sm" onClick={() => revoke(session._id)}>
                Revoke
              </Button>
            )}
          </li>
        ))}
        {!isLoading && sessions.length === 0 && (
          <li className="p-4 text-sm text-muted-foreground">No active sessions found.</li>
        )}
      </ul>
    </div>
  );
}