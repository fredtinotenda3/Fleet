// frontend/shared/layouts/MechanicLayout.tsx

'use client';

import * as React from 'react';
import { DashboardLayout } from './DashboardLayout';

export function MechanicLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}