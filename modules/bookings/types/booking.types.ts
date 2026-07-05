
// modules/bookings/types/booking.types.ts
import { BaseEntity } from '@/shared/types/common.types';

export type BookingStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'checked_out' | 'checked_in';

export interface Booking extends BaseEntity {
  vehicleId: string;
  license_plate: string;
  requestedBy: string;
  purpose: string;
  startTime: Date;
  endTime: Date;
  status: BookingStatus;
  approvedBy?: string;
  rejectionReason?: string;
  checkOutOdometer?: number;
  checkInOdometer?: number;
  checkOutAt?: Date;
  checkInAt?: Date;
}

export interface BookingCreateDTO {
  vehicleId: string;
  license_plate: string;
  purpose: string;
  startTime: Date | string;
  endTime: Date | string;
}

export interface BookingFilters {
  vehicleId?: string;
  requestedBy?: string;
  status?: BookingStatus;
  startDate?: Date;
  endDate?: Date;
}






