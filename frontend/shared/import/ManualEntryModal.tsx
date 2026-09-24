// frontend/shared/import/ManualEntryModal.tsx
//
// Companion to ImportModal.tsx for entering ONE row by hand instead of
// uploading a file -- e.g. Olivine typing in a single 3rd Party
// delivery rather than waiting for the next spreadsheet batch.
//
// Deliberately NOT a separate write path: a submitted row is sent
// through the exact same `onImport(records, fileName)` contract
// ImportModal's file-upload flow already uses, as a one-row batch. The
// backend places no minimum on `rows.length` (see
// TransportCostController.handleImport -- `rows.length === 0` is
// rejected, one row is not), so this reaches the same command handler,
// the same duplicate-detection check, and the same Phase O2
// normalization-review queue a spreadsheet row would. Concretely: type
// in a registration and transporter name that don't already resolve to
// a confirmed ContractedVehicle/TransportPartner, and the row still
// lands in the review queue for a human decision -- it does NOT get
// silently created, exactly like OLIVINE_DATA_IMPORT_GUIDE.md's "never
// created directly" rule for those two collections. This form does not,
// and must not, bypass that pipeline; it only skips the file/CSV step.
//
// Field coercion reuses ImportModal's own `coerceValue` (exported for
// this purpose) so a typed-in value is parsed identically to a parsed
// spreadsheet cell -- one rule, not two that could drift apart.

'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/frontend/shared/ui/feedback/dialog';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Input } from '@/frontend/shared/ui/forms/input';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Checkbox } from '@/frontend/shared/ui/forms/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/shared/ui/forms/select';
import { Spinner } from '@/frontend/shared/ui/feedback/spinner';
import { coerceValue, type ImportColumnDef, type ImportResponse } from './ImportModal';

interface ManualEntryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  columns: ImportColumnDef[];
  /** Same contract ImportModal's file path uses -- a one-row `records` array here. */
  onImport: (records: Array<Record<string, unknown>>, fileName: string) => Promise<ImportResponse>;
  onImportComplete?: (response: ImportResponse) => void;
  /** Stored as this record's sourceFileName/provenance. Defaults to "Manual entry". */
  sourceLabel?: string;
}

type Stage = 'form' | 'submitting' | 'result';

function emptyValues(columns: ImportColumnDef[]): Record<string, string> {
  const out: Record<string, string> = {};
  columns.forEach((c) => {
    out[c.key] = '';
  });
  return out;
}

export function ManualEntryModal({
  open,
  onOpenChange,
  title,
  description,
  columns,
  onImport,
  onImportComplete,
  sourceLabel = 'Manual entry',
}: ManualEntryModalProps) {
  const [stage, setStage] = useState<Stage>('form');
  const [values, setValues] = useState<Record<string, string>>(() => emptyValues(columns));
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [response, setResponse] = useState<ImportResponse | null>(null);

  const requiredColumns = useMemo(() => columns.filter((c) => c.required), [columns]);
  const missingRequired = useMemo(
    () => requiredColumns.filter((c) => !values[c.key] || values[c.key].trim() === ''),
    [requiredColumns, values]
  );

  function reset() {
    setStage('form');
    setValues(emptyValues(columns));
    setSubmitError(null);
    setResponse(null);
  }

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  }

  async function handleSubmit() {
    if (missingRequired.length > 0 || stage === 'submitting') return;
    setStage('submitting');
    setSubmitError(null);

    // rowNumber: 1 -- this is always a one-row batch; there is no
    // header row to offset against, unlike ImportModal's `index + 2`.
    const record: Record<string, unknown> = { rowNumber: 1 };
    columns.forEach((col) => {
      const value = coerceValue(values[col.key] ?? '', col.type);
      if (value !== undefined) record[col.key] = value;
    });

    try {
      const fileName = `${sourceLabel} — ${new Date().toLocaleString()}`;
      const result = await onImport([record], fileName);
      setResponse(result);
      setStage('result');
      onImportComplete?.(result);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Could not save this record.');
      setStage('form');
    }
  }

  const singleResult = response?.results[0];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {stage !== 'result' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {columns.map((col) =>
                col.type === 'boolean' ? (
                  <div key={col.key} className="flex items-center gap-2 pt-6">
                    <Checkbox
                      id={`manual-${col.key}`}
                      checked={values[col.key] === 'true'}
                      onCheckedChange={(checked) =>
                        setValues((v) => ({ ...v, [col.key]: checked ? 'true' : 'false' }))
                      }
                    />
                    <Label htmlFor={`manual-${col.key}`}>{col.label}</Label>
                  </div>
                ) : col.type === 'select' ? (
                  <div key={col.key}>
                    <Label
                      htmlFor={`manual-${col.key}`}
                      className={col.required ? 'form-label form-required' : 'form-label'}
                    >
                      {col.label}
                    </Label>
                    <Select
                      value={values[col.key] || undefined}
                      onValueChange={(value) => setValues((v) => ({ ...v, [col.key]: value ?? '' }))}
                    >
                      <SelectTrigger id={`manual-${col.key}`} className="w-full">
                        <SelectValue placeholder={col.example ?? 'Select…'} />
                      </SelectTrigger>
                      <SelectContent>
                        {(col.options ?? []).map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div key={col.key}>
                    <Label
                      htmlFor={`manual-${col.key}`}
                      className={col.required ? 'form-label form-required' : 'form-label'}
                    >
                      {col.label}
                    </Label>
                    <Input
                      id={`manual-${col.key}`}
                      type={col.type === 'number' ? 'number' : 'text'}
                      step={col.type === 'number' ? 'any' : undefined}
                      placeholder={col.example}
                      value={values[col.key] ?? ''}
                      onChange={(e) => setValues((v) => ({ ...v, [col.key]: e.target.value }))}
                    />
                  </div>
                )
              )}
            </div>

            {submitError && (
              <div className="flex items-start gap-2 p-3 border rounded-md border-destructive/30 bg-destructive/5 text-body-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{submitError}</span>
              </div>
            )}

            <p className="text-caption text-muted-foreground">
              This goes through the same validation and normalization review as a file import &mdash; a transporter
              or vehicle that isn&apos;t already confirmed still lands in the review queue rather than being created
              silently.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleClose(false)}
                disabled={stage === 'submitting'}
              >
                Cancel
              </Button>
              <Button type="button" onClick={handleSubmit} disabled={stage === 'submitting' || missingRequired.length > 0}>
                {stage === 'submitting' && <Spinner className="w-4 h-4 mr-2" />}
                Save record
              </Button>
            </div>
          </div>
        )}

        {stage === 'result' && singleResult && (
          <div className="space-y-4">
            {singleResult.success ? (
              <div className="flex items-center gap-2 p-3 border rounded-md border-success/40 bg-success-bg text-body-sm text-success">
                <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                Saved{singleResult.identifier ? ` — ${singleResult.identifier}` : ''}.
              </div>
            ) : (
              <div className="flex items-start gap-2 p-3 border rounded-md border-destructive/30 bg-destructive/5 text-body-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  {singleResult.error ?? 'This record was not saved.'}
                  {singleResult.suggestedFix ? ` ${singleResult.suggestedFix}` : ''}
                </span>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={reset}>
                Enter another
              </Button>
              <Button onClick={() => handleClose(false)}>Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
