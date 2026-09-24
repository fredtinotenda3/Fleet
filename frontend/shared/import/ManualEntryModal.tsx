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
//
// OLIVINE LIVE OPERATING MODEL, SLICE 2 (item 6/7). `lineColumns` is an
// optional, additive prop: when a caller supplies it, a repeatable
// "Load / Consignment Lines" section renders below the ordinary
// (parent) fields, with an "Add another line" control -- see
// TransportCostImportPage's THIRD_PARTY_LINE_COLUMNS for the only
// current caller. When omitted (every other caller, and every OTHER
// sheet family's 3rd-Party-shaped siblings -- Vansales/Swift/Depot STO
// all still pass no lineColumns), this component's rendering and submit
// behaviour are byte-for-byte what they were before this prop existed.
//
// The submitted shape mirrors ThirdPartyImportRow.lines exactly (see
// that type's own doc comment): a fully-blank line is dropped before
// submit rather than sent and rejected server-side, so leaving the
// single default line untouched and submitting produces `lines: []` --
// which ImportTransportCostHandler.resolveLines treats as "no explicit
// lines", falling back to the ordinary single-line-from-scalar-fields
// path this form already used pre-Slice-2. This is deliberate: it is
// what keeps "type in a minimal 3rd Party row with no lines filled in"
// working exactly as it did before, rather than becoming a new
// validation error the moment this prop was added.

'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Plus, Trash2 } from 'lucide-react';
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
import { SearchCreateSelect } from '@/frontend/shared/ui/forms/SearchCreateSelect';
import { coerceValue, type ImportColumnDef, type ImportResponse } from './ImportModal';

interface ManualEntryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** Parent-level fields -- rendered exactly as before this prop's sibling below existed. */
  columns: ImportColumnDef[];
  /**
   * OLIVINE LIVE OPERATING MODEL, SLICE 2 (item 6/7). Optional,
   * additive: when present, renders a repeatable set of these columns
   * as one or more "Load / Consignment Lines" -- see this file's header
   * comment for the full contract, including why a wholly-blank line is
   * dropped rather than submitted.
   */
  lineColumns?: ImportColumnDef[];
  /** Heading for the repeatable section. Defaults to "Load / Consignment Lines". */
  lineSectionLabel?: string;
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

/** True when every field in a line's typed-in values is blank -- the
 *  client-side mirror of ImportTransportCostHandler.isBlankLine, used
 *  to decide whether a line is dropped before submit (see this file's
 *  header comment). */
function isBlankLineValues(values: Record<string, string>): boolean {
  return Object.values(values).every((v) => v.trim() === '');
}

/**
 * One field's input control, keyed off `col.type` exactly like the
 * inline ternary this replaces (boolean -> checkbox, select -> closed
 * dropdown, everything else -> text/number input). Pulled out to a
 * standalone component so both the parent-field grid and each
 * repeatable line's grid render fields identically, rather than two
 * copies of the same three-way branch that could drift apart.
 */
