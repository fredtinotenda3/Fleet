// tests/unit/telematics/live-map-markers.spec.ts
//
// The marker's two new behaviours -- a vehicle-type silhouette, and
// smooth movement between polls -- are both pure functions precisely so
// they can be tested here. jest runs testEnvironment:'node' with no
// jsdom, so nothing in this repo can render a Leaflet map in a test; the
// decisions therefore live in utils/ and the component stays plumbing.

import {
  glyphForVehicleType,
  glyphPathFragment,
  glyphLabel,
  DEFAULT_GLYPH,
} from '../../../frontend/modules/telematics/utils/vehicle-glyph';
import {
  planMovement,
  sampleTrack,
  advanceTracks,
  lerpPosition,
  approximateDegreeDistance,
  DEFAULT_ANIMATION_MS,
  SNAP_DISTANCE_DEG,
  IGNORE_DISTANCE_DEG,
  type InterpolationTrack,
} from '../../../frontend/modules/telematics/utils/marker-interpolation';

describe('glyphForVehicleType', () => {
  it.each([
    ['Truck', 'truck'],
    ['lorry', 'truck'],
    ['Forklift', 'forklift'],
    ['fork lift', 'forklift'],
    ['Telehandler', 'forklift'],
    ['Generator', 'generator'],
    ['genset', 'generator'],
    ['Tractor', 'tractor'],
    ['Excavator', 'tractor'],
    ['Trailer', 'trailer'],
    ['Tanker', 'trailer'],
    ['Bakkie', 'light-vehicle'],
    ['Sedan', 'light-vehicle'],
    ['SUV', 'light-vehicle'],
    ['Bus', 'bus'],
    ['Motorcycle', 'motorcycle'],
  ])('maps %s to %s', (input, expected) => {
    expect(glyphForVehicleType(input)).toBe(expected);
  });

  it('REGRESSION: tolerates the padding and casing in real data', () => {
    // This deployment's tblvehicles literally contains
    // `"      DAF                  "` and `"Truck "`.
    expect(glyphForVehicleType('  Truck  ')).toBe('truck');
    expect(glyphForVehicleType('TRUCK')).toBe('truck');
    expect(glyphForVehicleType('light_vehicle')).toBe('light-vehicle');
    expect(glyphForVehicleType('semi-trailer')).toBe('trailer');
  });

  it('prefers the more specific classification', () => {
    // Order in the pattern table matters: both words appear in real
    // fleet data and the trailer is the more specific answer.
    expect(glyphForVehicleType('truck trailer')).toBe('trailer');
    expect(glyphForVehicleType('trailer truck')).toBe('trailer');
    // A pickup is a light vehicle to a fleet manager, whatever the
    // registration document says.
    expect(glyphForVehicleType('pickup truck')).toBe('light-vehicle');
  });

  it('falls back to a generic truck rather than failing', () => {
    // An unrecognised type is a gap in the lookup table, not information
    // the operator needs on the map. A missing marker would be worse.
    expect(glyphForVehicleType(undefined)).toBe(DEFAULT_GLYPH);
    expect(glyphForVehicleType(null)).toBe(DEFAULT_GLYPH);
    expect(glyphForVehicleType('')).toBe(DEFAULT_GLYPH);
    expect(glyphForVehicleType('   ')).toBe(DEFAULT_GLYPH);
    expect(glyphForVehicleType('DAF')).toBe(DEFAULT_GLYPH);
    expect(glyphForVehicleType('zzz-unknown')).toBe(DEFAULT_GLYPH);
  });
});

describe('glyphPathFragment', () => {
  it('emits currentColor so the marker re-themes without JavaScript', () => {
    // The lesson from `fill="var(--success)"` inside an SVG presentation
    // attribute, which silently fell back and painted every marker grey.
    const svg = glyphPathFragment('truck', 34);
    expect(svg).toContain('stroke:currentColor');
  });

  it('is stroked, not filled', () => {
    // A filled silhouette collapses into a blob at ~12px.
    expect(glyphPathFragment('truck', 34)).toContain('fill:none');
  });

  it('scales and centres inside the marker', () => {
    const svg = glyphPathFragment('truck', 34, 0.5);
    expect(svg).toMatch(/translate\(8\.50 8\.50\)/);
    expect(svg).toMatch(/scale\(0\.7083\)/);
  });

  it('produces a path for every glyph', () => {
    for (const type of ['Truck', 'Trailer', 'Forklift', 'Tractor', 'Generator', 'Sedan', 'Bus', 'Motorcycle']) {
      const svg = glyphPathFragment(glyphForVehicleType(type), 34);
      expect(svg).toMatch(/<path d="M[^"]+"/);
    }
  });
});

describe('glyphLabel', () => {
  it('reads naturally in an accessible label', () => {
    expect(glyphLabel('light-vehicle')).toBe('light vehicle');
    expect(glyphLabel('truck')).toBe('truck');
  });
});

// ── interpolation ────────────────────────────────────────────────────

const HARARE = { lat: -17.82, lng: 31.05 };
const near = (dLat: number) => ({ lat: HARARE.lat + dLat, lng: HARARE.lng });

