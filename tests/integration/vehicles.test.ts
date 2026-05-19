// tests/integration/vehicles.test.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { vehicleService } from '@/modules/vehicles/services/vehicle.service';
import connectToDatabase from '@/infrastructure/database/mongodb';

describe('Vehicle Integration Tests', () => {
  let testTenantId: string;
  let testUserId: string;

  beforeAll(async () => {
    await connectToDatabase();
    testTenantId = 'test-tenant';
    testUserId = 'test-user';
  });

  afterAll(async () => {
    // Cleanup test data
  });

  it('should create and retrieve a vehicle', async () => {
    const vehicleData = {
      license_plate: 'TEST123',
      make: 'Test Make',
      model: 'Test Model',
      year: 2024,
      vehicle_type: 'Car',
      purchase_date: '2024-01-01',
      fuel_type: 'Petrol',
      status: 'active',
    };

    const created = await vehicleService.create(vehicleData, testTenantId, testUserId);
    
    expect(created._id).toBeDefined();
    expect(created.license_plate).toBe('TEST123');

    const retrieved = await vehicleService.findById(created._id!, testTenantId);
    
    expect(retrieved).toBeDefined();
    expect(retrieved?.license_plate).toBe('TEST123');
  });

  it('should update vehicle status', async () => {
    const vehicleData = {
      license_plate: 'TEST456',
      make: 'Test Make',
      model: 'Test Model',
      year: 2024,
      vehicle_type: 'Car',
      purchase_date: '2024-01-01',
      fuel_type: 'Petrol',
      status: 'active',
    };

    const created = await vehicleService.create(vehicleData, testTenantId, testUserId);
    
    const updated = await vehicleService.updateStatus(created._id!, 'maintenance', testTenantId, testUserId);
    
    expect(updated?.status).toBe('maintenance');
  });
});