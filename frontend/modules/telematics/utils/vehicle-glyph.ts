// frontend/modules/telematics/utils/vehicle-glyph.ts
//
// Vehicle-type glyphs for the live-map marker.
//
// ---------------------------------------------------------------------
// WHY SVG PATHS IN CODE RATHER THAN ASSET FILES
// ---------------------------------------------------------------------
// A marker is rebuilt on every poll for every vehicle. An <img> per
// marker means a request (or at least a cache lookup) per marker per
// refresh, and an icon that arrives a frame late produces a visible
// flicker across the whole fleet every ten seconds.
//
// More importantly, an external asset cannot inherit `currentColor`.
// Status colour on this map is carried by a CSS custom property so it
// re-themes without JavaScript -- see the note on STATUS_COLOR_VAR in
// LiveMapLeaflet.tsx about `fill="var(--success)"` silently failing
// inside an SVG presentation attribute. An inline path can use
// `currentColor`; a PNG cannot be recoloured at all.
//
// So: paths, in a 24x24 box, monochrome, no fills of their own.
//
// ---------------------------------------------------------------------
// WHY THE GLYPH IS DELIBERATELY SMALL
// ---------------------------------------------------------------------
// The thing a fleet manager reads off a live map at a glance is WHERE
// and WHICH WAY, not what body style the vehicle has. The heading wedge
// stays the dominant shape; the glyph sits inside the disc as a
// secondary cue that helps pick a forklift out of a row of trucks once
// you are already looking at a cluster.
//
// A glyph large enough to be read as an illustration would compete with
// the wedge and make the map worse at its primary job.

/** The vehicle silhouettes this map can draw. */
export type VehicleGlyph =
  | 'truck'
  | 'trailer'
  | 'forklift'
  | 'tractor'
  | 'generator'
  | 'light-vehicle'
  | 'bus'
  | 'motorcycle';

/**
 * The fallback.
 *
 * `Vehicle.vehicle_type` is a FREE-TEXT string, not an enum -- this
 * deployment's own data has `"Truck"` with inconsistent casing and
 * padding. So the resolver normalises and matches on substrings, and
 * anything it cannot place becomes a generic fleet truck rather than a
 * question mark: an unrecognised type is a gap in this lookup table, not
 * information the operator needs on the map.
 */
export const DEFAULT_GLYPH: VehicleGlyph = 'truck';

/**
 * Substring patterns per glyph, in priority order.
 *
 * ORDER MATTERS and the array is scanned in sequence: 'trailer' is
 * checked before 'truck' because "truck trailer" and "trailer truck"
 * both appear in real fleet data and the trailer is the more specific
 * classification. Likewise 'pickup' before 'truck' -- a pickup is a
 * light vehicle to a fleet manager, whatever the registration says.
 */
const GLYPH_PATTERNS: Array<{ glyph: VehicleGlyph; patterns: string[] }> = [
  { glyph: 'forklift', patterns: ['forklift', 'fork lift', 'telehandler', 'loader'] },
  { glyph: 'generator', patterns: ['generator', 'genset', 'gen set', 'compressor'] },
  { glyph: 'tractor', patterns: ['tractor', 'harvester', 'excavator', 'backhoe', 'grader', 'dozer'] },
  { glyph: 'trailer', patterns: ['trailer', 'semi', 'tanker', 'flatbed'] },
  { glyph: 'bus', patterns: ['bus', 'coach', 'minibus', 'kombi'] },
  { glyph: 'motorcycle', patterns: ['motorcycle', 'motorbike', 'bike', 'scooter'] },
  {
    glyph: 'light-vehicle',
    patterns: ['pickup', 'pick up', 'bakkie', 'car', 'sedan', 'hatch', 'suv', 'van', 'light'],
  },
  { glyph: 'truck', patterns: ['truck', 'lorry', 'rigid', 'haul'] },
];

/**
 * Free-text vehicle type -> glyph.
 *
 * Never throws and never returns null: the map must draw something for
 * every vehicle, and a missing marker is a worse answer than a generic
 * one.
 */
export function glyphForVehicleType(vehicleType?: string | null): VehicleGlyph {
  if (!vehicleType) return DEFAULT_GLYPH;

  // Fold case, collapse whitespace, drop punctuation -- this deployment
  // has values like "      DAF                  " and "Truck ".
  const normalised = vehicleType
    .toLowerCase()
    .replace(/[_\-/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalised) return DEFAULT_GLYPH;

  for (const { glyph, patterns } of GLYPH_PATTERNS) {
    if (patterns.some((p) => normalised.includes(p))) return glyph;
  }

  return DEFAULT_GLYPH;
}

/**
 * SVG path data for each glyph, drawn in a 24x24 box.
 *
 * Stroked, not filled, so the shapes stay legible at the ~12px they are
 * rendered at inside the marker disc. A filled silhouette at that size
 * collapses into a blob.
 */
const GLYPH_PATHS: Record<VehicleGlyph, string> = {
  // Cab + box body on two wheels.
  truck: 'M2 15V8h9v7M11 10h4l3 3v2M4 17.5h.01M9 17.5h.01M16 17.5h.01M2 15h16',
  // Tractor unit plus a long drawn trailer.
  trailer: 'M2 15V9h5v6M7 11h3l2 2M2 15h20v-1M13 15V8h9v7M5 17.5h.01M15 17.5h.01M19 17.5h.01',
  // Counterweight body with a vertical mast and forks.
  forklift: 'M3 16v-5h6v5M9 13h3M16 4v12M16 14h5M3 16h9M5 18h.01M10 18h.01',
  // Small front wheel, large rear wheel, cab.
  tractor: 'M4 14V9h6l2 4M14 13V8h4v6M4 14h14M6.5 17.5h.01M15.5 18.5h.01M12 13h6',
  // Rectangular skid-mounted unit with a stack.
  generator: 'M3 16V9h14v7M3 16h16M6 9V6h3v3M12 12h3M5 12h3M6 18h.01M15 18h.01',
  // Low three-box profile.
  'light-vehicle': 'M3 15v-3l2-4h9l3 4h3v3M3 15h17M6.5 17.5h.01M16 17.5h.01',
  // Long body, many windows.
  bus: 'M4 16V7h14v9M4 11h14M4 16h15M7 18h.01M15 18h.01M7 7v4M11 7v4M15 7v4',
  // Two wheels and a frame.
  motorcycle: 'M5 16.5h.01M18 16.5h.01M5 16.5a2.5 2.5 0 1 0 0-.01M18 16.5a2.5 2.5 0 1 0 0-.01M7 16l3-5h4l2 5M9 11h5',
};

/**
 * The glyph as an SVG `<path>` fragment, scaled and centred.
 *
 * Emits `currentColor` for the stroke so the marker's status colour
 * flows through, and NO fill -- a fill would swallow the interior
 * detail at marker size.
 *
 * @param size    the marker's edge length in px
 * @param scale   glyph size as a fraction of the marker
 */
export function glyphPathFragment(glyph: VehicleGlyph, size: number, scale = 0.46): string {
  const box = 24;
  const target = size * scale;
  const factor = target / box;
  const offset = (size - target) / 2;

  return (
    `<g transform="translate(${offset.toFixed(2)} ${offset.toFixed(2)}) scale(${factor.toFixed(4)})">` +
    `<path d="${GLYPH_PATHS[glyph]}" ` +
    `style="fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;" />` +
    `</g>`
  );
}

/** Human-readable glyph name, for the marker's accessible label. */
export function glyphLabel(glyph: VehicleGlyph): string {
  return glyph === 'light-vehicle' ? 'light vehicle' : glyph;
}
