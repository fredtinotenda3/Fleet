// frontend/modules/organizations/components/advanced/InvoiceHistoryTable.tsx
'use client';

import { Download } from 'lucide-react';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { useInvoices } from '../../hooks/useAdvancedSettings';
import type { Invoice } from '../../types/advanced.types';

const STATUS_VARIANT: Record<Invoice['status'], 'default' | 'outline' | 'destructive'> = {
  paid: 'default',
  open: 'outline',
  void: 'outline',
  uncollectible: 'destructive',
};

export function InvoiceHistoryTable() {
  const { data: invoices = [], isLoading } = useInvoices();

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-12 skeleton" />
        ))}
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="p-8 surface-card">
        <EmptyState title="No invoices yet" description="Invoices will appear here after your first billing cycle." />
      </div>
    );
  }

  return (
    <table className="table-enterprise">
      <thead>
        <tr>
          <th scope="col">Invoice</th>
          <th scope="col">Issued</th>
          <th scope="col">Amount</th>
          <th scope="col">Status</th>
          <th scope="col" className="text-right">
            Download
          </th>
        </tr>
      </thead>
      <tbody>
        {invoices.map((invoice) => (
          <tr key={invoice._id}>
            <td className="font-medium text-foreground">{invoice.number}</td>
            <td className="text-caption text-muted-foreground">
              {new Date(invoice.issuedAt).toLocaleDateString()}
            </td>
            <td>{formatCurrency(invoice.amount, { currency: invoice.currency })}</td>
            <td>
              <Badge variant={STATUS_VARIANT[invoice.status]} className="capitalize">
                {invoice.status}
              </Badge>
            </td>
            <td className="text-right">
              {invoice.pdfUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  render={<a href={invoice.pdfUrl} target="_blank" rel="noopener noreferrer" />}
                  aria-label={`Download invoice ${invoice.number}`}
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}