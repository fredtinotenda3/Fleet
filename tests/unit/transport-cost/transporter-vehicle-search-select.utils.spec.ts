// tests/unit/transport-cost/transporter-vehicle-search-select.utils.spec.ts
//
// OLIVINE LIVE READINESS PASS. Covers createTransporterVehicleSearchSelect
// (frontend/modules/transport-cost/utils/transporter-vehicle-search-select.utils.ts)
// -- the fix for the client's reported "Transporter/Truck registration
// does not consistently show + Add New" defect. See that file's own
// header comment for the full root-cause and design record.
//
// This exercises the factory's branching directly (against injected
// fake deps), not the real HTTP client -- the same reason
// operation-data-quality.utils.ts's tests do this, since this project's
// Jest config has no JSX transform wired up for its node test
// environment and this logic used to live inside a .tsx page.

import {
  createTransporterVehicleSearchSelect,
  type TransporterVehicleSearchSelectDeps,
} from '../../../frontend/modules/transport-cost/utils/transporter-vehicle-search-select.utils';

function makeDeps(overrides: Partial<TransporterVehicleSearchSelectDeps> = {}): TransporterVehicleSearchSelectDeps {
  return {
    searchTransporters: jest.fn().mockResolvedValue({ results: [], hasMore: false }),
    requestNewTransporter: jest.fn().mockResolvedValue({ id: 't-1', label: 'AFRICA LOGISTICS' }),
    searchVehicles: jest.fn().mockResolvedValue({ results: [], hasMore: false }),
    requestNewVehicle: jest.fn().mockResolvedValue({ id: 'v-1', label: 'ABC1234' }),
    ...overrides,
  };
}

describe('createTransporterVehicleSearchSelect', () => {
  it('always offers onCreateNew for both transporter and vehicle -- the literal fix for "does not consistently show + Add New"', () => {
    const deps = makeDeps();
    const { transporter, vehicle } = createTransporterVehicleSearchSelect(deps);
    expect(typeof transporter.onCreateNew).toBe('function');
    expect(typeof vehicle.onCreateNew).toBe('function');
  });

  it('transporter.onCreateNew calls the review-gated request-new flow, not a synchronous confirmed create', async () => {
    const deps = makeDeps();
    const { transporter } = createTransporterVehicleSearchSelect(deps);
    const result = await transporter.onCreateNew('NEW TRANSPORTER');
    expect(deps.requestNewTransporter).toHaveBeenCalledWith('NEW TRANSPORTER');
    expect(result).toEqual({ id: 't-1', label: 'AFRICA LOGISTICS' });
  });

  it('vehicle.onCreateNew rejects with a clear error when no transporter has been resolved yet -- never silently links to the wrong transporter or none', async () => {
    const deps = makeDeps();
    const { vehicle } = createTransporterVehicleSearchSelect(deps);
    await expect(vehicle.onCreateNew('ABC1234')).rejects.toThrow(/transporter/i);
    expect(deps.requestNewVehicle).not.toHaveBeenCalled();
  });

  it('vehicle.onCreateNew succeeds, passing the resolved transporterPartnerId, once a transporter has been selected', async () => {
    const deps = makeDeps();
    const { transporter, vehicle } = createTransporterVehicleSearchSelect(deps);

    // Simulate SearchCreateSelect committing a picked/created transporter.
    transporter.onResultSelected?.({ id: 't-42', label: 'ZEE TRUCKING' });

    const result = await vehicle.onCreateNew('ACD2345');
    expect(deps.requestNewVehicle).toHaveBeenCalledWith({
      registration: 'ACD2345',
      transporterPartnerId: 't-42',
    });
    expect(result).toEqual({ id: 'v-1', label: 'ABC1234' });
  });

  it('vehicle.search narrows by the resolved transporter id once known', async () => {
    const deps = makeDeps();
    const { transporter, vehicle } = createTransporterVehicleSearchSelect(deps);

    await vehicle.search('abc');
    expect(deps.searchVehicles).toHaveBeenLastCalledWith('abc', undefined);

    transporter.onResultSelected?.({ id: 't-42', label: 'ZEE TRUCKING' });
    await vehicle.search('abc');
    expect(deps.searchVehicles).toHaveBeenLastCalledWith('abc', 't-42');
  });

  it('invalidates the resolved transporter once the operator types something that no longer matches it -- a stale id can never survive an edit', async () => {
    const deps = makeDeps();
    const { transporter, vehicle } = createTransporterVehicleSearchSelect(deps);

    transporter.onResultSelected?.({ id: 't-42', label: 'ZEE TRUCKING' });
    // Reopening the same, unchanged value must NOT invalidate it.
    await transporter.search('ZEE TRUCKING');
    await expect(vehicle.onCreateNew('ACD2345')).resolves.toBeDefined();

    // Now simulate the operator typing a different name.
    transporter.onResultSelected?.({ id: 't-42', label: 'ZEE TRUCKING' });
    await transporter.search('NORTHLAND');
    await expect(vehicle.onCreateNew('ACE3456')).rejects.toThrow(/transporter/i);
  });

  it('two separate factory calls (one per sheet family) never share resolved state', () => {
    const depsA = makeDeps();
    const depsB = makeDeps();
    const familyA = createTransporterVehicleSearchSelect(depsA);
    const familyB = createTransporterVehicleSearchSelect(depsB);

    familyA.transporter.onResultSelected?.({ id: 't-a', label: 'AFRICA LOGISTICS' });

    expect(familyA.getResolvedTransporter()).toEqual({ id: 't-a', label: 'AFRICA LOGISTICS' });
    expect(familyB.getResolvedTransporter()).toBeNull();
  });

  it('createLabel is set for both fields so "+ Add New <label>" reads correctly', () => {
    const { transporter, vehicle } = createTransporterVehicleSearchSelect(makeDeps());
    expect(transporter.createLabel).toBe('Transporter');
    expect(vehicle.createLabel).toBe('Truck');
  });
});
