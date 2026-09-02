// tests/unit/leaderboard/alert-category-utils.spec.ts
//
// Pure-function tests for the Alert Category Tiles' catalogue and
// builder (frontend/modules/leaderboard/utils/alert-category.utils.ts).
// Same node-environment, no-React convention as the sibling spec.
//
// The behaviour under test that MATTERS most is negative: a tile with
// no answer must produce null, never 0. On a tile the two are
// indistinguishable to a reader and mean opposite things -- "no
// geofence breaches" versus "we cannot count geofence breaches" -- so
// every not-ready path is asserted explicitly.

import {
  ALERT_CATEGORY_DEFINITIONS,
  alertCategoryDefinition,
  buildAlertCategoryTiles,
  countReadyTiles,
  scheduledMaintenanceCaption,
  unsupportedReason,
} from '@/frontend/modules/leaderboard/utils/alert-category.utils';
import type {
  AlertCategoryId,
  AlertCategoryInputs,
  AlertCategoryTileModel,
} from '@/frontend/modules/leaderboard/types';

const ALL_CATEGORY_IDS: AlertCategoryId[] = [
  'overspeed',
  'harsh_braking',
  'geofence',
  'low_fuel',
  'maintenance_due',
  'fuel_fraud',
  'expense_anomaly',
];

/** Every source healthy and reporting, so a test can vary exactly one thing. */
function readyInputs(overrides: Partial<AlertCategoryInputs> = {}): AlertCategoryInputs {
  return {
    driverRisk: { speedingEvents: 12, hardBrakes: 7 },
    fuelFraudCount: 3,
    expenseAnomalyCount: 5,
    maintenanceOverdue: 4,
    maintenanceScheduled: 11,
    aiStatus: 'ready',
    maintenanceStatus: 'ready',
    ...overrides,
  };
}

function tileById(tiles: AlertCategoryTileModel[], id: AlertCategoryId): AlertCategoryTileModel {
  const tile = tiles.find((candidate) => candidate.id === id);
  if (!tile) throw new Error(`Expected a tile for "${id}"`);
  return tile;
}

// ─── Catalogue ─────────────────────────────────────────────────────────

