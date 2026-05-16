import { BaseService } from '@/server/services/base.service';
import { vehicleRepository, VehicleRepository } from '../repositories/vehicle.repository';
import {
  vehicleCreateSchema,
  vehicleUpdateSchema,
  vehicleFiltersSchema,
} from '@/shared/validations/vehicle.schema';
import {
  Vehicle,
  VehicleCreateDTO,
  VehicleUpdateDTO,
  VehicleFilters,
  VehicleStats,
} from '@/shared/types/vehicle.types';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';
import { AppError, NotFoundError } from '@/server/errors/app.errors';

export class VehicleService extends BaseService<Vehicle, VehicleCreateDTO, VehicleUpdateDTO> {
  constructor(private vehicleRepo: VehicleRepository) {
    super(vehicleRepo);
  }

  protected getCreateSchema() { return vehicleCreateSchema; }
  protected getUpdateSchema() { return vehicleUpdateSchema; }
  protected getEntityName(): string { return 'Vehicle'; }

  private isSuperAdmin(tenantId: string): boolean {
    return tenantId === 'default' || tenantId === 'system' || tenantId === 'super_admin';
  }

  async findByLicensePlate(licensePlate: string, tenantId: string): Promise<Vehicle | null> {
    return this.vehicleRepo.findByLicensePlate(licensePlate, tenantId, this.isSuperAdmin(tenantId));
  }

  async findByLicensePlates(licensePlates: string[], tenantId: string): Promise<Vehicle[]> {
    return this.vehicleRepo.findByLicensePlates(licensePlates, tenantId, this.isSuperAdmin(tenantId));
  }

  async searchVehicles(searchTerm: string, pagination: PaginationParams, tenantId: string): Promise<PaginatedResponse<Vehicle>> {
    if (!searchTerm || searchTerm.length < 2) {
      return this.getFilteredVehicles({}, pagination, tenantId);
    }
    return this.vehicleRepo.searchVehicles(searchTerm, tenantId, pagination, this.isSuperAdmin(tenantId));
  }

  async getFilteredVehicles(filters: VehicleFilters, pagination: PaginationParams, tenantId: string): Promise<PaginatedResponse<Vehicle>> {
    // Only validate known filter fields, ignore extras
    const safeFilters = vehicleFiltersSchema.parse({
      ...filters,
      page: pagination.page,
      limit: pagination.limit,
    });
    return this.vehicleRepo.getFilteredVehiclesOptimized(safeFilters, pagination, tenantId, this.isSuperAdmin(tenantId));
  }

  async getVehicleStats(tenantId: string): Promise<VehicleStats> {
    return this.vehicleRepo.getVehicleStats(tenantId, this.isSuperAdmin(tenantId));
  }

  async getVehiclesByStatus(status: string, tenantId: string): Promise<Vehicle[]> {
    if (!['active', 'inactive', 'maintenance'].includes(status)) {
      throw new AppError('Invalid status filter', 'INVALID_STATUS', 400);
    }
    return this.vehicleRepo.getVehiclesByStatus(status, tenantId, this.isSuperAdmin(tenantId));
  }

  async getVehiclesWithRecentActivity(days: number, tenantId: string, limit?: number): Promise<Vehicle[]> {
    return this.vehicleRepo.getVehiclesWithRecentActivity(days, tenantId, limit, this.isSuperAdmin(tenantId));
  }

  async getVehiclesDueForService(mileageThreshold: number, tenantId: string): Promise<Vehicle[]> {
    return this.vehicleRepo.getVehiclesDueForService(mileageThreshold, tenantId, this.isSuperAdmin(tenantId));
  }

  async getVehicleAnalytics(tenantId: string, startDate: Date, endDate: Date) {
    return this.vehicleRepo.getVehicleAnalytics(tenantId, startDate, endDate, this.isSuperAdmin(tenantId));
  }

  async updateStatus(id: string, status: Vehicle['status'], tenantId: string, userId?: string): Promise<Vehicle | null> {
    if (!['active', 'inactive', 'maintenance'].includes(status as string)) {
      throw new AppError('Invalid status value', 'INVALID_STATUS', 400);
    }
    return this.update(id, { _id: id, status }, tenantId, userId);
  }

  // Override create — pick only known fields to avoid schema rejecting unknown keys
  async create(data: unknown, tenantId: string, userId?: string): Promise<Vehicle> {
    const raw = data as Record<string, unknown>;

    // Pick only fields the schema knows about
    const clean = {
      license_plate: raw.license_plate,
      make: raw.make,
      model: raw.model,
      year: typeof raw.year === 'string' ? parseInt(raw.year as string) : raw.year,
      vehicle_type: raw.vehicle_type,
      purchase_date: raw.purchase_date,
      fuel_type: raw.fuel_type,
      color: raw.color ?? '#3b82f6',
      vin: raw.vin,
      status: raw.status ?? 'active',
      registration_expiry: raw.registration_expiry,
      insurance_provider: raw.insurance_provider,
      service_interval: raw.service_interval,
      odometer: raw.odometer,
    };

    // Remove undefined keys so Zod doesn't complain
    const payload = Object.fromEntries(
      Object.entries(clean).filter(([, v]) => v !== undefined)
    );

    console.log('VehicleService.create - sanitized payload:', payload);
    const validatedData = await this.validateCreate(payload);
    return this.repository.create(validatedData as any, tenantId, userId);
  }

  // Override update similarly
  async update(id: string, data: unknown, tenantId: string, userId?: string): Promise<Vehicle | null> {
    const raw = data as Record<string, unknown>;

    const clean: Record<string, unknown> = { _id: id };
    const allowedFields = [
      'license_plate', 'make', 'model', 'year', 'vehicle_type',
      'purchase_date', 'fuel_type', 'color', 'vin', 'status',
      'registration_expiry', 'insurance_provider', 'service_interval', 'odometer',
    ];

    allowedFields.forEach((field) => {
      if (raw[field] !== undefined) {
        clean[field] = field === 'year' && typeof raw[field] === 'string'
          ? parseInt(raw[field] as string)
          : raw[field];
      }
    });

    const validatedData = await this.validateUpdate(clean);
    const entity = await this.repository.update(id, validatedData as any, tenantId, userId);
    if (!entity) {
      throw new NotFoundError('Vehicle not found');
    }
    return entity;
  }

  async findById(id: string, tenantId: string): Promise<Vehicle | null> {
    const entity = await this.repository.findById(id, tenantId, false, this.isSuperAdmin(tenantId));
    if (!entity) throw new NotFoundError('Vehicle not found');
    return entity;
  }

  async findWithPagination(filter: Record<string, unknown>, pagination: PaginationParams, tenantId: string): Promise<PaginatedResponse<Vehicle>> {
    return this.repository.findWithPagination(filter as any, pagination, tenantId, false, this.isSuperAdmin(tenantId));
  }
}

export const vehicleService = new VehicleService(vehicleRepository);