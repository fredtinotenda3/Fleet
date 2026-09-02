// frontend/modules/leaderboard/components/AlertCategoryTiles.tsx
//
// The seven alert-category tiles.
//
// A tile has FOUR visual states, and the difference between two of them
// is the whole reason this component exists rather than a row of
// StatisticCards:
//
//   ready        a real number.
//   loading      skeleton.
//   error        em dash + why. The source answered with nothing usable.
//   unsupported  em dash + the endpoint that would fill it, permanently
//                greyed. No backend aggregation exists yet.
//
// 'error' and 'unsupported' both render an em dash and NEVER a zero.
// "0 geofence breaches" and "we cannot count geofence breaches" look
// identical as a number and mean opposite things to the person deciding
// whether to act. See ../utils/alert-category.utils.ts for the full
// rationale and the list of what was deliberately not done instead.

'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  Fuel,
  Gauge,
  MapPin,
  Receipt,
  ShieldAlert,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/frontend/shared/ui/data-display/card';
import { Skeleton } from '@/frontend/shared/ui/feedback/skeleton';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import type { AlertCategoryId, AlertCategoryTileModel } from '../types';
import { formatLeaderboardValue, NO_VALUE } from '../utils/leaderboard.utils';

/**
 * Kept in sync with ALERT_CATEGORY_DEFINITIONS in
 * ../utils/alert-category.utils.ts -- add a case here whenever a
 * category is added there. Typed as a total Record so TypeScript fails
 * the build on a missing entry rather than rendering a tile with no
 * icon.
 */
const CATEGORY_ICON: Record<AlertCategoryId, LucideIcon> = {
  overspeed: Gauge,
  harsh_braking: AlertTriangle,
  geofence: MapPin,
  low_fuel: Fuel,
  maintenance_due: Wrench,
  fuel_fraud: ShieldAlert,
  expense_anomaly: Receipt,
};

interface AlertCategoryTilesProps {
  tiles: ReadonlyArray<AlertCategoryTileModel>;
  /** Extra caption for a specific tile, e.g. "12 more scheduled ahead" under Maintenance due. */
  captions?: Partial<Record<AlertCategoryId, string | undefined>>;
}

export function AlertCategoryTiles({ tiles, captions }: AlertCategoryTilesProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((tile) => (
        <AlertCategoryTile key={tile.id} tile={tile} caption={captions?.[tile.id]} />
      ))}
    </div>
  );
}

interface AlertCategoryTileProps {
  tile: AlertCategoryTileModel;
  caption?: string;
}

export function AlertCategoryTile({ tile, caption }: AlertCategoryTileProps) {
  const Icon = CATEGORY_ICON[tile.id];
  const unsupported = tile.state === 'unsupported';
  // Only a ready tile links anywhere. A link from a tile with no number
  // promises a list of items the destination cannot show.
  const href = tile.state === 'ready' ? tile.href : undefined;

  const body = (
    <Card
      className={cn(
        'h-full transition-shadow',
        unsupported ? 'border-dashed opacity-70' : 'hover:shadow-md',
        href && 'cursor-pointer'
      )}
      aria-disabled={unsupported || undefined}
    >
      {/* No padding override: Card already supplies py-(--card-spacing) and
          CardContent px-(--card-spacing). A `p-*` here would win over the
          latter through tailwind-merge and then stack with the former,
          double-padding the tile vertically against every other card on
          the page. */}
      <CardContent className="space-y-1">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-medium text-foreground">{tile.label}</span>
          <Icon
            className={cn('size-4 shrink-0', unsupported ? 'text-muted-foreground/60' : 'text-muted-foreground')}
            aria-hidden="true"
          />
        </div>

        {tile.state === 'loading' ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <div
            className={cn(
              'text-2xl font-bold leading-tight',
              tile.count === null ? 'text-muted-foreground' : 'text-foreground'
            )}
          >
            {tile.count === null ? NO_VALUE : formatLeaderboardValue(tile.count, tile.format)}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {tile.state === 'ready' ? (caption ?? tile.description) : (tile.unavailableReason ?? tile.description)}
        </p>

        {unsupported && (
          <Badge variant="outline" className="mt-1 max-w-full">
            <span className="truncate">Endpoint required</span>
          </Badge>
        )}
      </CardContent>
    </Card>
  );

  if (!href) {
    return body;
  }

  return (
    <Link href={href} className="block rounded-xl focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
      {body}
    </Link>
  );
}
