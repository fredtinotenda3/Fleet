// app/api/reminders/update-status/route.ts

/**
 * GET /api/reminders/update-status
 *
 * Now backed by the same BulkUpdateOverdueCommand as notify-overdue.
 * Also added the CRON_SECRET check — this endpoint previously had NO
 * authentication at all despite recalculating status across every
 * reminder in the system, which is worth closing while touching this file.
 */
import { NextRequest, NextResponse } from 'next/server';
import { maintenanceCommandService } from '@/modules/maintenance/services/maintenance-command.service';

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await maintenanceCommandService.bulkUpdateOverdue('system');

    return NextResponse.json({
      message: 'Reminder statuses updated successfully.',
      updatedCount: result.updatedCount,
    });
  } catch (error) {
    console.error('Error updating reminder statuses:', error);
    return NextResponse.json(
      { error: 'Failed to update reminder statuses' },
      { status: 500 }
    );
  }
}