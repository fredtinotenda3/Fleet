// modules/search/services/global-search.service.ts
//
// One search box that finds RECORDS, not just pages.
//
// ---------------------------------------------------------------------
// WHAT EXISTED, AND WHAT DID NOT
// ---------------------------------------------------------------------
// The Ctrl/Cmd-K palette already existed, was already permission-gated,
// and searched a static list of NAVIGATION COMMANDS. Typing "AFU0078"
// into it found nothing, because no part of this product could search
// its own data.
//
// So this is deliberately narrow: it adds record search and reuses the
// palette as the surface, rather than standing up a second search UI.
//
// ---------------------------------------------------------------------
// THE THREE RULES IT CANNOT BREAK
// ---------------------------------------------------------------------
//  1. PERMISSION PER SOURCE. Each source is gated on the permission its
//     own list endpoint enforces, checked BEFORE the query runs. A
//     dispatcher searching for a work order gets no work-order results,
//     because they cannot read the work-order list either. A search box
//     that returns a row the user cannot open is an information leak
//     dressed as a convenience.
//  2. ORG-UNIT SCOPE, from the SHARED predicate. Every query spreads
//     `tenantScopeService.buildFilter(context, 'orgUnitId')` -- the same
//     filter every repository list uses. Search must never be a way to
//     see a row that the list hides; aggregate and cross-cutting
//     surfaces are exactly where scope leaks have come back twice in
//     this codebase.
//  3. NOTHING IS FABRICATED. A source that errors is reported as failed
//     rather than contributing zero results, because "no matches" and
//     "this did not run" are different answers and only one of them
//     means the record is not there.
//
// ---------------------------------------------------------------------
// WHY IT QUERIES COLLECTIONS DIRECTLY
// ---------------------------------------------------------------------
// Not to avoid the repositories -- because the repositories' scoped list
// methods each take a different filter shape, and only `tbldrivers`
// supports free text at all. Adding a `search` field to six filter
// interfaces would change six shipped read paths for one new feature.
//
// The scope rule itself is NOT re-derived: `buildFilter` is the seam,
// and this uses it. `tests/security/global-search-scope.spec.ts` asserts
// every source applies it, the tenant filter and the soft-delete filter.

