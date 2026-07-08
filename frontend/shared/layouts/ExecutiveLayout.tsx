
// frontend/shared/layouts/ExecutiveLayout.tsx

'use client';

import * as React from 'react';
import { DashboardLayout } from './DashboardLayout';

export function ExecutiveLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}