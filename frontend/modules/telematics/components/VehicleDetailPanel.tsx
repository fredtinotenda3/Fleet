// frontend/modules/telematics/components/VehicleDetailPanel.tsx
//
// Shows every live telemetry field already ingested and stored for the
// selected vehicle -- not just the compact speed/fuel shown on the map
// marker and vehicle list. Backed by GET
// /api/telematics/live-map/vehicle/[vehicleId] (see useVehicleDetail),
// which reads the vehicle's latest TelematicsData row through the same
// org-unit-scoped path the rest of the live map uses.
//
// A field with no value for this vehicle (device doesn't report it,
// provider doesn't populate providerMetadata, etc.) renders "No data"
// rather than a bare 0/blank, which would read as a real reading of
// zero -- see LiveMapVehicleDetail's doc comment for which fields are
// optional for exactly this reason.

'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, Clock, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { Button } from '@/frontend/shared/ui/primitives/button';
import type {
  LiveMapVehicle,
  LiveMapVehicleDetail,
  LiveMapVehicleStatus,
  LiveMapDataSource,
  EagleTrackFuelReport,
} from '../types';

interface VehicleDetailPanelProps {
  vehicle: LiveMapVehicle;
  detail: LiveMapVehicleDetail | null | undefined;
  isLoading: boolean;
  onClose: () => void;
  className?: string;
  /**
   * The provider's period fuel report, when the caller has FUEL_VIEW and
   * the vehicle is on a provider that publishes one.
   *
   * Passed in rather than fetched here so this component stays a pure
   * render of what it is given -- the same reason `detail` is a prop.
   * Undefined means "not requested"; a report with `providerError` set
   * means "requested and the vendor could not be reached", and the two
   * render differently.
   */
  fuelReport?: EagleTrackFuelReport | null;
  fuelReportLoading?: boolean;
}

const STATUS_BADGE: Record<LiveMapVehicleStatus, { label: string; className: string }> = {
  moving: { label: 'Moving', className: 'bg-success-bg text-success' },
  idle: { label: 'Idle', className: 'bg-warning-bg text-warning' },
  offline: { label: 'Offline', className: 'bg-muted text-muted-foreground' },
};

const SOURCE_LABEL: Record<LiveMapDataSource, string> = {
  cartrack: 'Cartrack',
  eagletrack: 'Eagle Track',
  demo: 'Demo',
  unavailable: 'Unavailable',
};

/** A single label/value row. Renders "No data" (muted) when `value` is null/undefined rather than letting a caller accidentally pass a misleading 0. */
/** Shown when a position was geocoded and no address could be determined. Never a guess. */
const ADDRESS_UNAVAILABLE = 'Address unavailable';

/**
 * Totals one numeric column of a fuel report.
 *
 * Returns undefined -- not 0 -- when NO row carried the field, so a
 * column the provider does not report renders "No data" instead of a
 * confident zero. Rows that carry it are summed; rows that do not are
 * skipped rather than treated as zeroes, which would understate a total
 * across a partially-reported window.
 */
function sumRows(
  report: EagleTrackFuelReport,
  key: 'distanceKm' | 'refuelledLitres' | 'drainedLitres' | 'refuelEventCount' | 'drainEventCount'
): number | undefined {
  return report.rows.reduce<number | undefined>(
    (sum, row) => (typeof row[key] === 'number' ? (sum ?? 0) + (row[key] as number) : sum),
    undefined
  );
}

/**
 * The last odometer reading in the report, not a sum.
 *
 * Odometers are cumulative, so adding them across period rows produces a
 * number in the hundreds of thousands that looks entirely plausible and
 * is meaningless -- the exact shape of mistake sumRows exists for the
 * OPPOSITE of. Rows are taken in the order the provider returned them.
 */
function lastOdometer(report: EagleTrackFuelReport): number | undefined {
  for (let i = report.rows.length - 1; i >= 0; i -= 1) {
    const value = report.rows[i].endOdometerKm;
    if (typeof value === 'number') return value;
  }
  return undefined;
}

/** Formats a fuel-cost total with whatever currency marking the provider actually sent. Never invents one. */
function formatCost(total: EagleTrackFuelReport['fuelCostTotal']): string | null {
  if (!total || !Number.isFinite(total.amount)) return null;
  const amount = total.amount.toFixed(2);
  if (total.currencyCode) return `${amount} ${total.currencyCode}`;
  if (total.currencySymbol) return `${total.currencySymbol}${amount}`;
  return amount;
}

