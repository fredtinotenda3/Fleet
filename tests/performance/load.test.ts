// tests/performance/load.test.ts

import { describe, it } from 'vitest';
import { vehicleService } from '@/modules/vehicles/services/vehicle.service';

describe('Performance Tests', () => {
  it('should handle bulk vehicle creation', async () => {
    const startTime = Date.now();
    const promises = [];
    
    for (let i = 0; i < 100; i++) {
      promises.push(vehicleService.create({
        license_plate: `PERF${i}`,
        make: 'Performance Test',
        model: `Model ${i}`,
        year: 2024,
        vehicle_type: 'Car',
        purchase_date: '2024-01-01',
        fuel_type: 'Petrol',
        status: 'active',
      }, 'test-tenant', 'test-user'));
    }
    
    await Promise.all(promises);
    const duration = Date.now() - startTime;
    
    console.log(`Created 100 vehicles in ${duration}ms`);
    expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
  });

  it('should query vehicles with pagination efficiently', async () => {
    const startTime = Date.now();
    
    for (let i = 0; i < 10; i++) {
      await vehicleService.findWithPagination({}, { page: i + 1, limit: 50 }, 'test-tenant');
    }
    
    const duration = Date.now() - startTime;
    console.log(`10 paginated queries completed in ${duration}ms`);
    expect(duration).toBeLessThan(5000);
  });
});