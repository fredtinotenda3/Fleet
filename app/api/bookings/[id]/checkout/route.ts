// app/api/bookings/[id]/checkout/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { bookingController } from '@/modules/bookings/controllers/booking.controller';
import { Permission } from '@/server/permissions/roles';

export const POST = withAuth((req, ctx) => bookingController.checkOut(req, (ctx as any).params.id), { permission: Permission.BOOKING_MANAGE });