// app/api/bookings/[id]/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { bookingController } from '@/modules/bookings/controllers/booking.controller';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth((req, ctx) => bookingController.get(req, (ctx as any).params.id), { permission: Permission.BOOKING_VIEW });