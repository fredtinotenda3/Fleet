
// app/(protected)/expenses/[id]/page.tsx

import { ExpenseDetailPage } from '@/frontend/modules/expenses/pages/ExpenseDetailPage';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  return <ExpenseDetailPage expenseId={id} />;
}