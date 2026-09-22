// modules/transport-cost/repositories/transport-cost-import-exception.repository.ts
//
// Extends TenantScopedRepository, same convention as
// transport-cost-source-record.repository.ts -- see that file's header
// for why (org-unit scoping, module-scope-conformance.spec.ts).
//
// This collection is intentionally NOT append-only-enforced the way
// tblallocationledger is (no overridden update/softDelete/hardDelete
// throwing ConflictError): an exception row is a record of something
// that did NOT happen (a row that failed to post), not a financial fact
// that needs a reversal trail. There is nothing to "correct" about a
// rejection after the fact other than fixing the source data and
// re-importing, which produces its own new exception rows (or none, if
// the fix worked) rather than mutating old ones. In practice nothing in
// this codebase calls update/softDelete/hardDelete on this repository
// today; if that ever changes, the inherited TenantScopedRepository
// behavior (soft-delete, no destructive hard delete by default) is the
// same safe default every other module gets.

import { TenantScopedRepository } from '@/server/repositories/tenant-scoped.repository';
import { TransportCostImportException } from '@/shared/types/transport-cost-import-exception.types';
import { Filter } from 'mongodb';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';

export class TransportCostImportExceptionRepository extends TenantScopedRepository<TransportCostImportException> {
  protected collectionName = 'tbltransportcostimportexceptions';

  /**
   * The sole write path. Called from ImportTransportCostHandler,
   * best-effort (never allowed to turn an otherwise-successful or
   * already-decided rejection/duplicate outcome into a thrown error --
   * see that handler's header) for every rejected or duplicate-flagged
   * row.
   */
  async log(
    data: Omit<
      TransportCostImportException,
      '_id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'deletedAt' | 'createdBy' | 'updatedBy'
    >,
    tenantId: string,
    userId?: string
  ): Promise<TransportCostImportException> {
    return this.create(data, tenantId, userId);
  }

  /**
   * Every exception row for a set of import batches, regardless of the
   * exception's own (often unparseable, sometimes entirely absent --
   * see the date-missing rejection case) date. See
   * TransportCostReportService.getDataQualityExceptions's header for
   * why batch membership, not date, is how this query is scoped.
   */
  async findByImportBatchIds(
    importBatchIds: string[],
    context: TenantContext
  ): Promise<TransportCostImportException[]> {
    if (importBatchIds.length === 0) return [];
    return this.findManyInScope(
      { importBatchId: { $in: importBatchIds } } as Filter<TransportCostImportException>,
      context,
      { sortBy: 'sourceRowNumber', sortOrder: 'asc', limit: 100000 }
    );
  }
}

export const transportCostImportExceptionRepository = new TransportCostImportExceptionRepository();
