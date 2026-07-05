// modules/bookings/controllers/booking.controller.ts
import { NextRequest } from 'next/server';
import { bookingService } from '../services/booking.service';
import { BookingFilters } from '../types/booking.types';
import { validatePaginationParams } from '@/shared/utils/pagination.utils';
import { successResponse, paginatedResponse, errorResponse, createdResponse } from '@/server/utils/response.utils';
import { AppError, ValidationError } from '@/server/errors/app.errors';
import { getTenantFromRequest, getUserIdFromRequest } from '@/server/utils/context.utils';

export class BookingController {
  async list(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const sp = req.nextUrl.searchParams;
      const filters: BookingFilters = {
        vehicleId: sp.get('vehicleId') || undefined,
        requestedBy: sp.get('requestedBy') || undefined,
        status: (sp.get('status') as any) || undefined,
        startDate: sp.get('start') ? new Date(sp.get('start')!) : undefined,
        endDate: sp.get('end') ? new Date(sp.get('end')!) : undefined,
      };
      const { page, limit } = validatePaginationParams(sp.get('page'), sp.get('limit'));
      const result = await bookingService.list(filters, { page, limit }, tenantId);
      return paginatedResponse(result.data, result.pagination);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async get(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      return successResponse(await bookingService.get(id, tenantId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async create(req: NextRequest) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const body = await req.json();
      return createdResponse(await bookingService.create(body, tenantId, userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async approve(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      return successResponse(await bookingService.approve(id, tenantId, userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async reject(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const { reason } = await req.json();
      if (!reason) throw new ValidationError('reason is required');
      return successResponse(await bookingService.reject(id, reason, tenantId, userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async cancel(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      return successResponse(await bookingService.cancel(id, tenantId, userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async checkOut(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const { odometer } = await req.json();
      if (typeof odometer !== 'number') throw new ValidationError('odometer (number) is required');
      return successResponse(await bookingService.checkOut(id, odometer, tenantId, userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  async checkIn(req: NextRequest, id: string) {
    try {
      const tenantId = await getTenantFromRequest(req);
      const userId = await getUserIdFromRequest(req);
      const { odometer } = await req.json();
      if (typeof odometer !== 'number') throw new ValidationError('odometer (number) is required');
      return successResponse(await bookingService.checkIn(id, odometer, tenantId, userId));
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: unknown) {
    if (error instanceof AppError) return errorResponse(error.message, error.code, error.statusCode, error.details);
    console.error('[BookingController] Unexpected error:', error);
    return errorResponse('Internal server error', 'INTERNAL_ERROR', 500);
  }
}

export const bookingController = new BookingController();