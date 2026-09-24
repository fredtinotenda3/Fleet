// tests/unit/transport-cost/master-data.service.spec.ts
//
// OLIVINE LIVE OPERATING MODEL, SLICE 3. MasterDataService with every
// repository mocked (same pattern as transport-cost-vat-config.service
// .spec.ts) -- exercises the parts of the client's 18-item test list
// that are specifically about SERVICE-layer behaviour rather than raw
// repository filtering (already covered by customer-destination
// .repository.spec.ts): find-or-create semantics, the race-condition
// ConflictError recovery path (which FakeCollection cannot simulate --
// see that spec's own header), input validation, and why Transporter/
// Vehicle never get a create path.

import { MasterDataService } from '../../../modules/transport-cost/services/master-data.service';
import { ValidationError, ConflictError, NotFoundError } from '../../../server/errors/app.errors';

const TENANT = 'olivine-group-slice3';
const USER = 'user-1';

function makeCustomerRepo(overrides: Record<string, jest.Mock> = {}) {
  return {
    findByNormalizedName: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
    search: jest.fn().mockResolvedValue([]),
    listPaginated: jest.fn(),
    ...overrides,
  } as any;
}

function makeDestinationRepo(overrides: Record<string, jest.Mock> = {}) {
  return makeCustomerRepo(overrides);
}

function makePartnerRepo(overrides: Record<string, jest.Mock> = {}) {
  return {
    searchConfirmedByName: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue(null),
    ...overrides,
  } as any;
}

function makeVehicleRepo(overrides: Record<string, jest.Mock> = {}) {
  return {
    searchConfirmedByRegistration: jest.fn().mockResolvedValue([]),
    ...overrides,
  } as any;
}

function makeService(overrides: {
  customerRepo?: any;
  destinationRepo?: any;
  partnerRepo?: any;
  vehicleRepo?: any;
} = {}) {
  return new MasterDataService(
    overrides.customerRepo ?? makeCustomerRepo(),
    overrides.destinationRepo ?? makeDestinationRepo(),
    overrides.partnerRepo ?? makePartnerRepo(),
    overrides.vehicleRepo ?? makeVehicleRepo()
  );
}

describe('MasterDataService.createCustomer / createDestination (find-or-create)', () => {
  it('creates a genuinely new customer when no normalized match exists', async () => {
    const created = { _id: 'cust-1', name: 'Olivine Harare', normalizedName: 'OLIVINE HARARE', active: true };
    const customerRepo = makeCustomerRepo({ create: jest.fn().mockResolvedValue(created) });
    const service = makeService({ customerRepo });

    const result = await service.createCustomer('  Olivine Harare  ', TENANT, USER);

    expect(result.created).toBe(true);
    expect(result.record).toBe(created);
    expect(customerRepo.findByNormalizedName).toHaveBeenCalledWith('OLIVINE HARARE', TENANT);
    expect(customerRepo.create).toHaveBeenCalledWith(
      { name: 'Olivine Harare', normalizedName: 'OLIVINE HARARE', active: true },
      TENANT,
      USER
    );
  });

  it('returns the EXISTING record instead of creating a duplicate -- item 4 (duplicate customer prevention)', async () => {
    const existing = { _id: 'cust-1', name: 'Olivine Harare', normalizedName: 'OLIVINE HARARE', active: true };
    const customerRepo = makeCustomerRepo({ findByNormalizedName: jest.fn().mockResolvedValue(existing) });
    const service = makeService({ customerRepo });

    const result = await service.createCustomer('OLIVINE   HARARE', TENANT, USER);

    expect(result.created).toBe(false);
    expect(result.record).toBe(existing);
    expect(customerRepo.create).not.toHaveBeenCalled();
  });

  it('recovers from a race-condition ConflictError by re-resolving the winner, rather than propagating the 409 -- item 6/7 duplicate protection', async () => {
    const winner = { _id: 'cust-2', name: 'Bulawayo Depot', normalizedName: 'BULAWAYO DEPOT', active: true };
    const findByNormalizedName = jest
      .fn()
      .mockResolvedValueOnce(null) // pre-check: nothing yet
      .mockResolvedValueOnce(winner); // re-resolve after the race
    const destinationRepo = makeDestinationRepo({
      findByNormalizedName,
      create: jest.fn().mockRejectedValue(new ConflictError('duplicate key')),
    });
    const service = makeService({ destinationRepo });

    const result = await service.createDestination('Bulawayo Depot', TENANT, USER);

    expect(result.created).toBe(false);
    expect(result.record).toBe(winner);
    expect(findByNormalizedName).toHaveBeenCalledTimes(2);
  });

  it('rejects a blank name without touching the repository at all', async () => {
    const customerRepo = makeCustomerRepo();
    const service = makeService({ customerRepo });

    await expect(service.createCustomer('   ', TENANT, USER)).rejects.toBeInstanceOf(ValidationError);
    expect(customerRepo.findByNormalizedName).not.toHaveBeenCalled();
    expect(customerRepo.create).not.toHaveBeenCalled();
  });

  it('rejects a name over 200 characters', async () => {
    const service = makeService();
    await expect(service.createDestination('X'.repeat(201), TENANT, USER)).rejects.toBeInstanceOf(ValidationError);
  });

  it('re-throws a non-ConflictError create failure unchanged rather than swallowing it', async () => {
    const boom = new Error('database unreachable');
    const customerRepo = makeCustomerRepo({ create: jest.fn().mockRejectedValue(boom) });
    const service = makeService({ customerRepo });

    await expect(service.createCustomer('Anything', TENANT, USER)).rejects.toBe(boom);
  });
});

