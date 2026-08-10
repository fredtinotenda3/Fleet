// frontend/modules/dvir/components/OfflineQueueBadge.tsx
'use client';

import * as React from 'react';
import { CloudOff, RefreshCw } from 'lucide-react';
import { subscribePendingCount, flushQueue } from '../lib/sync';
import { cn } from '@/lib/utils';

export function OfflineQueueBadge() {
  const [pending, setPending] = React.useState(0);
  const [online, setOnline] = React.useState(true);
  const [syncing, setSyncing] = React.useState(false);

  React.useEffect(() => {
    setOnline(navigator.onLine);
    const unsubscribe = subscribePendingCount(setPending);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      unsubscribe();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  if (pending === 0 && online) return null;

  return (
    <button
      type="button"
      onClick={async () => {
        if (!online) return;
        setSyncing(true);
        await flushQueue();
        setSyncing(false);
      }}
      className={cn(
        'flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium',
        online ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : 'bg-muted text-muted-foreground'
      )}
    >
      {syncing ? <RefreshCw className="size-3.5 animate-spin" /> : <CloudOff className="size-3.5" />}
      {online
        ? pending > 0
          ? `${pending} inspection${pending === 1 ? '' : 's'} syncing`
          : 'Synced'
        : `Offline${pending > 0 ? ` \u00b7 ${pending} queued` : ''}`}
    </button>
  );
}
