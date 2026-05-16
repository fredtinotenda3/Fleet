// modules/workflows/repositories/workflow.repository.ts

import { BaseRepository } from '@/server/repositories/base.repository';
import { Workflow, WorkflowInstance, WorkflowStepInstance } from '../types/workflow.types';
import { Filter, ObjectId } from 'mongodb';

export class WorkflowRepository extends BaseRepository<Workflow> {
  protected collectionName = 'tblworkflows';

  // Workflow CRUD
  async getWorkflow(workflowId: string, tenantId: string): Promise<Workflow | null> {
    return this.findById(workflowId, tenantId);
  }

  async getWorkflows(tenantId: string, activeOnly: boolean = true): Promise<Workflow[]> {
    const filter = activeOnly ? { status: 'active' } : {};
    return this.findMany(filter, tenantId);
  }

  async createWorkflow(workflow: Omit<Workflow, '_id' | 'createdAt' | 'updatedAt'>, tenantId: string, userId: string): Promise<Workflow> {
    return this.create(workflow, tenantId, userId);
  }

  async updateWorkflow(workflowId: string, workflow: Partial<Workflow>, tenantId: string, userId: string): Promise<Workflow | null> {
    return this.update(workflowId, workflow, tenantId, userId);
  }

  async deleteWorkflow(workflowId: string, tenantId: string): Promise<boolean> {
    return this.softDelete(workflowId, tenantId);
  }

  // Workflow Instance CRUD
  async getInstance(instanceId: string, tenantId: string): Promise<WorkflowInstance | null> {
    const collection = await this.getCollection();
    const instancesCollection = collection.collection?.('tblworkflow_instances') || collection;
    
    const filter = {
      ...this.getActiveFilter(tenantId),
      _id: new ObjectId(instanceId),
    };
    
    const result = await instancesCollection.findOne(filter as Filter<any>);
    return result as WorkflowInstance || null;
  }

  async getInstancesByEntity(entityId: string, entityType: string, tenantId: string): Promise<WorkflowInstance[]> {
    const collection = await this.getCollection();
    const instancesCollection = collection.collection?.('tblworkflow_instances') || collection;
    
    const filter = {
      ...this.getActiveFilter(tenantId),
      entityId,
      entityType,
    };
    
    return instancesCollection.find(filter as Filter<any>).toArray();
  }

  async getPendingInstances(tenantId: string, limit: number = 100): Promise<WorkflowInstance[]> {
    const collection = await this.getCollection();
    const instancesCollection = collection.collection?.('tblworkflow_instances') || collection;
    
    const filter = {
      ...this.getActiveFilter(tenantId),
      status: 'pending',
    };
    
    return instancesCollection.find(filter as Filter<any>).sort({ createdAt: 1 }).limit(limit).toArray();
  }

  async createInstance(instance: Omit<WorkflowInstance, '_id' | 'createdAt' | 'updatedAt'>, tenantId: string, userId: string): Promise<WorkflowInstance> {
    const collection = await this.getCollection();
    const instancesCollection = collection.collection?.('tblworkflow_instances') || collection;
    
    const now = new Date();
    const instanceData = {
      ...instance,
      tenantId,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    };
    
    const result = await instancesCollection.insertOne(instanceData);
    return { ...instanceData, _id: result.insertedId.toString() } as WorkflowInstance;
  }

  async updateInstance(instanceId: string, updates: Partial<WorkflowInstance>, tenantId: string): Promise<void> {
    const collection = await this.getCollection();
    const instancesCollection = collection.collection?.('tblworkflow_instances') || collection;
    
    const filter = {
      ...this.getActiveFilter(tenantId),
      _id: new ObjectId(instanceId),
    };
    
    await instancesCollection.updateOne(filter as Filter<any>, {
      $set: { ...updates, updatedAt: new Date() },
    });
  }

  async updateInstanceStatus(instanceId: string, status: WorkflowInstance['status'], tenantId: string): Promise<void> {
    const collection = await this.getCollection();
    const instancesCollection = collection.collection?.('tblworkflow_instances') || collection;
    
    const filter = {
      ...this.getActiveFilter(tenantId),
      _id: new ObjectId(instanceId),
    };
    
    await instancesCollection.updateOne(filter as Filter<any>, {
      $set: { status, updatedAt: new Date(), completedAt: status === 'approved' || status === 'rejected' ? new Date() : undefined },
    });
  }

  async updateInstanceStep(instanceId: string, stepId: string, stepInstance: WorkflowStepInstance, tenantId: string): Promise<void> {
    const collection = await this.getCollection();
    const instancesCollection = collection.collection?.('tblworkflow_instances') || collection;
    
    const filter = {
      ...this.getActiveFilter(tenantId),
      _id: new ObjectId(instanceId),
    };
    
    await instancesCollection.updateOne(filter as Filter<any>, {
      $set: { [`steps.$[elem]`]: stepInstance, updatedAt: new Date() },
      $arrayFilters: [{ 'elem.stepId': stepId }],
    });
  }

  async completeInstance(instanceId: string, tenantId: string): Promise<void> {
    const collection = await this.getCollection();
    const instancesCollection = collection.collection?.('tblworkflow_instances') || collection;
    
    const filter = {
      ...this.getActiveFilter(tenantId),
      _id: new ObjectId(instanceId),
    };
    
    await instancesCollection.updateOne(filter as Filter<any>, {
      $set: { status: 'approved', completedAt: new Date(), updatedAt: new Date() },
    });
  }

  async getInstancesByAssignee(userId: string, tenantId: string, limit: number = 50): Promise<WorkflowInstance[]> {
    const collection = await this.getCollection();
    const instancesCollection = collection.collection?.('tblworkflow_instances') || collection;
    
    const filter = {
      ...this.getActiveFilter(tenantId),
      status: 'pending',
      'steps.assignedTo': userId,
      'steps.status': 'pending',
    };
    
    return instancesCollection.find(filter as Filter<any>).limit(limit).toArray();
  }

  async getWorkflowMetrics(tenantId: string, days: number = 30): Promise<any> {
    const collection = await this.getCollection();
    const instancesCollection = collection.collection?.('tblworkflow_instances') || collection;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const filter = {
      ...this.getActiveFilter(tenantId),
      createdAt: { $gte: startDate },
    };
    
    const pipeline = [
      { $match: filter },
      {
        $facet: {
          total: [{ $count: 'count' }],
          byStatus: [
            { $group: { _id: '$status', count: { $sum: 1 } } },
          ],
          avgCompletionTime: [
            { $match: { status: 'approved', completedAt: { $exists: true } } },
            { $project: { duration: { $subtract: ['$completedAt', '$createdAt'] } } },
            { $group: { _id: null, avgDuration: { $avg: '$duration' } } },
          ],
        },
      },
    ];
    
    const results = await instancesCollection.aggregate(pipeline).toArray();
    return results[0] || { total: [], byStatus: [], avgCompletionTime: [] };
  }
}

export const workflowRepository = new WorkflowRepository();