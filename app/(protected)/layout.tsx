// app/(protected)/layout.tsx

import type { ReactNode } from 'react';
import { DashboardLayout } from '@/frontend/shared/layouts/DashboardLayout';

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}