describe('MasterDataService.searchCustomers / searchDestinations', () => {
  it('maps repository rows to {id, label} for the type-ahead dropdown', async () => {
    const customerRepo = makeCustomerRepo({
      search: jest.fn().mockResolvedValue([
        { _id: 'c1', name: 'Alpha Co', normalizedName: 'ALPHA CO', active: true },
        { _id: 'c2', name: 'Beta Co', normalizedName: 'BETA CO', active: true },
      ]),
    });
    const service = makeService({ customerRepo });

    const results = await service.searchCustomers('Co', TENANT);

    expect(results).toEqual([
      { id: 'c1', label: 'Alpha Co' },
      { id: 'c2', label: 'Beta Co' },
    ]);
    expect(customerRepo.search).toHaveBeenCalledWith('Co', TENANT);
  });
});

describe('MasterDataService.searchTransporters / searchVehicles -- search only, no create path', () => {
  it('searchTransporters delegates to searchConfirmedByName and maps canonicalName as the label', async () => {
    const partnerRepo = makePartnerRepo({
      searchConfirmedByName: jest.fn().mockResolvedValue([{ _id: 'p1', canonicalName: 'PRINORTH' }]),
    });
    const service = makeService({ partnerRepo });

    const results = await service.searchTransporters('prin', TENANT);
    expect(results).toEqual([{ id: 'p1', label: 'PRINORTH' }]);
  });

  it('MasterDataService has no createTransporter/createVehicle method -- the O2 review-gated identity path is never bypassed', () => {
    const service = makeService();
    expect((service as any).createTransporter).toBeUndefined();
    expect((service as any).createVehicle).toBeUndefined();
  });

  it('searchVehicles joins in the transporter\'s canonical name for display, and narrows by transporterPartnerId when given', async () => {
    const vehicleRepo = makeVehicleRepo({
      searchConfirmedByRegistration: jest
        .fn()
        .mockResolvedValue([{ _id: 'v1', registration: 'AGL8230', transporterPartnerId: 'p1' }]),
    });
    const partnerRepo = makePartnerRepo({
      findById: jest.fn().mockResolvedValue({ _id: 'p1', canonicalName: 'PRINORTH' }),
    });
    const service = makeService({ vehicleRepo, partnerRepo });

    const results = await service.searchVehicles('AGL', TENANT, 'p1');

    expect(vehicleRepo.searchConfirmedByRegistration).toHaveBeenCalledWith('AGL', TENANT, 'p1');
    expect(results).toEqual([{ id: 'v1', label: 'AGL8230 — PRINORTH' }]);
  });

  it('searchVehicles falls back to the bare registration when the transporter cannot be resolved', async () => {
    const vehicleRepo = makeVehicleRepo({
      searchConfirmedByRegistration: jest
        .fn()
        .mockResolvedValue([{ _id: 'v1', registration: 'AGL8230', transporterPartnerId: 'missing' }]),
    });
    const partnerRepo = makePartnerRepo({ findById: jest.fn().mockResolvedValue(null) });
    const service = makeService({ vehicleRepo, partnerRepo });

    const results = await service.searchVehicles('AGL', TENANT);
    expect(results).toEqual([{ id: 'v1', label: 'AGL8230' }]);
  });

  it('returns an empty array without querying transporters at all when no vehicle matches', async () => {
    const partnerRepo = makePartnerRepo();
    const service = makeService({ partnerRepo });

    const results = await service.searchVehicles('ZZZZZZ', TENANT);
    expect(results).toEqual([]);
    expect(partnerRepo.findById).not.toHaveBeenCalled();
  });
});

describe('MasterDataService.deactivateCustomer / reactivateCustomer', () => {
  it('deactivates an existing customer and audit-logs the change', async () => {
    const existing = { _id: 'c1', name: 'Old Co', normalizedName: 'OLD CO', active: true };
    const updated = { ...existing, active: false };
    const customerRepo = makeCustomerRepo({
      findById: jest.fn().mockResolvedValue(existing),
      update: jest.fn().mockResolvedValue(updated),
    });
    const service = makeService({ customerRepo });

    const result = await service.deactivateCustomer('c1', TENANT, USER);
    expect(result.active).toBe(false);
    expect(customerRepo.update).toHaveBeenCalledWith('c1', { active: false }, TENANT, USER);
  });

  it('throws NotFoundError for an id that does not exist', async () => {
    const customerRepo = makeCustomerRepo({ findById: jest.fn().mockResolvedValue(null) });
    const service = makeService({ customerRepo });

    await expect(service.deactivateCustomer('missing', TENANT, USER)).rejects.toBeInstanceOf(NotFoundError);
  });
});
