// frontend/shared/layouts/DriverLayout.tsx

'use client';

import * as React from 'react';
import { DashboardLayout } from './DashboardLayout';

export function DriverLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}