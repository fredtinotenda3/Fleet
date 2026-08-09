// modules/finance/repositories/gl-submission.repository.ts

import { Filter } from 'mongodb';
import { TenantScopedRepository } from '@/server/repositories/tenant-scoped.repository';
import { GLSubmission } from '../types/gl-reconciliation.types';
import { ConflictError } from '@/server/errors/app.errors';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';

/**
 * APPEND-ONLY, same discipline as tblallocationledger and
 * tblvalueledger, and for the reason stated in
 * gl-reconciliation.types.ts: a GL figure the customer supplied is
 * itself evidence (their monthly close number). A corrected figure is a
 * NEW submission for the same period/account; reconciliation always
 * compares against the latest one.
 *
 * That "latest wins" rule is what makes append-only usable here rather
 * than merely principled -- the customer can restate a period as many
 * times as their own close process requires, and the report always
 * reflects the current truth while the earlier figures stay on record
 * for anyone asking why last week's report said something different.
 */
export class GLSubmissionRepository extends TenantScopedRepository<GLSubmission> {
  protected collectionName = 'tblglsubmissions';

  /** The sole write path. */
  async append(
    data: Omit<
      GLSubmission,
      '_id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'deletedAt' | 'createdBy' | 'updatedBy'
    >,
    tenantId: string,
    userId?: string
  ): Promise<GLSubmission> {
    return this.create(data, tenantId, userId);
  }

  /**
   * Every submission whose period falls inside the requested window,
   * within the caller's scope, newest submission first.
   *
   * Period matching is `periodStart >= from AND periodEnd <= to` --
   * fully-contained, deliberately the same semantics as
   * AllocationLedgerRepository.getNetTotalsByCategory/ByGlAccount so
   * the two sides of a reconciliation report always agree about which
   * records belong to the period. (See the KNOWN INCONSISTENCY note in
   * the changelog: AllocationLedgerRepository.buildFilter -- used by
   * the posting LIST endpoint, not by any totals path -- uses a
   * different, starts-within-window rule.)
   */
  async findInPeriodInScope(
    periodStart: Date,
    periodEnd: Date,
    context: TenantContext
  ): Promise<GLSubmission[]> {
    const filter = {
      periodStart: { $gte: periodStart },
      periodEnd: { $lte: periodEnd },
    } as unknown as Filter<GLSubmission>;

    return this.findManyInScope(filter, context, {
      sortBy: 'submittedAt',
      sortOrder: 'desc',
    });
  }

  /**
   * The latest submission per GL account code for a period, keyed by
   * account code.
   *
   * Reduced in JS from findInPeriodInScope() rather than via a
   * $sort/$group/$first aggregation. Two reasons, in order of
   * importance: (1) the scope predicate is already correctly applied by
   * findManyInScope, and every hand-rolled aggregation in this codebase
   * that reached for `collection.aggregate` directly has been a place
   * where org-unit scoping had to be re-established by hand -- twice
   * now that was forgotten (the anomaly severity counts, and
   * ReportQueryEngine.run). Not writing a new raw pipeline is the
   * cheapest way not to make that mistake a third time. (2) an account
   * count per period is bounded by the customer's chart of accounts
   * (tens, not thousands), so there is nothing to gain from pushing the
   * reduction into Mongo.
   */
  async findLatestPerAccountInScope(
    periodStart: Date,
    periodEnd: Date,
    context: TenantContext
  ): Promise<Map<string, GLSubmission>> {
    const submissions = await this.findInPeriodInScope(periodStart, periodEnd, context);
    const latest = new Map<string, GLSubmission>();

    for (const submission of submissions) {
      const existing = latest.get(submission.glAccountCode);
      if (!existing) {
        latest.set(submission.glAccountCode, submission);
        continue;
      }
      // findInPeriodInScope already sorts submittedAt desc, but do not
      // rely on that alone -- a repository sort option is easy to drop
      // in a later edit, and a reconciliation report silently comparing
      // against a superseded GL figure is exactly the class of bug
      // nobody notices until an auditor does.
      if (new Date(submission.submittedAt).getTime() > new Date(existing.submittedAt).getTime()) {
        latest.set(submission.glAccountCode, submission);
      }
    }

    return latest;
  }

  async update(): Promise<GLSubmission | null> {
    throw new ConflictError(
      'tblglsubmissions is append-only: a submitted GL figure cannot be edited. ' +
        'Submit a new figure for the same period and account instead -- reconciliation uses the latest.'
    );
  }

  async softDelete(): Promise<boolean> {
    throw new ConflictError('tblglsubmissions is append-only: submissions cannot be deleted.');
  }

  async hardDelete(): Promise<boolean> {
    throw new ConflictError('tblglsubmissions is append-only: submissions cannot be deleted.');
  }
}

export const glSubmissionRepository = new GLSubmissionRepository();
