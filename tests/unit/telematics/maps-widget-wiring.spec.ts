// tests/unit/telematics/maps-widget-wiring.spec.ts
//
// Wave 1 acceptance, dashboard MapsWidget gap: source-text conformance
// for the same reason as tests/unit/vehicles/vehicle-attention-wiring.spec.ts
// -- jest here runs `testEnvironment: 'node'` with no jsdom, and this
// component calls a React Query hook that cannot be invoked outside a
// real React render.
//
// What this suite pins:
//   1. The widget consumes the SAME authoritative live-map hook/endpoint
//      as the full Live Map page -- no second telemetry query, no second
//      map engine.
//   2. Status/stale counts are DERIVED from the fetched vehicles array,
//      never hardcoded -- a missing/zero fleet renders truthfully, not a
//      fabricated number.
//   3. Stale fixes are surfaced distinctly from live ones, mirroring the
//      staleCount convention LiveMapPage/LiveMapLegend already establish
//      (LiveMapPage's own comment: "moving + idle + offline still sums
//      to the fleet total (MapsWidget relies on that too)") -- before
//      this fix the widget computed status buckets but silently dropped
//      the stale dimension, so a vehicle running on a 40-minute-old fix
//      displayed identically to one on a 10-second-old fix.
//   4. Loading/error states are handed to the shared DashboardWidget
//      wrapper, not reimplemented locally.
//   5. It links out to the full Live Map page rather than embedding a
//      second map render.

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const src = () => fs.readFileSync(path.join(ROOT, 'frontend/shared/dashboards/widgets/MapsWidget.tsx'), 'utf8');

describe('MapsWidget: reuses the authoritative live-map hook, no second pipeline', () => {
  it('calls useLiveMap() from the shared telematics hooks module', () => {
    const s = src();
    expect(s).toMatch(/from '@\/frontend\/modules\/telematics\/hooks'/);
    expect(s).toMatch(/const \{ data, isLoading, isError, refetch \} = useLiveMap\(\)/);
  });

  it('does not issue any other data fetch (no second useQuery/plain fetch call)', () => {
    const s = src();
    expect(s).not.toMatch(/useQuery\(/);
    // Word-boundary so this doesn't false-positive on `refetch(`.
    expect(s).not.toMatch(/[^a-zA-Z]fetch\(/);
  });

  it('links out to the full Live Map page instead of importing a map-rendering library', () => {
    const s = src();
    expect(s).toMatch(/href=\{TELEMATICS_ROUTES\.liveMap\}/);
    // No map-rendering library imported into the widget (a reference to
    // Leaflet in a comment, describing where the full map lives, is fine).
    expect(s).not.toMatch(/^import .*leaflet/im);
  });
});

describe('MapsWidget: counts are derived from fetched data, never fabricated', () => {
  it('computes total/moving/idle/offline from data.vehicles, not literals', () => {
    const s = src();
    expect(s).toMatch(/const vehicles = data\?\.vehicles \?\? \[\]/);
    expect(s).toMatch(/const total = vehicles\.length/);
    expect(s).toMatch(/vehicles\.filter\(\(v\) => v\.status === 'moving'\)\.length/);
    expect(s).toMatch(/vehicles\.filter\(\(v\) => v\.status === 'idle'\)\.length/);
    expect(s).toMatch(/vehicles\.filter\(\(v\) => v\.status === 'offline'\)\.length/);
  });

  it('distinguishes stale fixes from live ones (data-truth: stale must never read as live)', () => {
    const s = src();
    expect(s).toMatch(/const stale = vehicles\.filter\(\(v\) => v\.stale\)\.length/);
    // Only rendered when it is actually true of the fetched data -- an
    // empty/zero fleet must not show a fabricated "0 stale" claim either.
    expect(s).toMatch(/stale > 0 \? `[^`]*stale fix/);
  });

  it('an empty fleet renders an honest empty state, not a zeroed live one', () => {
    const s = src();
    expect(s).toMatch(/total > 0 \?/);
    expect(s).toMatch(/Live GPS tracking available once telematics is connected/);
  });

  it('demo-mode data is labelled, never presented as real fleet data', () => {
    const s = src();
    expect(s).toMatch(/data\?\.demoMode \? ' · demo data' : ''/);
  });
});

describe('MapsWidget: loading/error states are the shared DashboardWidget contract', () => {
  it('passes isLoading/isError/refetch through instead of reimplementing them', () => {
    const s = src();
    expect(s).toMatch(/isLoading=\{isLoading\}/);
    expect(s).toMatch(/isError=\{isError\}/);
    expect(s).toMatch(/onRefresh=\{\(\) => refetch\(\)\}/);
  });
});
