// frontend/modules/vehicles/components/operations/VehicleInstrumentCluster.tsx
//
// ---------------------------------------------------------------------
// THE CLUSTER
// ---------------------------------------------------------------------
// Assembles the dials for ONE vehicle from its live telemetry. It is
// deliberately thin: every decision it could get wrong lives in a pure,
// tested module beside it --
//
//   signal-state.ts     is this a measurement, or is it missing?
//   vehicle-profile.ts  what scale does THIS vehicle's dial use?
//   gauge-geometry.ts   where does the needle go?
//
// ---------------------------------------------------------------------
// WHAT IT REFUSES TO DO
// ---------------------------------------------------------------------
//   * It never fabricates a signal. Every value is lifted through
//     `fromReading`, so `null`/`undefined`/`NaN` becomes UNAVAILABLE and
//     draws no needle at all. A gauge resting at zero is a reading of
//     zero, and "0 rpm" reads as a stalled engine.
//   * It never animates a stale fix. Motion is a claim of liveness;
//     `freshnessCopy().animate` is the single place that decides, and it
//     grants it only to a fix under two minutes old.
//   * It never shows a tachometer on an electric drivetrain. That is
//     NOT-APPLICABLE, not UNAVAILABLE — a dead dial implies a fault
//     that does not exist. The profile omits the range entirely.
//   * It never invents a scale. Dial ranges come from the vehicle's
//     class; a 200 km/h speedometer on a 40-tonne rigid is the most
//     obvious tell that a cluster is decorative.
//
// ---------------------------------------------------------------------
// COSTS ONE REQUEST
// ---------------------------------------------------------------------
// `useVehicleDetail` is a per-vehicle endpoint that already existed and
// was only ever called from the fleet live-map page. The alternative
// pattern in this codebase — fetch the whole fleet and `.find()` the one
// vehicle — would pull every vehicle's telemetry to render one, which
// §12.3 rules out for a vehicle-scoped screen.

'use client';