import connectToDatabase from '@/infrastructure/database/mongodb';
import { containsMatch } from '@/shared/utils/regex.utils';
import { Permission, permissionService } from '@/server/permissions/roles';
import { tenantScopeService } from '@/modules/tenancy/services/tenant-scope.service';
import type { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { monitoring } from '@/infrastructure/monitoring/logger';

export type SearchResultKind =
  | 'vehicle'
  | 'driver'
  | 'trip'
  | 'work-order'
  | 'maintenance'
  | 'expense';

export interface SearchResult {
  kind: SearchResultKind;
  id: string;
  title: string;
  subtitle?: string;
  /** Where the record lives. Always a real route in this build. */
  href: string;
}

export interface GlobalSearchResponse {
  query: string;
  results: SearchResult[];
  /**
   * Sources the caller cannot read, named rather than silently omitted.
   *
   * A user who searches for a work order and sees nothing should be able
   * to tell "there is no such work order" from "you cannot see work
   * orders". The UI shows this as a footnote, not as an error.
   */
  skipped: SearchResultKind[];
  /** Sources whose query failed. See rule 3. */
  failed: SearchResultKind[];
  /** True when a source hit its cap, so the list is not exhaustive. */
  truncated: boolean;
}

/** Per source. Small on purpose: a palette shows a shortlist, not a report. */
const PER_SOURCE_LIMIT = 5;

/** Below this a query matches most of the fleet and is not a search. */
const MIN_QUERY_LENGTH = 2;

interface SourceDefinition {
  kind: SearchResultKind;
  collection: string;
  permission: Permission;
  /** Fields matched with a case-insensitive "contains". */
  fields: string[];
  /** Only these fields are read out of Mongo. */
  projection: Record<string, 1>;
  toResult: (doc: Record<string, unknown>) => SearchResult | null;
}

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value : undefined;

const SOURCES: SourceDefinition[] = [
  {
    kind: 'vehicle',
    collection: 'tblvehicles',
    permission: Permission.VEHICLE_VIEW,
    fields: ['license_plate', 'make', 'model', 'vin'],
    projection: { license_plate: 1, make: 1, model: 1, year: 1, status: 1 },
    toResult: (d) => {
      const id = str(d._id) ?? String(d._id ?? '');
      const plate = str(d.license_plate);
      if (!id || !plate) return null;
      return {
        kind: 'vehicle',
        id,
        title: plate,
        subtitle: [str(d.year) ?? (d.year ? String(d.year) : undefined), str(d.make), str(d.model)]
          .filter(Boolean)
          .join(' '),
        href: `/vehicles/${id}`,
      };
    },
  },
  {
    kind: 'driver',
    collection: 'tbldrivers',
    // Drivers have no permission of their own -- see the note in
    // ROLE_RESPONSIBILITY_MATRIX. Mirroring the stopgap the API enforces
    // rather than inventing a permission it does not.
    permission: Permission.VEHICLE_VIEW,
    fields: ['name', 'driver_code', 'email', 'license_number'],
    projection: { name: 1, driver_code: 1, email: 1, status: 1 },
    toResult: (d) => {
      const id = str(d._id) ?? String(d._id ?? '');
      const name = str(d.name);
      if (!id || !name) return null;
      return {
        kind: 'driver',
        id,
        title: name,
        subtitle: str(d.driver_code) ?? str(d.email),
        // The drivers module is a single list page with no detail route.
        href: '/drivers',
      };
    },
  },
  {
    kind: 'trip',
    collection: 'tbltrips',
    permission: Permission.TRIP_VIEW,
    fields: ['license_plate', 'start_location', 'end_location'],
    projection: { license_plate: 1, date: 1, start_location: 1, end_location: 1, distance_calculated: 1 },
    toResult: (d) => {
      const id = str(d._id) ?? String(d._id ?? '');
      const plate = str(d.license_plate);
      if (!id || !plate) return null;
      const route = [str(d.start_location), str(d.end_location)].filter(Boolean).join(' → ');
      return {
        kind: 'trip',
        id,
        title: `Trip · ${plate}`,
        subtitle: route || undefined,
        href: `/trips/${id}`,
      };
    },
  },
  {
    kind: 'work-order',
    collection: 'tblworkorders',
    permission: Permission.WORKORDER_VIEW,
    fields: ['title', 'license_plate', 'description'],
    projection: { title: 1, license_plate: 1, status: 1, priority: 1 },
    toResult: (d) => {
      const id = str(d._id) ?? String(d._id ?? '');
      const title = str(d.title);
      if (!id || !title) return null;
      return {
        kind: 'work-order',
        id,
        title,
        subtitle: [str(d.license_plate), str(d.status)?.replace(/_/g, ' ')]
          .filter(Boolean)
          .join(' · '),
        href: `/workorders/${id}`,
      };
    },
  },
  {
    kind: 'maintenance',
    collection: 'tblreminders',
    permission: Permission.MAINTENANCE_VIEW,
    fields: ['title', 'license_plate', 'service_type'],
    projection: { title: 1, license_plate: 1, status: 1, due_date: 1 },
    toResult: (d) => {
      const id = str(d._id) ?? String(d._id ?? '');
      const title = str(d.title);
      if (!id || !title) return null;
      return {
        kind: 'maintenance',
        id,
        title,
        subtitle: [str(d.license_plate), str(d.status)].filter(Boolean).join(' · '),
        href: `/maintenance/${id}`,
      };
    },
  },
  {
    kind: 'expense',
    collection: 'tblexpenses',
    permission: Permission.EXPENSE_VIEW,
    fields: ['description', 'license_plate', 'notes'],
    projection: { description: 1, license_plate: 1, amount: 1, currency: 1, date: 1 },
    toResult: (d) => {
      const id = str(d._id) ?? String(d._id ?? '');
      if (!id) return null;
      const amount = typeof d.amount === 'number' ? d.amount : undefined;
      return {
        kind: 'expense',
        id,
        title: str(d.description) ?? 'Expense',
        subtitle: [
          str(d.license_plate),
          amount !== undefined
            ? `${str(d.currency) ? `${str(d.currency)} ` : ''}${amount.toLocaleString()}`
            : undefined,
        ]
          .filter(Boolean)
          .join(' · '),
        href: `/expenses/${id}`,
      };
    },
  },
];

export class GlobalSearchService {
  async search(
    rawQuery: string,
    context: TenantContext,
    roles: string[]
  ): Promise<GlobalSearchResponse> {
    const query = (rawQuery ?? '').trim();

    if (query.length < MIN_QUERY_LENGTH) {
      return { query, results: [], skipped: [], failed: [], truncated: false };
    }

    const db = await connectToDatabase();

    /**
     * The scope clause, built ONCE from the shared predicate and spread
     * into every source query.
     *
     * `{}` for an org-wide caller, `{orgUnitId: {$in: [...]}}` for a
     * narrowed one, and `{orgUnitId: {$in: []}}` -- which matches nothing
     * -- for a caller whose assignments resolved to an empty set. That
     * last case is the fail-closed one and it must stay that way: a
     * search that quietly widened for a user with no assignments would
     * be the most privileged read in the product.
     */
    const scopeFilter = tenantScopeService.buildFilter<Record<string, unknown>>(
      context,
      'orgUnitId'
    ) as Record<string, unknown>;

    const results: SearchResult[] = [];
    const skipped: SearchResultKind[] = [];
    const failed: SearchResultKind[] = [];
    let truncated = false;

    await Promise.all(
      SOURCES.map(async (source) => {
        if (!permissionService.hasPermission(roles, source.permission)) {
          skipped.push(source.kind);
          return;
        }

        const filter: Record<string, unknown> = {
          tenantId: context.organizationId,
          isDeleted: { $ne: true },
          ...scopeFilter,
          $or: source.fields.map((field) => ({ [field]: containsMatch(query) })),
        };

        try {
          const docs = await db
            .collection(source.collection)
            .find(filter, { projection: source.projection })
            .limit(PER_SOURCE_LIMIT + 1)
            .toArray();

          if (docs.length > PER_SOURCE_LIMIT) truncated = true;

          for (const doc of docs.slice(0, PER_SOURCE_LIMIT)) {
            const result = source.toResult({ ...doc, _id: String(doc._id) });
            // A row that cannot be rendered as a result -- no id, no
            // title -- contributes nothing rather than contributing a
            // blank line that goes nowhere when clicked.
            if (result) results.push(result);
          }
        } catch (error) {
          failed.push(source.kind);
          monitoring.logError('[global-search] Source query failed', error as Error, {
            kind: source.kind,
            tenantId: context.organizationId,
          });
        }
      })
    );

    return { query, results, skipped, failed, truncated };
  }
}

export const globalSearchService = new GlobalSearchService();
