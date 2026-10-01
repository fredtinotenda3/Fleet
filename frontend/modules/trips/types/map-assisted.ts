// frontend/modules/trips/types/map-assisted.ts
//
// PART 3/4 -- client-side shapes for the map-assisted trip log. Kept
// separate from types/index.ts (which re-exports the Trip domain types)
// because these describe REQUEST/RESPONSE wire shapes for the two
// supporting endpoints (geocode search, route preview), not persisted
// Trip fields.

export interface GeocodeSearchCandidate {
  label: string;
  lat: number;
  lng: number;
  address?: string;
}

export interface GeocodeSearchResponse {
  candidates: GeocodeSearchCandidate[];
  cached: boolean;
}

export interface RoutePreviewRequestStop {
  sequence: number;
  lat: number;
  lng: number;
}

export interface RoutePreviewLeg {
  fromSequence: number;
  toSequence: number;
  distanceKm: number;
}

export type RoutePreviewResult =
  | {
      available: true;
      legs: RoutePreviewLeg[];
      totalDistanceKm: number;
      geometry: [number, number][];
    }
  | {
      available: false;
      reason: string;
    };
