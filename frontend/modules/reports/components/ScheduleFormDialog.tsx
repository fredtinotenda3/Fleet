// frontend/modules/reports/components/ScheduleFormDialog.tsx
//
// Create/edit form for a report's `schedule` field. Saves go through
// useScheduledReports().saveSchedule, which writes to the same
// ReportDefinition the report builder edits (see the comment atop
// hooks/useScheduledReports.ts) - there is no separate "schedule" entity.

'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import {
  scheduleConfigSchema,
  defaultScheduleConfig,
  SCHEDULE_FREQUENCIES,
  DELIVERY_METHODS,
  type ScheduleConfigForm,
  type ScheduleFrequency,
  type DeliveryMethod,
} from '../schemas/scheduleConfig';
import { EXPORT_FORMATS, EXPORT_FORMAT_LABELS, type ExportFormat } from '../schemas/exportConfig';

const FREQUENCY_LABELS: Record<ScheduleFrequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
  custom: 'Custom (cron)',
};

const DELIVERY_LABELS: Record<DeliveryMethod, string> = {
  email: 'Email',
  download: 'Download only',
};

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface ScheduleFormDialogReportOption {
  id: string;
  name: string;
}

interface ScheduleFormDialogProps {
  open: boolean;
  onClose: () => void;
  reports: ScheduleFormDialogReportOption[];
  /** Locks the report picker to a single report (edit flow). */
  lockedReportId?: string;
  initial?: Partial<ScheduleConfigForm>;
  onSave: (reportId: string, form: ScheduleConfigForm) => Promise<unknown>;
  isSaving?: boolean;
}

type DraftState = Partial<ScheduleConfigForm> & { reportDefinitionId?: string; recipientsInput?: string };

function toDraft(initial: Partial<ScheduleConfigForm> | undefined, lockedReportId?: string): DraftState {
  return {
    ...defaultScheduleConfig,
    ...initial,
    reportDefinitionId: lockedReportId ?? initial?.reportDefinitionId ?? '',
    recipientsInput: (initial?.recipients ?? []).join(', '),
  };
}

