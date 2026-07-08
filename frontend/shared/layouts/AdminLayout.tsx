// frontend/shared/layouts/AdminLayout.tsx
//
// Role-flavored entry point on top of DashboardLayout. Distinct layout
// components are kept (rather than one generic layout) so future
// role-specific chrome (e.g. an admin-only top banner) has an obvious
// home without touching the shared shell.

'use client';

import * as React from 'react';
import { DashboardLayout } from './DashboardLayout';

export function AdminLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
