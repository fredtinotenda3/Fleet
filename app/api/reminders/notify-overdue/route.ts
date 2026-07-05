// app/api/reminders/notify-overdue/route.ts

/**
 * GET /api/reminders/notify-overdue
 *
 * Called by Vercel Cron. Delegates entirely to
 * maintenanceCommandService.bulkUpdateOverdue, which now also handles
 * notifying each reminder's assignee — this route no longer needs its
 * own marking/email logic, and can't drift out of sync with
 * /api/reminders/update-status the way the two separate implementations
 * could before.
 */
import { NextResponse } from 'next/server';
import { maintenanceCommandService } from '@/modules/maintenance/services/maintenance-command.service';

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await maintenanceCommandService.bulkUpdateOverdue('system');

    console.log(
      `[notify-overdue] ${result.newlyOverdueCount} reminder(s) newly marked overdue (${result.updatedCount} total status changes).`
    );

    return NextResponse.json({
      message:
        result.newlyOverdueCount > 0
          ? `${result.newlyOverdueCount} reminder(s) marked overdue.`
          : 'No newly overdue reminders.',
      updatedCount: result.updatedCount,
      newlyOverdueCount: result.newlyOverdueCount,
    });
  } catch (error) {
    console.error('[notify-overdue] Error:', error);
    return NextResponse.json(
      { error: 'Failed to process overdue reminders' },
      { status: 500 }
    );
  }
}