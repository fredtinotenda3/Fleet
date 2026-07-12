// app/api/bookings/[id]/reject/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { bookingController } from '@/modules/bookings/controllers/booking.controller';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const POST = withAuth<RouteParams>(
  async (req, _ctx, { params }) => {
    const { id } = await params;
    return bookingController.reject(req, id);
  },
  { permission: Permission.BOOKING_APPROVE }
);