// frontend/shared/pwa/ServiceWorkerRegister.tsx
'use client';

import * as React from 'react';

export function ServiceWorkerRegister() {
  React.useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    let cancelled = false;

    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        if (cancelled) return;
        // Progressive enhancement: browsers supporting Background Sync
        // get a wake-up call even when no tab is open; browsers that
        // don't (Safari/iOS) still work fine via the 'online' listener
        // and periodic flush in frontend/modules/dvir/lib/sync.ts.
        const reg = registration as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } };
        reg.sync?.register('dvir-sync').catch(() => {});
      })
      .catch(() => {
        // Service workers are a progressive enhancement here (install
        // + offline shell); a registration failure shouldn't surface
        // as an error to the driver, who can still use the app online.
      });

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'DVIR_FLUSH_QUEUE') {
        import('@/frontend/modules/dvir/lib/sync').then(({ flushQueue }) => void flushQueue());
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener('message', onMessage);
    };
  }, []);

  return null;
}