function FieldInput({
  col,
  value,
  onChange,
  idPrefix,
}: {
  col: ImportColumnDef;
  value: string;
  onChange: (value: string) => void;
  idPrefix: string;
}) {
  const id = `${idPrefix}-${col.key}`;

  if (col.type === 'boolean') {
    return (
      <div className="flex items-center gap-2 pt-6">
        <Checkbox
          id={id}
          checked={value === 'true'}
          onCheckedChange={(checked) => onChange(checked ? 'true' : 'false')}
        />
        <Label htmlFor={id}>{col.label}</Label>
      </div>
    );
  }

  if (col.type === 'search-select') {
    // OLIVINE LIVE OPERATING MODEL, SLICE 3. `searchSelect` is required
    // for this type (see ImportColumnDef's own doc comment); if a caller
    // ever forgets it, degrade to the plain text input below rather than
    // throwing, since a manual-entry form should never hard-crash on a
    // config mistake mid-typing.
    if (col.searchSelect) {
      return (
        <SearchCreateSelect
          id={id}
          label={col.label}
          required={col.required}
          placeholder={col.example ? `e.g. ${col.example}` : 'Search…'}
          value={value}
          onChange={onChange}
          search={col.searchSelect.search}
          onCreateNew={col.searchSelect.onCreateNew}
          createLabel={col.searchSelect.createLabel}
        />
      );
    }
  }

  if (col.type === 'select') {
    return (
      <div>
        <Label htmlFor={id} className={col.required ? 'form-label form-required' : 'form-label'}>
          {col.label}
        </Label>
        <Select value={value || undefined} onValueChange={(v) => onChange(v ?? '')}>
          <SelectTrigger id={id} className="w-full">
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
    );
  }

  return (
    <div>
      <Label htmlFor={id} className={col.required ? 'form-label form-required' : 'form-label'}>
        {col.label}
      </Label>
      <Input
        id={id}
        type={col.type === 'number' ? 'number' : 'text'}
        step={col.type === 'number' ? 'any' : undefined}
        placeholder={col.example}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function ManualEntryModal({
  open,
  onOpenChange,
  title,
  description,
  columns,
  lineColumns,
  lineSectionLabel = 'Load / Consignment Lines',
  onImport,
  onImportComplete,
  sourceLabel = 'Manual entry',
}: ManualEntryModalProps) {
  const [stage, setStage] = useState<Stage>('form');
  const [values, setValues] = useState<Record<string, string>>(() => emptyValues(columns));
  // One entry per load/consignment line. Always starts with exactly one
  // (empty) line so the section never renders looking broken -- an
  // untouched line is dropped at submit time (see isBlankLineValues).
  const [lineValues, setLineValues] = useState<Array<Record<string, string>>>(() =>
    lineColumns ? [emptyValues(lineColumns)] : []
  );
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
    setLineValues(lineColumns ? [emptyValues(lineColumns)] : []);
    setSubmitError(null);
    setResponse(null);
  }

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  }

  function addLine() {
    if (!lineColumns) return;
    setLineValues((rows) => [...rows, emptyValues(lineColumns)]);
  }

  function removeLine(index: number) {
    setLineValues((rows) => rows.filter((_, i) => i !== index));
  }

  function updateLine(index: number, key: string, value: string) {
    setLineValues((rows) => rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
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

    // See this file's header comment: a wholly-blank line is dropped
    // BEFORE submit, never sent and rejected. `record.lines` is always
    // set (to `[]` when every line was blank or none was added) so an
    // untouched line-less submission takes ImportTransportCostHandler.
    // resolveLines' "no explicit lines" fallback path -- the same
    // single-line-from-scalar-fields behaviour this form had before
    // lineColumns existed.
    if (lineColumns) {
      const builtLines = lineValues
        .filter((row) => !isBlankLineValues(row))
        .map((row) => {
          const line: Record<string, unknown> = {};
          lineColumns.forEach((col) => {
            const value = coerceValue(row[col.key] ?? '', col.type);
            if (value !== undefined) line[col.key] = value;
          });
          return line;
        });
      record.lines = builtLines;
    }

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
              {columns.map((col) => (
                <FieldInput
                  key={col.key}
                  col={col}
                  value={values[col.key] ?? ''}
                  onChange={(value) => setValues((v) => ({ ...v, [col.key]: value }))}
                  idPrefix="manual"
                />
              ))}
            </div>

            {lineColumns && lineColumns.length > 0 && (
              <div className="space-y-3 rounded-md border border-border p-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-body-sm text-foreground">{lineSectionLabel}</p>
                  <span className="text-caption text-muted-foreground">
                    One transport operation &middot; {lineValues.length} line{lineValues.length === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="space-y-3">
                  {lineValues.map((row, index) => (
                    <div key={index} className="rounded-md border border-border/60 bg-muted/30 p-3">
                      <div className="flex items-center justify-between pb-2">
                        <p className="text-caption font-medium text-muted-foreground">Line {index + 1}</p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeLine(index)}
                          disabled={lineValues.length <= 1}
                          title={
                            lineValues.length <= 1
                              ? 'At least one line stays on the form -- leave it blank to save this as a single-line record.'
                              : 'Remove this line'
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {lineColumns.map((col) => (
                          <FieldInput
                            key={col.key}
                            col={col}
                            value={row[col.key] ?? ''}
                            onChange={(value) => updateLine(index, col.key, value)}
                            idPrefix={`manual-line-${index}`}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <Button type="button" variant="outline" size="sm" onClick={addLine}>
                  <Plus className="h-3.5 w-3.5" />
                  Add another line
                </Button>

                <p className="text-caption text-muted-foreground">
                  One truck, driver, and cost &mdash; but it can carry more than one invoice or consignment. Add a
                  line for each; the total cost above is never multiplied by the number of lines.
                </p>
              </div>
            )}

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