describe('planMovement', () => {
  it('snaps a vehicle seen for the first time', () => {
    // Placing it, not flying it in from nowhere.
    const plan = planMovement(undefined, HARARE, { now: 0 });
    expect(plan).toEqual({ action: 'snap', to: HARARE });
  });

  it('animates an ordinary movement between polls', () => {
    const plan = planMovement(HARARE, near(0.0015), { now: 1_000 });
    expect(plan.action).toBe('animate');
    if (plan.action === 'animate') {
      expect(plan.track.from).toEqual(HARARE);
      expect(plan.track.startedAt).toBe(1_000);
      expect(plan.track.durationMs).toBe(DEFAULT_ANIMATION_MS);
    }
  });

  it('REGRESSION: ignores GPS jitter on a stationary vehicle', () => {
    // A few metres every poll. Animating it makes an entire parked fleet
    // shimmer, which reads as activity where there is none.
    const plan = planMovement(HARARE, near(IGNORE_DISTANCE_DEG / 2), { now: 0 });
    expect(plan.action).toBe('ignore');
  });

  it('REGRESSION: snaps rather than sliding across an implausible jump', () => {
    // A vehicle 5+ km away did not drive there in 10 seconds -- it is a
    // device coming back online or a corrected fix. Sliding the marker
    // smoothly asserts a journey that did not happen.
    const plan = planMovement(HARARE, near(SNAP_DISTANCE_DEG * 2), { now: 0 });
    expect(plan.action).toBe('snap');
  });

  it('honours a caller-supplied duration', () => {
    const plan = planMovement(HARARE, near(0.001), { now: 0, durationMs: 500 });
    if (plan.action === 'animate') expect(plan.track.durationMs).toBe(500);
    else throw new Error('expected animate');
  });
});

describe('sampleTrack', () => {
  const track: InterpolationTrack = {
    from: { lat: 0, lng: 0 },
    to: { lat: 10, lng: 20 },
    startedAt: 1_000,
    durationMs: 1_000,
  };

  it('is at the origin before it starts', () => {
    expect(sampleTrack(track, 1_000)).toEqual({ position: { lat: 0, lng: 0 }, done: false });
  });

  it('is halfway at the midpoint', () => {
    const { position } = sampleTrack(track, 1_500);
    expect(position.lat).toBeCloseTo(5);
    expect(position.lng).toBeCloseTo(10);
  });

  it('lands EXACTLY on the target, not merely near it', () => {
    // The marker must come to rest on the real fix. A value very close
    // to it would leave every marker permanently a few metres off.
    expect(sampleTrack(track, 2_000)).toEqual({ position: { lat: 10, lng: 20 }, done: true });
    expect(sampleTrack(track, 9_999)).toEqual({ position: { lat: 10, lng: 20 }, done: true });
  });

  it('REGRESSION: never overshoots past the target', () => {
    // Extrapolation is the thing this module refuses to do -- a marker
    // beyond the last known fix is an invented position drawn
    // identically to a measured one.
    const { position } = sampleTrack(track, 5_000);
    expect(position.lat).toBe(10);
    expect(position.lng).toBe(20);
  });
});

describe('lerpPosition', () => {
  it('clamps outside [0, 1]', () => {
    const from = { lat: 0, lng: 0 };
    const to = { lat: 10, lng: 10 };
    expect(lerpPosition(from, to, -1)).toEqual(from);
    expect(lerpPosition(from, to, 2)).toEqual(to);
  });
});

describe('advanceTracks', () => {
  it('advances every track in one pass', () => {
    // One pass for the whole fleet is the property: a timer per marker
    // is how a live map becomes unusable at 500 vehicles.
    const tracks = new Map<string, InterpolationTrack>([
      ['a', { from: { lat: 0, lng: 0 }, to: { lat: 10, lng: 0 }, startedAt: 0, durationMs: 1_000 }],
      ['b', { from: { lat: 0, lng: 0 }, to: { lat: 0, lng: 20 }, startedAt: 0, durationMs: 1_000 }],
    ]);

    const { positions, finished } = advanceTracks(tracks, 500);
    expect(positions.size).toBe(2);
    expect(positions.get('a')!.lat).toBeCloseTo(5);
    expect(positions.get('b')!.lng).toBeCloseTo(10);
    expect(finished).toEqual([]);
  });

  it('reports finished tracks so they can be dropped', () => {
    // A completed track left in the map would be re-sampled forever,
    // keeping the animation loop alive on a stationary fleet.
    const tracks = new Map<string, InterpolationTrack>([
      ['a', { from: { lat: 0, lng: 0 }, to: { lat: 10, lng: 0 }, startedAt: 0, durationMs: 100 }],
    ]);
    const { finished } = advanceTracks(tracks, 1_000);
    expect(finished).toEqual(['a']);
  });

  it('handles an empty set without work', () => {
    const { positions, finished } = advanceTracks(new Map(), 0);
    expect(positions.size).toBe(0);
    expect(finished).toEqual([]);
  });
});

describe('approximateDegreeDistance', () => {
  it('is zero for the same point and grows with separation', () => {
    expect(approximateDegreeDistance(HARARE, HARARE)).toBe(0);
    expect(approximateDegreeDistance(HARARE, near(0.01))).toBeGreaterThan(
      approximateDegreeDistance(HARARE, near(0.001))
    );
  });
});
