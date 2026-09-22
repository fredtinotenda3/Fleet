// tests/unit/transport-cost/transport-cost-vat-config.service.spec.ts
//
// Phase O3. TransportCostVatConfigService.resolve is the ONLY place
// currency/VAT basis is decided for a posting -- these tests pin its
// resolution order (batch override > sheetFamily-wide > DEFAULT) and the
// isProvisionalDefault flag that tells a caller which case produced the
// answer, per the type's own header ("BOTH surfaced ... rather than
// looking identical").

import { TransportCostVatConfigService } from '../../../modules/transport-cost/services/transport-cost-vat-config.service';
import { TRANSPORT_COST_VAT_CONFIG_DEFAULTS } from '../../../modules/transport-cost/utils/vat-config-defaults';

const TENANT = 'olivine-group-o3';

function makeRepo(overrides: Record<string, jest.Mock> = {}) {
  return {
    findByImportBatch: jest.fn().mockResolvedValue(null),
    findForSheetFamily: jest.fn().mockResolvedValue(null),
    ...overrides,
  } as any;
}

describe('TransportCostVatConfigService.resolve', () => {
  it('falls back to the provisional DEFAULT when nothing is confirmed', async () => {
    const service = new TransportCostVatConfigService(makeRepo());
    const result = await service.resolve('third-party', 'batch-1', TENANT);

    expect(result).toEqual({
      sheetFamily: 'third-party',
      currency: TRANSPORT_COST_VAT_CONFIG_DEFAULTS['third-party'].currency,
      vatBasis: TRANSPORT_COST_VAT_CONFIG_DEFAULTS['third-party'].vatBasis,
      vatRatePercent: undefined,
      isProvisionalDefault: true,
    });
  });

  it('vansales defaults to exclusive VAT basis (evidenced by the "MONTHLY COST BEFORE VAT" column), third-party to unknown', async () => {
    const service = new TransportCostVatConfigService(makeRepo());
    const thirdParty = await service.resolve('third-party', undefined, TENANT);
    const vansales = await service.resolve('vansales', undefined, TENANT);

    expect(thirdParty.vatBasis).toBe('unknown');
    expect(vansales.vatBasis).toBe('exclusive');
  });

  it('a CONFIRMED sheetFamily-wide row overrides the default', async () => {
    const repo = makeRepo({
      findForSheetFamily: jest.fn().mockResolvedValue({
        _id: 'cfg-1',
        tenantId: TENANT,
        sheetFamily: 'third-party',
        currency: 'ZWL',
        vatBasis: 'inclusive',
        confirmedBy: 'user-1',
        confirmedAt: new Date(),
      }),
    });
    const service = new TransportCostVatConfigService(repo);
    const result = await service.resolve('third-party', undefined, TENANT);

    expect(result).toEqual({
      sheetFamily: 'third-party',
      currency: 'ZWL',
      vatBasis: 'inclusive',
      vatRatePercent: undefined,
      isProvisionalDefault: false,
    });
  });

  it('a batch-scoped override wins over the sheetFamily-wide row, and the family lookup is not even attempted', async () => {
    const findForSheetFamily = jest.fn();
    const repo = makeRepo({
      findByImportBatch: jest.fn().mockResolvedValue({
        _id: 'cfg-batch',
        tenantId: TENANT,
        sheetFamily: 'third-party',
        importBatchId: 'batch-9',
        currency: 'EUR',
        vatBasis: 'exclusive',
        confirmedBy: 'user-2',
        confirmedAt: new Date(),
      }),
      findForSheetFamily,
    });
    const service = new TransportCostVatConfigService(repo);
    const result = await service.resolve('third-party', 'batch-9', TENANT);

    expect(result.currency).toBe('EUR');
    expect(result.isProvisionalDefault).toBe(false);
    expect(findForSheetFamily).not.toHaveBeenCalled();
  });

  it('a saved row confirmed on VAT basis but with no currency still falls back to the DEFAULT currency, never posts undefined', async () => {
    const repo = makeRepo({
      findForSheetFamily: jest.fn().mockResolvedValue({
        _id: 'cfg-2',
        tenantId: TENANT,
        sheetFamily: 'third-party',
        vatBasis: 'exclusive',
        confirmedBy: 'user-3',
        confirmedAt: new Date(),
        // currency intentionally absent
      }),
    });
    const service = new TransportCostVatConfigService(repo);
    const result = await service.resolve('third-party', undefined, TENANT);

    expect(result.currency).toBe(TRANSPORT_COST_VAT_CONFIG_DEFAULTS['third-party'].currency);
    // Currency is still the provisional default, so isProvisionalDefault
    // stays true even though VAT basis WAS confirmed -- each field's
    // provenance should not be blurred into one flag that hides which
    // part is still open.
    expect(result.isProvisionalDefault).toBe(true);
    expect(result.vatBasis).toBe('exclusive');
  });

  it('an unconfirmed saved row (confirmedBy unset) is treated the same as no row at all', async () => {
    const repo = makeRepo({
      findForSheetFamily: jest.fn().mockResolvedValue({
        _id: 'cfg-3',
        tenantId: TENANT,
        sheetFamily: 'third-party',
        currency: 'ZWL',
        vatBasis: 'inclusive',
        // no confirmedBy -- a draft/auto-suggested row, not a client sign-off
      }),
    });
    const service = new TransportCostVatConfigService(repo);
    const result = await service.resolve('third-party', undefined, TENANT);

    expect(result.currency).toBe(TRANSPORT_COST_VAT_CONFIG_DEFAULTS['third-party'].currency);
    expect(result.vatBasis).toBe(TRANSPORT_COST_VAT_CONFIG_DEFAULTS['third-party'].vatBasis);
    expect(result.isProvisionalDefault).toBe(true);
  });
});
