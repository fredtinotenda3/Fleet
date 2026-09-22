// frontend/modules/transport-cost/components/VehicleDrillDownDialog.tsx
//
// Phase O4 drill-down: every individual Allocation Ledger posting behind
// one vehicle's total for the selected period, including reversal rows
// -- a corrected row shows as two lines (the reversal and its
// replacement), never as one silently-edited figure, because the
// ledger itself never mutates a posting in place.

'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/frontend/shared/ui/feedback/dialog';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/frontend/shared/ui/data-display/table';
import { formatDate } from '@/shared/utils/date.utils';
import { useTransportCostVehiclePostings } from '../hooks/useTransportCost';
import { formatMoney } from '@/frontend/modules/finance/utils/money.utils';

interface VehicleDrillDownDialogProps {
  contractedVehicleId: string | null;
  periodStart: Date;
  periodEnd: Date;
  onOpenChange: (open: boolean) => void;
}

export function VehicleDrillDownDialog({
  contractedVehicleId,
  periodStart,
  periodEnd,
  onOpenChange,
}: VehicleDrillDownDialogProps) {
  const { data: drilldown, isLoading, isError } = useTransportCostVehiclePostings(
    contractedVehicleId,
    periodStart,
    periodEnd
  );

  return (
    <Dialog open={Boolean(contractedVehicleId)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {drilldown ? `${drilldown.registration} — ${drilldown.transporterName}` : 'Postings'}
          </DialogTitle>
          <DialogDescription>
            {drilldown
              ? `Business stream: ${drilldown.businessStream}. Every Allocation Ledger posting for ${formatDate(
                  periodStart,
                  'MMM yyyy'
                )}, including any reversal.`
              : 'Loading this vehicle’s individual postings for the selected period.'}
          </DialogDescription>
        </DialogHeader>

        {isLoading && <p className="py-8 text-sm text-center text-muted-foreground">Loading&hellip;</p>}
        {isError && (
          <p className="py-8 text-sm text-center text-destructive">
            Couldn&apos;t load postings for this vehicle. Try again.
          </p>
        )}

        {drilldown && !isLoading && !isError && (
          <div className="overflow-x-auto border rounded-md border-border max-h-[60vh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drilldown.postings.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                      No postings for this vehicle in this period.
                    </TableCell>
                  </TableRow>
                )}
                {drilldown.postings.map((posting) => (
                  <TableRow key={posting._id}>
                    {/* periodStart -- the transaction's own date -- not
                        postedAt (audit metadata: when the ledger row was
                        written), which would make every posting from one
                        import run look like it happened on the same day. */}
                    <TableCell>{formatDate(posting.periodStart)}</TableCell>
                    <TableCell className="max-w-[280px] truncate" title={posting.description}>
                      {posting.description ?? '—'}
                    </TableCell>
                    <TableCell
                      className={`text-right font-medium ${posting.amount < 0 ? 'text-warning' : ''}`}
                    >
                      {formatMoney(posting.amount, posting.currency)}
                    </TableCell>
                    <TableCell>
                      {posting.reversalOfPostingId ? (
                        <Badge variant="destructive">Reversal</Badge>
                      ) : (
                        <Badge variant="outline">Posted</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
