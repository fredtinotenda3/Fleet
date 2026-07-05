// app/api/bookings/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { bookingController } from '@/modules/bookings/controllers/booking.controller';
import { Permission } from '@/server/permissions/roles';

export const GET = withAuth((req) => bookingController.list(req), { permission: Permission.BOOKING_VIEW });
export const POST = withAuth((req) => bookingController.create(req), { permission: Permission.BOOKING_CREATE });