function Stat({ label, value }: { label: string; value: string | number | null | undefined }) {
  const hasValue = value !== null && value !== undefined && value !== '';
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-caption text-muted-foreground">{label}</span>
      <span className={cn('text-body-sm text-right', hasValue ? 'text-foreground font-medium' : 'text-muted-foreground italic')}>
        {hasValue ? value : 'No data'}
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <h4 className="text-caption font-medium uppercase tracking-wide text-muted-foreground">{title}</h4>
      <div className="divide-y divide-border/60">{children}</div>
    </div>
  );
}

/**
 * Formats an optional numeric reading, or returns null so `Stat` renders
 * "No data".
 *
 * Every telemetry member is optional now (see TelematicsData) precisely
 * so this distinction survives to the UI: `num(0, '%')` still renders
 * "0%" because a reported zero is real, while `num(undefined, '%')`
 * renders "No data". A `?? 0` anywhere in this file would collapse the
 * two back together and undo the whole change.
 */
function num(
  value: number | undefined,
  suffix = '',
  format: (n: number) => string | number = Math.round
): string | null {
  return typeof value === 'number' && Number.isFinite(value) ? `${format(value)}${suffix}` : null;
}

const oneDp = (n: number) => n.toFixed(1);

function formatFixAge(seconds: number | null): string | null {
  if (seconds === null) return null;
  if (seconds < 60) return `${Math.round(seconds)}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  return `${Math.round(seconds / 3600)}h ago`;
}

export function VehicleDetailPanel({
  vehicle,
  detail,
  isLoading,
  onClose,
  className,
  fuelReport,
  fuelReportLoading,
}: VehicleDetailPanelProps) {
  const status = STATUS_BADGE[vehicle.status];

  return (
    <div className={cn('surface-card p-4 space-y-4', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-medium text-foreground truncate">{vehicle.licensePlate}</h3>
            <Badge className={status.className}>{status.label}</Badge>
            {vehicle.alert && (
              <Badge className="gap-1 bg-danger-bg text-danger">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                Alert
              </Badge>
            )}
            {/* Secondary indicator, shown next to the status rather than
                replacing it -- an old fix does not by itself mean the
                vehicle stopped reporting. */}
            {vehicle.stale && (
              <Badge variant="outline" className="gap-1 text-muted-foreground">
                <Clock className="h-3 w-3" aria-hidden="true" />
                Stale fix
              </Badge>
            )}
            <Badge variant="outline">{SOURCE_LABEL[vehicle.source]}</Badge>
          </div>
          <p className="text-body-sm text-muted-foreground truncate">
            {vehicle.make} {vehicle.model}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close vehicle detail">
          <X className="w-4 h-4" aria-hidden="true" />
        </Button>
      </div>

      {isLoading && !detail ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        </div>
      ) : !detail ? (
        <p className="py-6 text-center text-body-sm text-muted-foreground">
          No telemetry has been recorded for this vehicle yet.
        </p>
      ) : (
        <div className="space-y-4">
          {detail.alert && (
            <div className="p-3 border rounded-lg border-danger-border bg-danger-bg">
              <div className="flex items-center gap-2 text-danger">
                <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span className="font-medium text-body-sm">
                  Alert · {detail.alert.severity}
                </span>
              </div>
              <ul className="mt-1 space-y-0.5 text-caption text-foreground/80 list-disc list-inside">
                {detail.alert.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Section title="Location">
              <Stat label="Latitude" value={detail.location ? detail.location.lat.toFixed(5) : null} />
              <Stat label="Longitude" value={detail.location ? detail.location.lng.toFixed(5) : null} />
              <Stat label="Speed" value={num(detail.location?.speed, ' km/h')} />
              {/* Heading is optional at the source -- a device that
                  reports no bearing shows "No data" rather than 0° (due
                  north), which would be a confidently wrong reading. */}
              <Stat label="Heading" value={num(detail.location?.heading, '\u00b0')} />
              <Stat label="Last ping" value={formatFixAge(detail.fixAgeSeconds)} />
              {/* Three-state, and the distinction matters: a string is a
                  resolved address, null means we asked and could not
                  determine one, and absent means the vehicle has no
                  position to look up. Only the middle case reads
                  "Address unavailable" -- we never show a nearby-but-
                  wrong road. See reverse-geocode.service.ts. */}
              {detail.location ? (
                <Stat
                  label="Address"
                  value={detail.address ? detail.address : ADDRESS_UNAVAILABLE}
                />
              ) : null}
            </Section>

            <Section title="Odometer & trip">
              <Stat label="Odometer" value={num(detail.odometer, ' km')} />
              <Stat label="Trip distance" value={num(detail.trip?.tripDistance, ' km', oneDp)} />
              <Stat label="Trip duration" value={num(detail.trip?.tripDuration, ' min')} />
              <Stat label="Average speed" value={num(detail.trip?.averageSpeed, ' km/h')} />
              <Stat label="Max speed" value={num(detail.trip?.maxSpeed, ' km/h')} />
              <Stat label="Idle time" value={num(detail.trip?.idleTime, ' min')} />
            </Section>

            <Section title="Engine">
              <Stat label="Fuel level" value={num(detail.engine?.fuelLevel, '%')} />
              <Stat label="RPM" value={num(detail.engine?.rpm)} />
              <Stat label="Coolant temp" value={num(detail.engine?.coolantTemp, '\u00b0C')} />
              <Stat label="Throttle" value={num(detail.engine?.throttlePosition, '%')} />
              <Stat label="Engine load" value={num(detail.engine?.engineLoad, '%')} />
              <Stat
                label="Fault codes"
                value={detail.engine?.dtcCodes && detail.engine.dtcCodes.length > 0 ? detail.engine.dtcCodes.join(', ') : null}
              />
            </Section>

            <Section title="Fuel">
              <Stat label="Consumption rate" value={num(detail.fuel?.consumptionRate, ' L/100km', oneDp)} />
              <Stat label="Instant consumption" value={num(detail.fuel?.instantConsumption, ' L/h', oneDp)} />
              <Stat label="Fuel used" value={num(detail.fuel?.fuelUsed, ' L', oneDp)} />
            </Section>

            {/* The provider's PERIOD fuel report, distinct from the live
                fuel readings above. Rendered only when it was requested,
                so a role without FUEL_VIEW simply does not see the
                section rather than seeing an empty one. */}
            {fuelReportLoading || fuelReport ? (
              <Section title="Fuel report (last 7 days)">
                {fuelReportLoading ? (
                  <p className="text-xs text-muted-foreground">Loading fuel report...</p>
                ) : fuelReport?.providerError ? (
                  // Named as a provider problem rather than shown as
                  // zeroes: "0 L consumed" and "we could not ask" lead
                  // to opposite operational conclusions.
                  <p className="text-xs text-muted-foreground">Fuel report unavailable from provider.</p>
                ) : !fuelReport?.uin ? (
                  <p className="text-xs text-muted-foreground">No Eagle Track tracker on this vehicle.</p>
                ) : (
                  <>
                    <Stat label="Fuel consumed" value={num(fuelReport.canonicalFuel.fuelUsed, ' L', oneDp)} />
                    <Stat
                      label="Consumption"
                      value={num(fuelReport.canonicalFuel.consumptionRate, ' L/100km', oneDp)}
                    />
                    <Stat label="Fuel cost" value={formatCost(fuelReport.fuelCostTotal)} />
                    <Stat label="Distance" value={num(sumRows(fuelReport, 'distanceKm'), ' km', oneDp)} />
                    <Stat label="Odometer" value={num(lastOdometer(fuelReport), ' km', oneDp)} />
                    <Stat label="Refuelled" value={num(sumRows(fuelReport, 'refuelledLitres'), ' L', oneDp)} />
                    <Stat label="Refuelling events" value={num(sumRows(fuelReport, 'refuelEventCount'))} />
                    <Stat label="Drained" value={num(sumRows(fuelReport, 'drainedLitres'), ' L', oneDp)} />
                    <Stat label="Fuel loss events" value={num(sumRows(fuelReport, 'drainEventCount'))} />
                    {/* Qualifications on the figures above. Shown, not
                        swallowed: the server flags a report that is a
                        partial slice, or that contained another
                        tracker's rows, precisely so the totals are not
                        read as more complete than they are. */}
                    {fuelReport.providerWarnings.length > 0 ? (
                      <ul className="pt-1.5 space-y-1">
                        {fuelReport.providerWarnings.map((warning) => (
                          <li key={warning.code} className="text-caption text-muted-foreground">
                            {warning.detail}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </>
                )}
              </Section>
            ) : null}

            <Section title="Device health">
              <Stat label="Battery charge" value={num(detail.deviceHealth?.batteryPercent, '%')} />
              <Stat label="Battery voltage" value={num(detail.deviceHealth?.batteryVoltage, ' V', oneDp)} />
              <Stat label="Supply voltage" value={num(detail.deviceHealth?.powerVoltage, ' V', oneDp)} />
              <Stat label="GSM signal" value={num(detail.deviceHealth?.gsmQuality, '/31')} />
              <Stat label="GPS satellites" value={num(detail.deviceHealth?.gpsSatellites)} />
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}