// app/api/bookings/[id]/route.ts
import { withAuth } from '@/server/middleware/with-auth';
import { bookingController } from '@/modules/bookings/controllers/booking.controller';
import { Permission } from '@/server/permissions/roles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = withAuth<RouteParams>(
  async (req, _ctx, { params }) => {
    const { id } = await params;
    return bookingController.get(req, id);
  },
  { permission: Permission.BOOKING_VIEW }
);