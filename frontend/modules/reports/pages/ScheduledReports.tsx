// frontend/modules/reports/pages/ScheduledReports.tsx
//
// Entry point for /reports/scheduled. A "scheduled report" is just a saved
// ReportDefinition with its `schedule` field populated (see the comment
// atop hooks/useScheduledReports.ts) - this page lists every saved report
// that has a schedule, and lets the user create a new schedule against any
// saved report, edit/pause/resume an existing one, or remove it entirely.

'use client';

import { useMemo, useState } from 'react';
import { Plus, Pause, Play, Trash2, Clock } from 'lucide-react';
import { useScheduledReports } from '../hooks/useScheduledReports';
import { useSavedReports } from '../hooks/useSavedReports';
import { ScheduleFormDialog, type ScheduleFormDialogReportOption } from '../components/ScheduleFormDialog';
import type { ScheduleConfigForm } from '../schemas/scheduleConfig';
import { LoadingState } from '@/shared/ui/feedback/LoadingState';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';

interface ScheduledReportLike {
  id: string;
  name: string;
  schedule?: { cron?: string; timezone?: string; recipients?: string[]; enabled?: boolean };
}

export default function ScheduledReports() {
  const {
    scheduledReports,
    describeSchedule,
    isLoading,
    isError,
    saveSchedule,
    isSaving,
    pause,
    resume,
    removeSchedule,
  } = useScheduledReports();
  const { reports } = useSavedReports();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingReportId, setEditingReportId] = useState<string | undefined>(undefined);
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
  const [pendingToggleId, setPendingToggleId] = useState<string | null>(null);

  const typedSchedules = scheduledReports as unknown as ScheduledReportLike[];

  const reportOptions: ScheduleFormDialogReportOption[] = useMemo(
    () => reports.map((r) => ({ id: r.id, name: r.name })),
    [reports],
  );

  function openNewSchedule() {
    setEditingReportId(undefined);
    setDialogOpen(true);
  }

  function openEditSchedule(reportId: string) {
    setEditingReportId(reportId);
    setDialogOpen(true);
  }

  async function handleSave(reportId: string, form: ScheduleConfigForm) {
    await saveSchedule({ reportId, form });
    setDialogOpen(false);
  }

  async function handleToggle(report: ScheduledReportLike) {
    setPendingToggleId(report.id);
    try {
      if (report.schedule?.enabled === false) {
        await resume(report.id);
      } else {
        await pause(report.id);
      }
    } finally {
      setPendingToggleId(null);
    }
  }

  if (isLoading) {
    return <LoadingState />;
  }

  if (isError) {
    return <EmptyState title="Couldn't load scheduled reports" description="Please try again." />;
  }

  const editingReport = editingReportId ? typedSchedules.find((r) => r.id === editingReportId) : undefined;
  const editingInitial: Partial<ScheduleConfigForm> | undefined = editingReport?.schedule
    ? {
        reportDefinitionId: editingReport.id,
        recipients: editingReport.schedule.recipients ?? [],
        timezone: editingReport.schedule.timezone ?? 'UTC',
        isActive: editingReport.schedule.enabled ?? true,
      }
    : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Scheduled Reports</h1>
          <p className="text-sm text-muted-foreground">
            Automatically generate and deliver reports on a recurring schedule.
          </p>
        </div>
        <button
          type="button"
          onClick={openNewSchedule}
          disabled={reportOptions.length === 0}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          title={reportOptions.length === 0 ? 'Save a report first to schedule it' : undefined}
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          New schedule
        </button>
      </div>

      {typedSchedules.length === 0 ? (
        <EmptyState
          title="No scheduled reports yet"
          description={
            reportOptions.length === 0
              ? 'Save a report in the Report Builder first, then schedule it here.'
              : 'Schedule a saved report to have it generated and delivered automatically.'
          }
          action={reportOptions.length > 0 ? { label: 'New schedule', onClick: openNewSchedule } : undefined}
        />
      ) : (
        <ul className="border divide-y rounded-md">
          {typedSchedules.map((report) => {
            const isPaused = report.schedule?.enabled === false;
            return (
              <li key={report.id} className="flex items-center gap-3 px-4 py-3">
                <Clock className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{report.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {describeSchedule(report)}
                    {isPaused && ' \u00b7 Paused'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openEditSchedule(report.id)}
                  className="px-2.5 py-1.5 text-xs font-medium border rounded-md hover:bg-accent"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleToggle(report)}
                  disabled={pendingToggleId === report.id}
                  className="rounded-md p-1.5 hover:bg-accent disabled:opacity-50"
                  aria-label={isPaused ? 'Resume schedule' : 'Pause schedule'}
                  title={isPaused ? 'Resume schedule' : 'Pause schedule'}
                >
                  {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => setPendingRemoveId(report.id)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive"
                  aria-label="Remove schedule"
                  title="Remove schedule"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <ScheduleFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        reports={reportOptions}
        lockedReportId={editingReportId}
        initial={editingInitial}
        onSave={handleSave}
        isSaving={isSaving}
      />

      {pendingRemoveId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40">
          <div className="w-full max-w-sm p-5 border rounded-lg shadow-lg bg-background">
            <h2 className="text-base font-semibold">Remove this schedule?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The report itself won&apos;t be deleted &mdash; only its recurring schedule.
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setPendingRemoveId(null)}
                className="px-3 py-2 text-sm font-medium border rounded-md hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await removeSchedule(pendingRemoveId);
                  setPendingRemoveId(null);
                }}
                className="px-3 py-2 text-sm font-medium rounded-md bg-destructive text-destructive-foreground"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}