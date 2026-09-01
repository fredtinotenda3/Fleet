// modules/attention/repositories/attention-dispatch.repository.ts
//
// BACKLOG ITEM 6 (audit finding P6-N3) -- the persistence half of
// attention dispatch.
//
// ---------------------------------------------------------------------
// WHAT WAS MISSING
// ---------------------------------------------------------------------
// `AttentionDispatchService` takes its persistence through an injected
// `DispatchDeps` (find/record), and `indexes.attention-addendum.ts`
// declares the three indexes for `tblattention_dispatches` -- including
// the partial unique key the idempotency argument depends on. No
// repository implemented the interface, so the service could not be
// constructed outside a test and nothing ever called `dispatch()`.
//
// This is that implementation, and nothing more: the decision logic and
// the idempotency key already exist and are already tested, and
// re-deriving either here would give the platform two answers to the
// same question.
//
// ---------------------------------------------------------------------
// THE 11000 CONTRACT IS LOAD-BEARING
// ---------------------------------------------------------------------
// `DispatchDeps.recordDispatch` documents "Throws with code 11000 if the
// key already exists", and the service catches exactly that to turn a
// lost race into a `duplicate` outcome. So this uses a plain
// `insertOne` -- NOT an upsert, and no pre-read swallowing the error.
// An upsert would silently succeed on a duplicate and the caller would
// then execute the action a second time, which is the duplicate work
// order the whole design exists to prevent.
//
// The uniqueness itself is the INDEX's job
// (`uniq_attention_dispatch_tenant_idempotency`). `npm run db:indexes`
// must have been run for that guarantee to hold; without it the
// application-level pre-read still collapses the common case and only a
// genuine race can slip through. Stated rather than assumed.
//
// ---------------------------------------------------------------------
// SCOPED READS
// ---------------------------------------------------------------------
// A dispatch record names a vehicle and the work created against it, so
// it inherits the org-unit scope of the attention item that caused it
// (carried on the record at write time by the service). `findDispatch`
// is deliberately NOT scoped: it is an IDEMPOTENCY probe, and narrowing
// it by the caller's units would let a caller in another branch miss an
// existing dispatch and create a second work order for the same
// finding. Tenant isolation is enforced; org-unit narrowing belongs on
// the LIST read, which is what an operator actually sees.

import { Db } from 'mongodb';

import connectToDatabase from '@/infrastructure/database/mongodb';
import { tenantScopeService } from '@/modules/tenancy/services/tenant-scope.service';
import type { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import type {
  AttentionDispatchRecord,
  DispatchDeps,
} from '../services/attention-dispatch.service';

const COLLECTION = 'tblattention_dispatches';

export class AttentionDispatchRepository implements DispatchDeps {
  private async collection() {
    const db: Db = await connectToDatabase();
    return db.collection<AttentionDispatchRecord>(COLLECTION);
  }

  /**
   * The idempotency probe. Tenant-scoped, deliberately not org-unit
   * scoped -- see the header.
   */
  async findDispatch(
    idempotencyKey: string,
    tenantId: string
  ): Promise<AttentionDispatchRecord | null> {
    const collection = await this.collection();
    const doc = await collection.findOne({ tenantId, idempotencyKey } as never);
    return (doc as AttentionDispatchRecord | null) ?? null;
  }

  /**
   * Records a dispatch.
   *
   * Lets a duplicate-key error PROPAGATE with its code intact: the
   * service reads `error.code === 11000` to distinguish "another
   * dispatcher got there first" (a duplicate, not an error) from a real
   * failure. Catching it here would erase that distinction.
   */
  async recordDispatch(record: AttentionDispatchRecord): Promise<void> {
    const collection = await this.collection();
    await collection.insertOne({
      ...record,
      // isDeleted is carried so this collection reads like every other
      // one in the platform: the soft-delete predicate that every list
      // read applies would otherwise exclude rows that never set it.
      isDeleted: false,
    } as never);
  }

  /**
   * What has been dispatched for this tenant, narrowed to the caller's
   * org units.
   *
   * The operator-facing read, and the one that must be scoped: a
   * dispatch record says which vehicle the platform created work
   * against, which is exactly as sensitive as the attention item behind
   * it. Scope predicate spread LAST so it owns the `orgUnitId` key.
   */
  async listInScope(
    context: TenantContext,
    filter: { attentionItemKey?: string } = {},
    limit = 100
  ): Promise<AttentionDispatchRecord[]> {
    const collection = await this.collection();

    const query = {
      tenantId: context.organizationId,
      isDeleted: { $ne: true },
      ...(filter.attentionItemKey ? { attentionItemKey: filter.attentionItemKey } : {}),
      ...tenantScopeService.buildFilter<AttentionDispatchRecord>(context, 'orgUnitId'),
    };

    return collection
      .find(query as never, { sort: { dispatchedAt: -1 }, limit })
      .toArray() as unknown as Promise<AttentionDispatchRecord[]>;
  }

  /**
   * Links a completed action back to the item that caused it.
   *
   * Narrow by design: sets only `completedAt`, so it can never be used
   * to rewrite which action was dispatched or against what -- the same
   * discipline `resolveByItemKey` applies on the attention item itself.
   */
  async markCompleted(idempotencyKey: string, tenantId: string, at: Date = new Date()): Promise<boolean> {
    const collection = await this.collection();
    const result = await collection.updateOne(
      { tenantId, idempotencyKey } as never,
      { $set: { completedAt: at } }
    );
    return result.modifiedCount > 0;
  }

  /**
   * Records that the action behind a dispatch refused or failed.
   *
   * The record is deliberately NOT deleted -- see the header of
   * attention-dispatch.trigger.ts. Annotating it is what turns "a
   * dispatch record with no work behind it" from a mystery into
   * something an operator can act on, and it is the only way a retry
   * after fixing the data can be distinguished from a duplicate.
   */
  async markFailed(idempotencyKey: string, tenantId: string, reason: string): Promise<boolean> {
    const collection = await this.collection();
    const result = await collection.updateOne(
      { tenantId, idempotencyKey } as never,
      { $set: { failedAt: new Date(), failureReason: reason } }
    );
    return result.modifiedCount > 0;
  }
}

export const attentionDispatchRepository = new AttentionDispatchRepository();
