// frontend/shared/layouts/ManagerLayout.tsx

'use client';

import * as React from 'react';
import { DashboardLayout } from './DashboardLayout';

export function ManagerLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
