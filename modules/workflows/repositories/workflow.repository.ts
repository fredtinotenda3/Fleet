// modules/workflows/repositories/workflow.repository.ts

import { Db, Filter, ObjectId } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import connectToDatabase from '@/infrastructure/database/mongodb';
import { Workflow, WorkflowInstance, WorkflowStepInstance } from '../types/workflow.types';

export class WorkflowRepository extends BaseRepository<Workflow> {
  protected collectionName = 'tblworkflows';

  private async getDb(): Promise<Db> {
    return connectToDatabase();
  }

  private async instancesCollection() {
    const db = await this.getDb();
    return db.collection<WorkflowInstance>('tblworkflow_instances');
  }

  // ── Workflow definitions ─────────────────────────────────────────────

  async getWorkflow(workflowId: string, tenantId: string): Promise<Workflow | null> {
    return this.findById(workflowId, tenantId);
  }

  async getWorkflows(tenantId: string, activeOnly: boolean = true): Promise<Workflow[]> {
    const filter = activeOnly ? ({ status: 'active' } as Filter<Workflow>) : ({} as Filter<Workflow>);
    return this.findMany(filter, tenantId);
  }

  async getWorkflowsByTrigger(event: string, tenantId: string): Promise<Workflow[]> {
    return this.findMany(
      { status: 'active', 'triggers.event': event } as Filter<Workflow>,
      tenantId
    );
  }

  async createWorkflow(
    workflow: Omit<Workflow, '_id' | 'createdAt' | 'updatedAt'>,
    tenantId: string,
    userId: string
  ): Promise<Workflow> {
    return this.create(workflow, tenantId, userId);
  }

  async updateWorkflow(
    workflowId: string,
    workflow: Partial<Workflow>,
    tenantId: string,
    userId: string
  ): Promise<Workflow | null> {
    return this.update(workflowId, workflow, tenantId, userId);
  }

  async deleteWorkflow(workflowId: string, tenantId: string, userId: string): Promise<boolean> {
    return this.softDelete(workflowId, tenantId, userId);
  }

  // ── Workflow instances ───────────────────────────────────────────────

  async getInstance(instanceId: string, tenantId: string): Promise<WorkflowInstance | null> {
    if (!ObjectId.isValid(instanceId)) return null;
    const collection = await this.instancesCollection();

    return collection.findOne({
      _id: new ObjectId(instanceId) as any,
      tenantId,
      isDeleted: { $ne: true },
    } as Filter<WorkflowInstance>);
  }

  async getInstancesByEntity(
    entityId: string,
    entityType: string,
    tenantId: string
  ): Promise<WorkflowInstance[]> {
    const collection = await this.instancesCollection();
    return collection
      .find({
        tenantId,
        isDeleted: { $ne: true },
        entityId,
        entityType,
      } as Filter<WorkflowInstance>)
      .sort({ createdAt: -1 })
      .toArray();
  }

  async getPendingInstances(tenantId: string, limit: number = 100): Promise<WorkflowInstance[]> {
    const collection = await this.instancesCollection();
    return collection
      .find({
        tenantId,
        isDeleted: { $ne: true },
        status: { $in: ['pending', 'in_progress'] },
      } as Filter<WorkflowInstance>)
      .sort({ createdAt: 1 })
      .limit(limit)
      .toArray();
  }

  async getInstancesByAssignee(
    userId: string,
    tenantId: string,
    limit: number = 50
  ): Promise<WorkflowInstance[]> {
    const collection = await this.instancesCollection();
    return collection
      .find({
        tenantId,
        isDeleted: { $ne: true },
        status: { $in: ['pending', 'in_progress'] },
        steps: {
          $elemMatch: { assignedTo: userId, status: 'pending' },
        },
      } as Filter<WorkflowInstance>)
      .limit(limit)
      .toArray();
  }

  async createInstance(
    instance: Omit<WorkflowInstance, '_id' | 'createdAt' | 'updatedAt'>,
    tenantId: string,
    userId: string
  ): Promise<WorkflowInstance> {
    const collection = await this.instancesCollection();
    const now = new Date();

    const instanceData = {
      ...instance,
      tenantId,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    };

    const result = await collection.insertOne(instanceData as any);
    return { ...instanceData, _id: result.insertedId.toString() } as WorkflowInstance;
  }

