// tests/unit/transport-cost/operation-detail-data-quality.spec.ts
//
// OLIVINE LIVE OPERATING MODEL, SLICE 1-5 PRODUCTION VERIFICATION PASS.
// The operation detail page (frontend/modules/transport-cost/pages/
// TransportOperationDetailPage.tsx) previously had no "data quality"
// section at all, even though the client's spec requires the detail
// page to expose data-quality info. collectDataQualityIssues() is the
// pure function backing that new section -- it derives every issue from
// fields the API response already carries on the record, never
// estimating or fabricating a condition. It lives in a plain .ts util,
// frontend/modules/transport-cost/utils/operation-data-quality.utils.ts
// (see its own header for why it isn't inlined into the .tsx page --
// this project's Jest config has no JSX transform wired up for its node
// test environment, so a .tsx-resident function would be untestable
// here), and this file exercises it directly.

import { collectDataQualityIssues } from '../../../frontend/modules/transport-cost/utils/operation-data-quality.utils';
import type { TransportCostSourceRecord } from '../../../shared/types/transport-cost.types';

const BASE: TransportCostSourceRecord = {
  _id: 'rec-1',
  tenantId: 'tenant-1',
  sheetFamily: 'third-party',
  importBatchId: 'batch-1',
  sourceFileName: 'jan.xlsx',
  sourceRowNumber: 1,
  importedAt: new Date('2026-01-01'),
  rawRow: {},
  date: new Date('2026-01-01'),
  rawDate: '01.01.26',
  registration: 'AGL8230',
  registrationRaw: 'AGL 8230',
  transporterNormalized: 'PRINORTH',
  transporterRaw: 'Prinorth',
  costFacingCompany: 'olivine',
  amount: 500,
  tonnageRaw: 10,
  currency: 'USD',
  vatBasis: 'exclusive',
  transporterPartnerId: 'partner-1',
  contractedVehicleId: 'vehicle-1',
} as unknown as TransportCostSourceRecord;

describe('collectDataQualityIssues -- operation detail page data-quality section', () => {
  it('reports no issues for a fully-resolved, fully-populated record -- no fabricated "all clear" issue either, an empty array', () => {
    expect(collectDataQualityIssues(BASE)).toEqual([]);
  });

  it('flags a null amount as "Cost not recorded", never treating null as zero', () => {
    const issues = collectDataQualityIssues({ ...BASE, amount: null });
    expect(issues.map((i) => i.label)).toContain('Cost not recorded');
  });

  it('flags a missing cost-facing company as unattributed', () => {
    const issues = collectDataQualityIssues({ ...BASE, costFacingCompany: undefined });
    expect(issues.map((i) => i.label)).toContain('Cost-facing company unattributed');
  });

  it('flags an unparseable date, including the raw source value in the detail text', () => {
    const issues = collectDataQualityIssues({ ...BASE, date: null, rawDate: 'not-a-date' });
    const issue = issues.find((i) => i.label === 'Date could not be parsed');
    expect(issue?.detail).toContain('not-a-date');
  });

  it('flags an unresolved vehicle identity only when a registration exists but no contractedVehicleId is set', () => {
    const withUnresolvedVehicle = collectDataQualityIssues({ ...BASE, contractedVehicleId: undefined });
    expect(withUnresolvedVehicle.map((i) => i.label)).toContain('Vehicle identity not yet confirmed');

    // No registration at all (e.g. a Swift row) -- must NOT flag a
    // vehicle-identity issue that doesn't apply to this record.
    const noRegistration = collectDataQualityIssues({ ...BASE, registration: null, contractedVehicleId: undefined });
    expect(noRegistration.map((i) => i.label)).not.toContain('Vehicle identity not yet confirmed');
  });

  it('flags an unresolved transporter identity only when a transporter name exists but no transporterPartnerId is set', () => {
    const withUnresolvedTransporter = collectDataQualityIssues({ ...BASE, transporterPartnerId: undefined });
    expect(withUnresolvedTransporter.map((i) => i.label)).toContain('Transporter identity not yet confirmed');

    const noTransporterName = collectDataQualityIssues({ ...BASE, transporterNormalized: null, transporterPartnerId: undefined });
    expect(noTransporterName.map((i) => i.label)).not.toContain('Transporter identity not yet confirmed');
  });

  it('flags a missing currency', () => {
    const issues = collectDataQualityIssues({ ...BASE, currency: undefined });
    expect(issues.map((i) => i.label)).toContain('Currency not yet determined');
  });

  it('flags an unknown or unset VAT basis', () => {
    expect(collectDataQualityIssues({ ...BASE, vatBasis: 'unknown' }).map((i) => i.label)).toContain('VAT basis not yet determined');
    expect(collectDataQualityIssues({ ...BASE, vatBasis: undefined }).map((i) => i.label)).toContain('VAT basis not yet determined');
    expect(collectDataQualityIssues({ ...BASE, vatBasis: 'exclusive' }).map((i) => i.label)).not.toContain('VAT basis not yet determined');
  });

  it('reports MULTIPLE simultaneous issues on a genuinely messy record, each independently, not just the first match', () => {
    const messy = collectDataQualityIssues({
      ...BASE,
      amount: null,
      costFacingCompany: undefined,
      date: null,
      currency: undefined,
      vatBasis: undefined,
      transporterPartnerId: undefined,
      contractedVehicleId: undefined,
    });
    expect(messy.map((i) => i.label).sort()).toEqual(
      [
        'Cost not recorded',
        'Cost-facing company unattributed',
        'Date could not be parsed',
        'Vehicle identity not yet confirmed',
        'Transporter identity not yet confirmed',
        'Currency not yet determined',
        'VAT basis not yet determined',
      ].sort()
    );
  });
});