describe('ALERT_CATEGORY_DEFINITIONS', () => {
  it('covers all seven categories exactly once', () => {
    const ids = ALERT_CATEGORY_DEFINITIONS.map((definition) => definition.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.slice().sort()).toEqual(ALL_CATEGORY_IDS.slice().sort());
  });

  it('names the required endpoint on every unsupported category, and on no supported one', () => {
    for (const definition of ALERT_CATEGORY_DEFINITIONS) {
      if (definition.availability === 'unsupported') {
        expect(definition.missingEndpoint).toBeTruthy();
      } else {
        expect(definition.missingEndpoint).toBeUndefined();
      }
    }
  });

  it('marks geofence and low fuel as unsupported', () => {
    // tbltelematics_alerts is readable only one vehicle at a time (see
    // telematicsRepository.getActiveAlertsInScope), so counting these
    // fleet-wide would be one request per vehicle.
    expect(alertCategoryDefinition('geofence')?.availability).toBe('unsupported');
    expect(alertCategoryDefinition('low_fuel')?.availability).toBe('unsupported');
  });

  it('cites a concrete source on every supported category', () => {
    for (const definition of ALERT_CATEGORY_DEFINITIONS) {
      if (definition.availability === 'supported') {
        expect(definition.sourceLabel).toMatch(/^GET \/api\//);
      }
    }
  });

  it('returns undefined for an unknown id instead of throwing', () => {
    expect(alertCategoryDefinition('made-up' as AlertCategoryId)).toBeUndefined();
  });
});

describe('unsupportedReason', () => {
  it('names the missing endpoint when there is one', () => {
    const definition = alertCategoryDefinition('geofence')!;
    expect(unsupportedReason(definition)).toContain('GET /api/telematics/alerts/summary');
  });

  it('degrades to a generic reason when no endpoint is named', () => {
    const definition = { ...alertCategoryDefinition('geofence')!, missingEndpoint: undefined };
    expect(unsupportedReason(definition)).toBe('No aggregation endpoint available.');
  });
});

// ─── Builder ───────────────────────────────────────────────────────────

describe('buildAlertCategoryTiles', () => {
  it('returns one tile per category, in catalogue order', () => {
    const tiles = buildAlertCategoryTiles(readyInputs());
    expect(tiles.map((tile) => tile.id)).toEqual(ALERT_CATEGORY_DEFINITIONS.map((d) => d.id));
  });

  it('maps each supported category to its own figure', () => {
    const tiles = buildAlertCategoryTiles(readyInputs());
    expect(tileById(tiles, 'overspeed').count).toBe(12);
    expect(tileById(tiles, 'harsh_braking').count).toBe(7);
    expect(tileById(tiles, 'fuel_fraud').count).toBe(3);
    expect(tileById(tiles, 'expense_anomaly').count).toBe(5);
    expect(tileById(tiles, 'maintenance_due').count).toBe(4);
  });

  it('uses overdue, not overdue + scheduled, for the maintenance tile', () => {
    // MaintenanceStats.pending is every unresolved reminder due in the
    // future with no upper bound, so summing would count a service
    // booked for next year as "due" and inflate this tile against the
    // Maintenance page's own overdue figure.
    const tiles = buildAlertCategoryTiles(readyInputs({ maintenanceOverdue: 4, maintenanceScheduled: 99 }));
    expect(tileById(tiles, 'maintenance_due').count).toBe(4);
  });

  it('renders the two unsupported tiles as null, never zero, whatever the inputs say', () => {
    const tiles = buildAlertCategoryTiles(readyInputs());
    for (const id of ['geofence', 'low_fuel'] as AlertCategoryId[]) {
      const tile = tileById(tiles, id);
      expect(tile.state).toBe('unsupported');
      expect(tile.count).toBeNull();
      expect(tile.unavailableReason).toContain('/api/telematics/alerts/summary');
    }
  });

  it('keeps unsupported tiles unsupported even while their notional source is loading', () => {
    const tiles = buildAlertCategoryTiles(readyInputs({ aiStatus: 'loading' }));
    expect(tileById(tiles, 'geofence').state).toBe('unsupported');
  });

  it('shows loading, with no number, while the AI source is in flight', () => {
    const tiles = buildAlertCategoryTiles(readyInputs({ aiStatus: 'loading' }));
    for (const id of ['overspeed', 'harsh_braking', 'fuel_fraud', 'expense_anomaly'] as AlertCategoryId[]) {
      expect(tileById(tiles, id).state).toBe('loading');
      expect(tileById(tiles, id).count).toBeNull();
    }
  });

  it('does not present a stale value as current when its source errored', () => {
    const tiles = buildAlertCategoryTiles(readyInputs({ aiStatus: 'error' }));
    const tile = tileById(tiles, 'fuel_fraud');
    expect(tile.state).toBe('error');
    expect(tile.count).toBeNull();
  });

  it('keeps the two sources independent: a maintenance failure does not blank the AI tiles', () => {
    const tiles = buildAlertCategoryTiles(readyInputs({ maintenanceStatus: 'error' }));
    expect(tileById(tiles, 'maintenance_due').state).toBe('error');
    expect(tileById(tiles, 'maintenance_due').count).toBeNull();
    expect(tileById(tiles, 'overspeed').state).toBe('ready');
    expect(tileById(tiles, 'overspeed').count).toBe(12);
  });

  it('treats a ready query with a null panel as an error, not as zero', () => {
    // getAIDashboard() maps a failed AI service to null rather than
    // failing the response, so "ready with a null panel" is a real and
    // common state -- and it is not a measurement of zero.
    const tiles = buildAlertCategoryTiles(readyInputs({ driverRisk: null, fuelFraudCount: null }));
    expect(tileById(tiles, 'overspeed').state).toBe('error');
    expect(tileById(tiles, 'overspeed').count).toBeNull();
    expect(tileById(tiles, 'fuel_fraud').state).toBe('error');
    expect(tileById(tiles, 'fuel_fraud').count).toBeNull();
  });

  it('renders a real zero as ready with a count of 0', () => {
    const tiles = buildAlertCategoryTiles(
      readyInputs({
        driverRisk: { speedingEvents: 0, hardBrakes: 0 },
        fuelFraudCount: 0,
        maintenanceOverdue: 0,
      })
    );
    expect(tileById(tiles, 'overspeed')).toMatchObject({ state: 'ready', count: 0 });
    expect(tileById(tiles, 'fuel_fraud')).toMatchObject({ state: 'ready', count: 0 });
    expect(tileById(tiles, 'maintenance_due')).toMatchObject({ state: 'ready', count: 0 });
  });

  it('rejects a non-finite value from a source rather than rendering it', () => {
    const tiles = buildAlertCategoryTiles(readyInputs({ fuelFraudCount: Number.NaN }));
    expect(tileById(tiles, 'fuel_fraud').state).toBe('error');
    expect(tileById(tiles, 'fuel_fraud').count).toBeNull();
  });

  it('never returns a count on a tile whose state is not ready', () => {
    const scenarios: Array<Partial<AlertCategoryInputs>> = [
      { aiStatus: 'loading' },
      { aiStatus: 'error' },
      { maintenanceStatus: 'loading' },
      { maintenanceStatus: 'error' },
      { driverRisk: null, fuelFraudCount: null, expenseAnomalyCount: null, maintenanceOverdue: null },
    ];

    for (const overrides of scenarios) {
      for (const tile of buildAlertCategoryTiles(readyInputs(overrides))) {
        if (tile.state !== 'ready') expect(tile.count).toBeNull();
      }
    }
  });

  it('carries the definition metadata through onto every tile', () => {
    const tiles = buildAlertCategoryTiles(readyInputs());
    for (const tile of tiles) {
      const definition = alertCategoryDefinition(tile.id)!;
      expect(tile.label).toBe(definition.label);
      expect(tile.sourceLabel).toBe(definition.sourceLabel);
      expect(tile.availability).toBe(definition.availability);
    }
  });
});

describe('countReadyTiles', () => {
  it('counts only tiles with a real number behind them', () => {
    expect(countReadyTiles(buildAlertCategoryTiles(readyInputs()))).toBe(5);
    expect(countReadyTiles(buildAlertCategoryTiles(readyInputs({ aiStatus: 'error' })))).toBe(1);
  });
});

describe('scheduledMaintenanceCaption', () => {
  it('pluralizes correctly', () => {
    expect(scheduledMaintenanceCaption(1)).toBe('1 more scheduled ahead');
    expect(scheduledMaintenanceCaption(12)).toBe('12 more scheduled ahead');
    expect(scheduledMaintenanceCaption(0)).toBe('0 more scheduled ahead');
  });

  it('returns undefined for an unknown figure so the tile falls back to its description', () => {
    expect(scheduledMaintenanceCaption(null)).toBeUndefined();
    expect(scheduledMaintenanceCaption(Number.NaN)).toBeUndefined();
  });
});