export function ScheduleFormDialog({
  open,
  onClose,
  reports,
  lockedReportId,
  initial,
  onSave,
  isSaving = false,
}: ScheduleFormDialogProps) {
  const [draft, setDraft] = useState<DraftState>(() => toDraft(initial, lockedReportId));
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setDraft(toDraft(initial, lockedReportId));
      setErrors({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lockedReportId]);

  if (!open) return null;

  function update(patch: Partial<DraftState>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const recipients = (draft.recipientsInput ?? '')
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);

    const candidate = {
      reportDefinitionId: draft.reportDefinitionId,
      frequency: draft.frequency,
      cron: draft.cron,
      timeOfDay: draft.timeOfDay,
      dayOfWeek: draft.dayOfWeek,
      dayOfMonth: draft.dayOfMonth,
      timezone: draft.timezone,
      format: draft.format,
      deliveryMethod: draft.deliveryMethod,
      recipients,
      isActive: draft.isActive,
    };

    const result = scheduleConfigSchema.safeParse(candidate);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        const key = issue.path[0]?.toString() ?? 'form';
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    await onSave(result.data.reportDefinitionId, result.data);
  }

  const frequency = (draft.frequency ?? 'monthly') as ScheduleFrequency;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-lg border rounded-lg shadow-lg bg-background">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-base font-semibold">{lockedReportId ? 'Edit schedule' : 'New schedule'}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-md text-muted-foreground hover:bg-muted"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="max-h-[75vh] space-y-4 overflow-y-auto px-5 py-4">
          <div>
            <label htmlFor="schedule-report" className="block mb-1 text-sm font-medium">
              Report
            </label>
            <select
              id="schedule-report"
              value={draft.reportDefinitionId ?? ''}
              disabled={!!lockedReportId}
              onChange={(e) => update({ reportDefinitionId: e.target.value })}
              className="w-full px-3 py-2 text-sm border rounded-md bg-background disabled:opacity-60"
            >
              <option value="" disabled>
                Choose a report…
              </option>
              {reports.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            {errors.reportDefinitionId && <p className="mt-1 text-xs text-destructive">{errors.reportDefinitionId}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="schedule-frequency" className="block mb-1 text-sm font-medium">
                Frequency
              </label>
              <select
                id="schedule-frequency"
                value={frequency}
                onChange={(e) => update({ frequency: e.target.value as ScheduleFrequency })}
                className="w-full px-3 py-2 text-sm border rounded-md bg-background"
              >
                {SCHEDULE_FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {FREQUENCY_LABELS[f]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="schedule-time" className="block mb-1 text-sm font-medium">
                Time of day
              </label>
              <input
                id="schedule-time"
                type="time"
                value={draft.timeOfDay ?? '06:00'}
                onChange={(e) => update({ timeOfDay: e.target.value })}
                className="w-full px-3 py-2 text-sm border rounded-md bg-background"
              />
              {errors.timeOfDay && <p className="mt-1 text-xs text-destructive">{errors.timeOfDay}</p>}
            </div>
          </div>

          {frequency === 'weekly' && (
            <div>
              <label htmlFor="schedule-dow" className="block mb-1 text-sm font-medium">
                Day of week
              </label>
              <select
                id="schedule-dow"
                value={draft.dayOfWeek ?? 1}
                onChange={(e) => update({ dayOfWeek: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm border rounded-md bg-background"
              >
                {WEEKDAYS.map((label, idx) => (
                  <option key={label} value={idx}>
                    {label}
                  </option>
                ))}
              </select>
              {errors.dayOfWeek && <p className="mt-1 text-xs text-destructive">{errors.dayOfWeek}</p>}
            </div>
          )}

          {(frequency === 'monthly' || frequency === 'quarterly' || frequency === 'yearly') && (
            <div>
              <label htmlFor="schedule-dom" className="block mb-1 text-sm font-medium">
                Day of month
              </label>
              <input
                id="schedule-dom"
                type="number"
                min={1}
                max={28}
                value={draft.dayOfMonth ?? 1}
                onChange={(e) => update({ dayOfMonth: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm border rounded-md bg-background"
              />
              {errors.dayOfMonth && <p className="mt-1 text-xs text-destructive">{errors.dayOfMonth}</p>}
            </div>
          )}

          {frequency === 'custom' && (
            <div>
              <label htmlFor="schedule-cron" className="block mb-1 text-sm font-medium">
                Cron expression
              </label>
              <input
                id="schedule-cron"
                type="text"
                placeholder="0 6 * * *"
                value={draft.cron ?? ''}
                onChange={(e) => update({ cron: e.target.value })}
                className="w-full px-3 py-2 font-mono text-sm border rounded-md bg-background"
              />
              {errors.cron && <p className="mt-1 text-xs text-destructive">{errors.cron}</p>}
            </div>
          )}

          <div>
            <label htmlFor="schedule-timezone" className="block mb-1 text-sm font-medium">
              Timezone
            </label>
            <input
              id="schedule-timezone"
              type="text"
              placeholder="UTC"
              value={draft.timezone ?? 'UTC'}
              onChange={(e) => update({ timezone: e.target.value })}
              className="w-full px-3 py-2 text-sm border rounded-md bg-background"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="schedule-format" className="block mb-1 text-sm font-medium">
                Format
              </label>
              <select
                id="schedule-format"
                value={draft.format ?? 'excel'}
                onChange={(e) => update({ format: e.target.value as ExportFormat })}
                className="w-full px-3 py-2 text-sm border rounded-md bg-background"
              >
                {EXPORT_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {EXPORT_FORMAT_LABELS[f]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="schedule-delivery" className="block mb-1 text-sm font-medium">
                Delivery
              </label>
              <select
                id="schedule-delivery"
                value={draft.deliveryMethod ?? 'email'}
                onChange={(e) => update({ deliveryMethod: e.target.value as DeliveryMethod })}
                className="w-full px-3 py-2 text-sm border rounded-md bg-background"
              >
                {DELIVERY_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {DELIVERY_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {draft.deliveryMethod !== 'download' && (
            <div>
              <label htmlFor="schedule-recipients" className="block mb-1 text-sm font-medium">
                Recipients (comma separated emails)
              </label>
              <input
                id="schedule-recipients"
                type="text"
                placeholder="ops@company.com, finance@company.com"
                value={draft.recipientsInput ?? ''}
                onChange={(e) => update({ recipientsInput: e.target.value })}
                className="w-full px-3 py-2 text-sm border rounded-md bg-background"
              />
              {errors.recipients && <p className="mt-1 text-xs text-destructive">{errors.recipients}</p>}
            </div>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.isActive ?? true}
              onChange={(e) => update({ isActive: e.target.checked })}
              className="w-4 h-4 border rounded"
            />
            Active
          </label>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium border rounded-md hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {isSaving ? 'Saving…' : 'Save schedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}