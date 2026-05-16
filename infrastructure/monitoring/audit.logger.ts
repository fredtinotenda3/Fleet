// infrastructure/monitoring/audit.logger.ts

import { monitoring } from './logger';

export interface AuditEntry {
  action: string;
  userId: string;
  tenantId: string;
  entityType: string;
  entityId?: string;
  changes?: Record<string, any>;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

export class AuditLogger {
  async log(entry: AuditEntry) {
    const auditLog = {
      ...entry,
      timestamp: new Date(),
      severity: 'info',
    };
    
    monitoring.logInfo('Audit', auditLog);
    
    // Store in database for compliance
    await this.storeAuditLog(auditLog);
  }

  async logAction(action: string, userId: string, tenantId: string, metadata?: Record<string, any>) {
    await this.log({
      action,
      userId,
      tenantId,
      entityType: 'system',
      metadata,
    });
  }

  async logCreate(userId: string, tenantId: string, entityType: string, entityId: string, data: any) {
    await this.log({
      action: 'CREATE',
      userId,
      tenantId,
      entityType,
      entityId,
      changes: data,
    });
  }

  async logUpdate(userId: string, tenantId: string, entityType: string, entityId: string, before: any, after: any) {
    await this.log({
      action: 'UPDATE',
      userId,
      tenantId,
      entityType,
      entityId,
      changes: { before, after },
    });
  }

  async logDelete(userId: string, tenantId: string, entityType: string, entityId: string, data: any) {
    await this.log({
      action: 'DELETE',
      userId,
      tenantId,
      entityType,
      entityId,
      changes: data,
    });
  }

  async logLogin(userId: string, tenantId: string, success: boolean, ipAddress?: string) {
    await this.log({
      action: success ? 'LOGIN_SUCCESS' : 'LOGIN_FAILED',
      userId,
      tenantId,
      entityType: 'auth',
      metadata: { ipAddress, success },
    });
  }

  private async storeAuditLog(entry: any) {
    // Store in MongoDB or dedicated audit database
    // This would be implemented in the repository layer
  }
}

export const auditLog = new AuditLogger();