  async updateInstance(
    instanceId: string,
    updates: Partial<WorkflowInstance>,
    tenantId: string
  ): Promise<void> {
    if (!ObjectId.isValid(instanceId)) return;
    const collection = await this.instancesCollection();

    await collection.updateOne(
      { _id: new ObjectId(instanceId) as any, tenantId } as Filter<WorkflowInstance>,
      { $set: { ...updates, updatedAt: new Date() } }
    );
  }

  /**
   * Atomically advances a workflow instance: records the outcome of the
   * current step AND moves `currentStepId` forward (or marks the instance
   * complete) in a single `findOneAndUpdate`, guarded by an
   * optimistic-concurrency check on `currentStepId`.
   */
  async advanceStep(
    instanceId: string,
    tenantId: string,
    expectedCurrentStepId: string,
    stepUpdate: WorkflowStepInstance,
    nextStepId: string | null,
    nextStatus: WorkflowInstance['status']
  ): Promise<WorkflowInstance | null> {
    if (!ObjectId.isValid(instanceId)) return null;
    const collection = await this.instancesCollection();

    const setFields: Record<string, unknown> = {
      'steps.$[elem]': stepUpdate,
      updatedAt: new Date(),
      status: nextStatus,
    };

    if (nextStepId) {
      setFields.currentStepId = nextStepId;
    } else {
      setFields.completedAt = new Date();
    }

    // Note: options are passed WITHOUT an `as any` cast so the driver
    // picks the overload that returns the document directly
    // (`WithId<WorkflowInstance> | null`) rather than the
    // `ModifyResult<WorkflowInstance>` overload — casting `as any` here
    // previously confused overload resolution and broke the return type.
    const result = await collection.findOneAndUpdate(
      {
        _id: new ObjectId(instanceId) as any,
        tenantId,
        isDeleted: { $ne: true },
        currentStepId: expectedCurrentStepId,
      } as Filter<WorkflowInstance>,
      { $set: setFields },
      {
        arrayFilters: [{ 'elem.stepId': stepUpdate.stepId }],
        returnDocument: 'after',
      }
    );

    return (result as WorkflowInstance) || null;
  }

  async updateInstanceStatus(
    instanceId: string,
    status: WorkflowInstance['status'],
    tenantId: string
  ): Promise<void> {
    if (!ObjectId.isValid(instanceId)) return;
    const collection = await this.instancesCollection();

    const setFields: Record<string, unknown> = { status, updatedAt: new Date() };
    if (status === 'approved' || status === 'rejected' || status === 'cancelled') {
      setFields.completedAt = new Date();
    }

    await collection.updateOne(
      { _id: new ObjectId(instanceId) as any, tenantId } as Filter<WorkflowInstance>,
      { $set: setFields }
    );
  }

  async updateInstanceStep(
    instanceId: string,
    stepId: string,
    stepInstance: WorkflowStepInstance,
    tenantId: string
  ): Promise<void> {
    if (!ObjectId.isValid(instanceId)) return;
    const collection = await this.instancesCollection();

    await collection.updateOne(
      { _id: new ObjectId(instanceId) as any, tenantId } as Filter<WorkflowInstance>,
      { $set: { 'steps.$[elem]': stepInstance, updatedAt: new Date() } },
      { arrayFilters: [{ 'elem.stepId': stepId }] } as any
    );
  }

  async getWorkflowMetrics(
    tenantId: string,
    days: number = 30
  ): Promise<{
    total: number;
    byStatus: Record<string, number>;
    avgCompletionTimeMs: number | null;
  }> {
    const collection = await this.instancesCollection();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const pipeline = [
      { $match: { tenantId, isDeleted: { $ne: true }, createdAt: { $gte: startDate } } },
      {
        $facet: {
          total: [{ $count: 'count' }],
          byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
          avgCompletionTime: [
            { $match: { status: 'approved', completedAt: { $exists: true } } },
            { $project: { duration: { $subtract: ['$completedAt', '$createdAt'] } } },
            { $group: { _id: null, avgDuration: { $avg: '$duration' } } },
          ],
        },
      },
    ];

    const results = await collection.aggregate(pipeline).toArray();
    const data = results[0] || { total: [], byStatus: [], avgCompletionTime: [] };

    return {
      total: data.total[0]?.count || 0,
      byStatus: Object.fromEntries((data.byStatus || []).map((s: any) => [s._id, s.count])),
      avgCompletionTimeMs: data.avgCompletionTime[0]?.avgDuration ?? null,
    };
  }
}

export const workflowRepository = new WorkflowRepository();