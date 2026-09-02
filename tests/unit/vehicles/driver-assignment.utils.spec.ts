// tests/unit/vehicles/driver-assignment.utils.spec.ts
//
// Pure-function tests for formatDriverAssignmentStatus
// (frontend/modules/vehicles/utils/index.ts), the presentation helper
// behind DriverAssignmentPanel. No React/jsdom involved -- this repo's
// jest.config.js runs under testEnvironment: 'node' with no React
// Testing Library wired up (see tests/unit/drivers/driver-risk-utils.spec.ts
// for the same convention).
//
// Covers the state DriverAssignmentPanel actually has to render today:
// `assignedDriver` is always undefined for real API responses (see
// docs/DRIVER_VEHICLE_ASSIGNMENT_MISSING_BACKEND.md), so the
// "unassigned" branch is the one that matters most right now.

import { formatDriverAssignmentStatus } from '@/frontend/modules/vehicles/utils';
import type { DriverRef } from '@/shared/types/driver.types';

describe('formatDriverAssignmentStatus', () => {
  it('reports "no driver assigned" when the vehicle has no driver', () => {
    const status = formatDriverAssignmentStatus(null);

    expect(status.assigned).toBe(false);
    expect(status.label).toBe('No driver assigned');
    expect(status.detail).toBeUndefined();
  });

  it('treats undefined the same as null (the current real-world case)', () => {
    // VehicleResponseDto never sends assignedDriver today, so this is
    // the shape every real API response actually produces.
    const status = formatDriverAssignmentStatus(undefined);

    expect(status.assigned).toBe(false);
    expect(status.label).toBe('No driver assigned');
  });

  it('shows the driver name as the label when a driver is assigned', () => {
    const driver: DriverRef = { _id: 'd1', name: 'Tendai Moyo' };

    const status = formatDriverAssignmentStatus(driver);

    expect(status.assigned).toBe(true);
    expect(status.label).toBe('Tendai Moyo');
    expect(status.detail).toBeUndefined();
  });

  it('includes the driver code in the detail line when present', () => {
    const driver: DriverRef = { _id: 'd2', name: 'Rudo Chikafu', driver_code: 'DRV-042' };

    const status = formatDriverAssignmentStatus(driver);

    expect(status.assigned).toBe(true);
    expect(status.label).toBe('Rudo Chikafu');
    expect(status.detail).toBe('Code: DRV-042');
  });

  it('omits the detail line when driver_code is an empty string', () => {
    const driver: DriverRef = { _id: 'd3', name: 'No Code Driver', driver_code: '' };

    const status = formatDriverAssignmentStatus(driver);

    expect(status.detail).toBeUndefined();
  });
});
