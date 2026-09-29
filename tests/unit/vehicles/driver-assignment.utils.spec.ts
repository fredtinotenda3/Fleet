// tests/unit/vehicles/driver-assignment.utils.spec.ts
//
// Pure-function tests for formatDriverAssignmentStatus
// (frontend/modules/vehicles/utils/index.ts), the presentation helper
// behind DriverAssignmentPanel. No React/jsdom involved -- this repo's
// jest.config.js runs under testEnvironment: 'node' with no React
// Testing Library wired up (see tests/unit/drivers/driver-risk-utils.spec.ts
// for the same convention).
//
// STALE-COMMENT FIX (Part 2/4 investigation): this file's header
// previously claimed `assignedDriver` is "always undefined for real API
// responses" -- true when this test was first written, no longer true.
// VehicleController.withAssignedDriver (modules/vehicles/controllers/
// vehicle.controller.ts) now resolves `currentDriverId` to a `DriverRef`
// and getVehicle() returns it via VehicleResponseDto.assignedDriver, so
// the Vehicle Operational Hub's detail page (the only page
// DriverAssignmentPanel renders on) correctly shows the current driver.
// docs/DRIVER_VEHICLE_ASSIGNMENT_MISSING_BACKEND.md's own "What shipped"
// section confirms this. The assertions below were never wrong -- they
// test the pure presentation function directly with each input shape --
// only this comment's claim about which shape production code sends was
// out of date. Kept covering both null and undefined defensively: list
// endpoints (VehicleResponseDto.fromVehicles) still omit assignedDriver
// by design (avoiding an N+1 driver lookup for bulk views), so a
// component reused against list data still sees `undefined` there.

import { formatDriverAssignmentStatus } from '@/frontend/modules/vehicles/utils';
import type { DriverRef } from '@/shared/types/driver.types';

describe('formatDriverAssignmentStatus', () => {
  it('reports "no driver assigned" when the vehicle has no driver', () => {
    const status = formatDriverAssignmentStatus(null);

    expect(status.assigned).toBe(false);
    expect(status.label).toBe('No driver assigned');
    expect(status.detail).toBeUndefined();
  });

  it('treats undefined the same as null (list-endpoint shape)', () => {
    // VehicleResponseDto.fromVehicles (list responses) still omits
    // assignedDriver by design -- see this file's header comment.
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
