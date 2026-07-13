// frontend/modules/reports/utils/scheduleParser.ts
//
// The backend's cron-engine.service.ts (via report-scheduler.service.ts)
// takes a standard 5-field cron expression. The UI exposes friendlier
// frequency/day/time pickers (see schemas/scheduleConfig.ts) - this module
// is the two-way bridge between the two.

import type { ScheduleConfigForm, ScheduleFrequency } from '../schemas/scheduleConfig';

function parseTime(timeOfDay: string): { hour: number; minute: number } {
  const [hour, minute] = timeOfDay.split(':').map(Number);
  return { hour: hour ?? 6, minute: minute ?? 0 };
}

/** Builds a standard 5-field cron expression from the friendly form fields. */
export function buildCronExpression(form: ScheduleConfigForm): string {
  if (form.frequency === 'custom' && form.cron) return form.cron;

  const { hour, minute } = parseTime(form.timeOfDay);

  switch (form.frequency as Exclude<ScheduleFrequency, 'custom'>) {
    case 'daily':
      return `${minute} ${hour} * * *`;
    case 'weekly':
      return `${minute} ${hour} * * ${form.dayOfWeek ?? 1}`;
    case 'monthly':
      return `${minute} ${hour} ${form.dayOfMonth ?? 1} * *`;
    case 'quarterly':
      return `${minute} ${hour} ${form.dayOfMonth ?? 1} 1,4,7,10 *`;
    case 'yearly':
      return `${minute} ${hour} ${form.dayOfMonth ?? 1} 1 *`;
    default:
      return `${minute} ${hour} * * *`;
  }
}

const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Human-readable summary of a schedule, e.g. "Monthly on the 1st at 06:00 UTC". */
export function describeSchedule(form: ScheduleConfigForm): string {
  const time = `${form.timeOfDay} ${form.timezone}`;
  switch (form.frequency) {
    case 'daily':
      return `Daily at ${time}`;
    case 'weekly':
      return `Weekly on ${WEEKDAY_LABELS[form.dayOfWeek ?? 1]} at ${time}`;
    case 'monthly':
      return `Monthly on day ${form.dayOfMonth ?? 1} at ${time}`;
    case 'quarterly':
      return `Quarterly on day ${form.dayOfMonth ?? 1} at ${time}`;
    case 'yearly':
      return `Yearly on Jan ${form.dayOfMonth ?? 1} at ${time}`;
    case 'custom':
      return `Custom schedule (${form.cron})`;
    default:
      return 'Not scheduled';
  }
}

/** Basic structural validation so obviously malformed cron never reaches the API. */
export function isValidCronExpression(expression: string): boolean {
  const fields = expression.trim().split(/\s+/);
  return fields.length === 5;
}