import { AlertTriangle, Gauge as GaugeIcon, Power, PowerOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { Skeleton } from '@/frontend/shared/ui/feedback/skeleton';
import { cn } from '@/lib/utils';
import { Gauge, LinearGauge } from '@/frontend/shared/ui/instruments/Gauge';
import {
  freshnessCopy,
  freshnessFor,
  fromReading,
  notApplicable,
  unavailable,
} from '@/frontend/shared/ui/instruments/signal-state';
import { useVehicleDetail } from '@/frontend/modules/telematics/hooks/useLiveMap';
import { vehicleProfileFor } from '../../utils/vehicle-profile';

interface VehicleInstrumentClusterProps {
  vehicleId: string;
  /** Free text from the vehicle record; drives the dial scales. */
  vehicleType?: string | null;
  /** Free text; an electric drivetrain removes the tachometer. */
  fuelType?: string | null;
  /** False when no tracking device is mapped — a different state from a silent one. */
  isTracked?: boolean;
}

export function VehicleInstrumentCluster({
  vehicleId,
  vehicleType,
  fuelType,
  isTracked = true,
}: VehicleInstrumentClusterProps) {
  const { data: detail, isLoading, isError } = useVehicleDetail(vehicleId);
  const profile = vehicleProfileFor(vehicleType, fuelType);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Live instruments</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  /*
    A failed request is NOT an untracked vehicle and NOT a vehicle at
    rest. Rendering dead gauges here would say "this vehicle reports
    nothing", which is a claim about the customer's hardware made on the
    strength of our own request failing.
  */
  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Live instruments</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-2 py-6 text-body-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-warning" aria-hidden="true" />
            <p className="text-muted-foreground">
              Couldn&apos;t load live telemetry. This is a problem reading the data, not a report
              that the vehicle is silent.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const fixAgeSeconds = detail?.fixAgeSeconds ?? null;
  const freshness = freshnessFor(fixAgeSeconds, { isTracked });
  const copy = freshnessCopy(freshness, fixAgeSeconds);

  // Motion only for a genuinely live fix. Everything else is frozen at
  // the moment it was recorded and is shown as such.
  const animate = copy.animate;

  const engine = detail?.engine;
  const ignition = detail?.ignition;

  const speed = fromReading(detail?.location?.speed, {
    at: detail?.location ? new Date(detail.location.timestamp) : undefined,
  });
  const rpm = profile.isElectric
    ? notApplicable<number>('an electric drivetrain has no engine speed')
    : fromReading(engine?.rpm, { reason: 'this tracker does not report engine speed' });
  const coolant = fromReading(engine?.coolantTemp, {
    reason: 'this tracker does not report coolant temperature',
  });
  const fuelLevel = fromReading(engine?.fuelLevel, {
    reason: 'no fuel-level sender is fitted or reported',
  });
  const battery = fromReading(detail?.deviceHealth?.powerVoltage, {
    reason: 'this tracker does not report vehicle supply voltage',
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-1.5 text-sm font-medium">
            <GaugeIcon className="w-4 h-4" aria-hidden="true" />
            Live instruments
          </CardTitle>
          <p className="mt-1 text-caption text-muted-foreground">
            {/*
              The dial scale is stated, because a reader who knows the
              vehicle should be able to tell whether the instrument is
              scaled for it — and because the scale is inferred from
              free text and can therefore be wrong.
            */}
            Scaled for a {profile.label.toLowerCase()}
            {profile.isElectric && ' · electric drivetrain'}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/*
            Ignition, first-class at last. Until this round the signal
            was read from the provider and discarded at ingest, so the
            product could not distinguish an idling vehicle from a
            parked one — which is the distinction the idle metric IS.
          */}
          {ignition === true && (
            <span className="inline-flex items-center gap-1 rounded-full bg-success-bg px-2 py-0.5 text-caption text-success">
              <Power className="h-3 w-3" aria-hidden="true" />
              Engine on
            </span>
          )}
          {ignition === false && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-caption text-muted-foreground">
              <PowerOff className="h-3 w-3" aria-hidden="true" />
              Engine off
            </span>
          )}

          <span
            title={copy.description}
            className={cn(
              'rounded-full px-2 py-0.5 text-caption font-medium',
              copy.tone === 'positive' && 'bg-success-bg text-success',
              copy.tone === 'neutral' && 'bg-muted text-muted-foreground',
              copy.tone === 'warning' && 'bg-warning-bg text-warning',
              copy.tone === 'danger' && 'bg-danger-bg text-danger'
            )}
          >
            {copy.label}
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/*
          The freshness sentence is shown, not just hovered. A frozen
          gauge that LOOKS live is the failure mode this whole block
          exists to avoid, and a tooltip is not seen by someone glancing
          at a screen.
        */}
        {freshness !== 'live' && (
          <p
            className={cn(
              'rounded-md px-3 py-2 text-caption',
              copy.tone === 'danger'
                ? 'bg-danger-bg text-danger'
                : copy.tone === 'warning'
                  ? 'bg-warning-bg text-warning'
                  : 'bg-muted text-muted-foreground'
            )}
          >
            {copy.description}
          </p>
        )}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Gauge
            label="Speed"
            signal={speed}
            range={profile.speed}
            unit="km/h"
            majorEvery={profile.speed.max <= 60 ? 10 : profile.speed.max <= 140 ? 20 : 40}
            animate={animate}
          />

          {/*
            An EV renders no tachometer at all rather than a blank one.
            `profile.rpm` is undefined for an electric drivetrain, and
            the signal says NOT-APPLICABLE, so the two agree.
          */}
          {profile.rpm ? (
            <Gauge
              label="Engine speed"
              signal={rpm}
              range={profile.rpm}
              unit="rpm"
              scaleDivisor={1000}
              scaleNote="×1000"
              majorEvery={profile.rpm.max <= 3500 ? 500 : profile.rpm.max <= 7000 ? 1000 : 2000}
              animate={animate}
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-1 p-4 text-center rounded-lg border border-dashed border-border">
              <p className="text-body-sm text-foreground">Engine speed</p>
              <p className="text-caption text-muted-foreground">
                Not applicable — this vehicle has an electric drivetrain.
              </p>
            </div>
          )}

          <Gauge
            label="Coolant"
            signal={coolant}
            range={profile.coolant}
            unit="°C"
            majorEvery={20}
            animate={animate}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
          <LinearGauge label="Fuel level" signal={fuelLevel} range={profile.fuel} unit="%" />
          <LinearGauge
            label="Supply voltage"
            signal={battery}
            range={profile.battery}
            unit="V"
            decimals={1}
          />
        </div>

        {/*
          Absent signals are named rather than silently omitted. An
          operator who cannot see a coolant gauge should learn that the
          tracker does not send one, not conclude the feature is broken.
        */}
        <UnreportedNote
          items={[
            !profile.isElectric && rpm.provenance === 'unavailable' ? 'engine speed' : null,
            coolant.provenance === 'unavailable' ? 'coolant temperature' : null,
            fuelLevel.provenance === 'unavailable' ? 'fuel level' : null,
            battery.provenance === 'unavailable' ? 'supply voltage' : null,
            ignition === undefined ? 'ignition' : null,
          ].filter((x): x is string => Boolean(x))}
        />
      </CardContent>
    </Card>
  );
}

function UnreportedNote({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  const list =
    items.length === 1
      ? items[0]
      : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

  return (
    <p className="pt-1 border-t border-border text-caption text-muted-foreground">
      This tracker does not report {list}. Those dials stay empty rather than showing zero — an
      absent signal is not a reading.
    </p>
  );
}

export { unavailable };
