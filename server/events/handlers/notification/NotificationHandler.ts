// server/events/handlers/notification/NotificationHandler.ts

import { IEventHandler } from '../../base/IEventHandler';
import { DomainEvent } from '../../base/DomainEvent';
import { notificationService } from '@/modules/notifications/services/notification.service';

export class NotificationHandler implements IEventHandler<DomainEvent> {
  async handle(event: DomainEvent): Promise<void> {
    const payload = event.payload;
    const tenantId = (event.metadata?.tenantId as string) || 'default';
    const userId = (event.metadata?.userId as string) || 'system';

    switch (event.eventName) {
      case 'VehicleCreated':
        await this.onVehicleCreated(payload, tenantId, userId);
        break;
      case 'ExpenseCreated':
        await this.onExpenseCreated(payload, tenantId, userId);
        break;
      case 'FuelLogged':
        await this.onFuelLogged(payload, tenantId, userId);
        break;
      case 'ReminderOverdue':
        await this.onReminderOverdue(payload, tenantId, userId);
        break;
      case 'InvoicePaid':
        await this.onInvoicePaid(payload, tenantId, userId);
        break;
      case 'MemberJoined':
        await this.onMemberJoined(payload, tenantId, userId);
        break;
      default:
        break;
    }
  }

  private async onVehicleCreated(payload: any, tenantId: string, userId: string) {
    const managers = await this.getFleetManagers(tenantId);
    if (managers.length > 0) {
      await notificationService.sendBulkNotification(
        managers,
        tenantId,
        {
          type: 'system',
          title: 'New Vehicle Added',
          message: `Vehicle ${payload.license_plate} has been added.`,
          priority: 'medium',
          data: { vehicleId: payload.entityId },
          actionUrl: `/vehicles/${payload.entityId}`,
          actionLabel: 'View Vehicle',
        },
      );
    }
  }

  private async onExpenseCreated(payload: any, tenantId: string, userId: string) {
    const accountants = await this.getAccountants(tenantId);
    if (accountants.length > 0) {
      await notificationService.sendBulkNotification(
        accountants,
        tenantId,
        {
          type: 'expense_approved',
          title: 'New Expense Created',
          message: `Expense of $${payload.amount} for ${payload.license_plate}.`,
          priority: 'medium',
          data: { expenseId: payload.entityId },
          actionUrl: `/expenses/${payload.entityId}`,
          actionLabel: 'View Expense',
        },
      );
    }
  }

  private async onFuelLogged(payload: any, tenantId: string, userId: string) {
    const managers = await this.getFleetManagers(tenantId);
    if (managers.length > 0) {
      await notificationService.sendBulkNotification(
        managers,
        tenantId,
        {
          type: 'fuel_anomaly',
          title: 'Fuel Logged',
          message: `${payload.fuel_volume}L of fuel for ${payload.license_plate}.`,
          priority: 'low',
          data: { fuelLogId: payload.entityId },
          actionUrl: `/fuel/${payload.entityId}`,
          actionLabel: 'View Fuel Log',
        },
      );
    }
  }

  private async onReminderOverdue(payload: any, tenantId: string, userId: string) {
    const assignee = payload.assigned_to;
    if (assignee) {
      await notificationService.sendNotification(
        assignee,
        tenantId,
        {
          userId: assignee,
          type: 'maintenance_overdue',
          title: 'Maintenance Overdue',
          message: `${payload.title} for ${payload.license_plate} is overdue.`,
          priority: 'high',
          data: { reminderId: payload.entityId },
          actionUrl: `/maintenance/${payload.entityId}`,
          actionLabel: 'View Service',
        },
      );
    }
  }

  private async onInvoicePaid(payload: any, tenantId: string, userId: string) {
    const ownerId = payload.ownerId;
    if (ownerId) {
      await notificationService.sendNotification(
        ownerId,
        tenantId,
        {
          userId: ownerId,
          type: 'system',
          title: 'Invoice Paid',
          message: `Your invoice for plan ${payload.planId} has been paid.`,
          priority: 'medium',
          data: { invoiceId: payload.entityId },
          actionUrl: '/settings/billing',
          actionLabel: 'View Billing',
        },
      );
    }
  }

  private async onMemberJoined(payload: any, tenantId: string, userId: string) {
    const ownerId = payload.ownerId;
    if (ownerId) {
      await notificationService.sendNotification(
        ownerId,
        tenantId,
        {
          userId: ownerId,
          type: 'member_joined',
          title: 'New Member Joined',
          message: `${payload.memberName} has joined.`,
          priority: 'low',
          data: { organizationId: payload.entityId },
          actionUrl: '/settings/members',
          actionLabel: 'View Members',
        },
      );
    }
  }

  private async getFleetManagers(tenantId: string): Promise<string[]> {
    try {
      const { organizationRepository } = await import('@/modules/organizations/repositories/organization.repository');
      const org = await organizationRepository.findById(tenantId, tenantId, false, true);
      if (!org) return [];
      return org.members
        .filter((m) => m.role === 'fleet_manager' || m.role === 'organization_owner')
        .map((m) => m.userId);
    } catch {
      return [];
    }
  }

  private async getAccountants(tenantId: string): Promise<string[]> {
    try {
      const { organizationRepository } = await import('@/modules/organizations/repositories/organization.repository');
      const org = await organizationRepository.findById(tenantId, tenantId, false, true);
      if (!org) return [];
      return org.members
        .filter((m) => m.role === 'accountant' || m.role === 'organization_owner')
        .map((m) => m.userId);
    } catch {
      return [];
    }
  }
}