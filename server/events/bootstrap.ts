// server/events/bootstrap.ts

import { EventBusFactory } from './bus/EventBusFactory';
import { loggingMiddleware } from './middleware/LoggingMiddleware';
import { metricsMiddleware } from './middleware/MetricsMiddleware';
import { auditMiddleware } from './middleware/AuditMiddleware';
import { retryMiddleware } from './middleware/RetryMiddleware';

import { WorkflowTriggerHandler } from './handlers/workflow/WorkflowTriggerHandler';
import { NotificationHandler } from './handlers/notification/NotificationHandler';
import { AnalyticsHandler } from './handlers/analytics/AnalyticsHandler';
import { IntelligenceHandler } from './handlers/intelligence/IntelligenceHandler';
import { WebSocketHandler } from './handlers/websocket/WebSocketHandler';
import { AuditHandler } from './handlers/audit/AuditHandler';
import { PermissionCacheInvalidationHandler } from './handlers/security/PermissionCacheInvalidationHandler';
import { SecurityAuditHandler } from './handlers/security/SecurityAuditHandler';
import { AlertNotificationHandler } from './handlers/observability/AlertNotificationHandler';
import { WebhookDispatchHandler } from './handlers/webhooks/WebhookDispatchHandler';
import { AIPredictionTriggerHandler } from './handlers/ai/AIPredictionTriggerHandler';
import { AIInsightHandler } from './handlers/ai/AIInsightHandler';
import { digitalTwinProjectionHandler } from './handlers/digital-twin/DigitalTwinProjectionHandler';

import {
  VEHICLE_CREATED,
  VEHICLE_UPDATED,
  VEHICLE_DELETED,
  EXPENSE_CREATED,
  EXPENSE_UPDATED,
  EXPENSE_DELETED,
  FUEL_LOGGED,
  FUEL_LOG_UPDATED,
  FUEL_LOG_DELETED,
  REMINDER_CREATED,
  REMINDER_UPDATED,
  REMINDER_DELETED,
  REMINDER_COMPLETED,
  REMINDER_OVERDUE,
  TRIP_CREATED,
  TRIP_UPDATED,
  TRIP_DELETED,
  INVOICE_PAID,
  SUBSCRIPTION_UPGRADED,
  ORGANIZATION_CREATED,
  MEMBER_JOINED,
  MEMBER_REMOVED,
  TELEMATICS_DATA_INGESTED,
  GEOFENCE_ALERT,
  CUSTOM_ROLE_CREATED,
  CUSTOM_ROLE_UPDATED,
  CUSTOM_ROLE_DELETED,
  RESOURCE_PERMISSION_GRANTED,
  RESOURCE_PERMISSION_REVOKED,
  ORG_UNIT_CREATED,
  ORG_UNIT_UPDATED,
  ORG_UNIT_DELETED,
  USER_SCOPE_ASSIGNED,
  USER_SCOPE_REVOKED,
  SECURITY_LOGIN_SUCCESS,
  SECURITY_LOGIN_FAILED,
  SECURITY_BRUTE_FORCE_DETECTED,
  SECURITY_ACCOUNT_LOCKED,
  SECURITY_ACCOUNT_UNLOCKED,
  SECURITY_RATE_LIMIT_ANOMALY,
  AUDIT_CHAIN_INTEGRITY_FAILURE,
  MFA_ENROLLED,
  MFA_DISABLED,
  MFA_BACKUP_CODE_USED,
  // ── FleetOps event names ─────────────────────────────────────────
  WORK_ORDER_CREATED,
  WORK_ORDER_ASSIGNED,
  WORK_ORDER_COMPLETED,
  DISPATCH_JOB_CREATED,
  DISPATCH_JOB_ASSIGNED,
  DISPATCH_JOB_COMPLETED,
  BOOKING_CHECKED_IN,
  DRIVER_SHIFT_CREATED,
  // ── Digital Twin specific event names ────────────────────────────
  VEHICLE_STATUS_CHANGED,
  TRIP_COMPLETED,
} from './event-names';
import { OBSERVABILITY_ALERT_TRIGGERED } from '@/infrastructure/observability/event-names';

// ── FleetOps event handlers ────────────────────────────────────────
import {
  slaTrackingStarterHandler,
  slaTrackingResolverHandler,
  slaResponseRecorderHandler,
  complianceAutoSchedulerHandler,
} from './handlers/fleetops-event-handlers';

let bootstrapped = false;

export function bootstrapEvents(): void {
  if (bootstrapped) return;
  bootstrapped = true;

  const bus = EventBusFactory.getInstance();

  bus.use(loggingMiddleware);
  bus.use(metricsMiddleware);
  bus.use(auditMiddleware);
  bus.use(retryMiddleware);

  const workflowHandler = new WorkflowTriggerHandler();
  const notificationHandler = new NotificationHandler();
  const analyticsHandler = new AnalyticsHandler();
  const intelligenceHandler = new IntelligenceHandler();
  const websocketHandler = new WebSocketHandler();
  const auditHandler = new AuditHandler();
  const permissionCacheHandler = new PermissionCacheInvalidationHandler();
  const securityAuditHandler = new SecurityAuditHandler();
  const alertHandler = new AlertNotificationHandler();
  const webhookDispatchHandler = new WebhookDispatchHandler();
  const aiPredictionHandler = new AIPredictionTriggerHandler();
  const aiInsightHandler = new AIInsightHandler();

  const allEventNames = [
    VEHICLE_CREATED,
    VEHICLE_UPDATED,
    VEHICLE_DELETED,
    EXPENSE_CREATED,
    EXPENSE_UPDATED,
    EXPENSE_DELETED,
    FUEL_LOGGED,
    FUEL_LOG_UPDATED,
    FUEL_LOG_DELETED,
    REMINDER_CREATED,
    REMINDER_UPDATED,
    REMINDER_DELETED,
    REMINDER_COMPLETED,
    REMINDER_OVERDUE,
    TRIP_CREATED,
    TRIP_UPDATED,
    TRIP_DELETED,
    INVOICE_PAID,
    SUBSCRIPTION_UPGRADED,
    ORGANIZATION_CREATED,
    MEMBER_JOINED,
    MEMBER_REMOVED,
    TELEMATICS_DATA_INGESTED,
    GEOFENCE_ALERT,
  ];

  for (const name of allEventNames) {
    bus.subscribe(name, workflowHandler);
    bus.subscribe(name, notificationHandler);
    bus.subscribe(name, analyticsHandler);
    bus.subscribe(name, intelligenceHandler);
    bus.subscribe(name, websocketHandler);
    bus.subscribe(name, auditHandler);
    bus.subscribe(name, webhookDispatchHandler);
  }

  // AI Prediction Triggers — subscribe to domain events that warrant
  // predictive analysis (maintenance forecasting, cost anomaly detection,
  // fuel efficiency predictions, trip pattern learning).
  bus.subscribe(VEHICLE_UPDATED, aiPredictionHandler);
  bus.subscribe(TRIP_CREATED, aiPredictionHandler);
  bus.subscribe(FUEL_LOGGED, aiPredictionHandler);
  bus.subscribe(EXPENSE_CREATED, aiPredictionHandler);
  bus.subscribe(REMINDER_COMPLETED, aiPredictionHandler);

  // AI Insight Handler — reacts to generated predictions by producing
  // actionable insights (dashboards, notifications, recommendations).
  // This is a chained event: AIPredictionTriggerHandler does the heavy
  // ML work, then emits AIPredictionGenerated, which AIInsightHandler
  // consumes to format and deliver the insight.
  bus.subscribe('AIPredictionGenerated', aiInsightHandler);

  const securityEventNames = [
    CUSTOM_ROLE_CREATED,
    CUSTOM_ROLE_UPDATED,
    CUSTOM_ROLE_DELETED,
    RESOURCE_PERMISSION_GRANTED,
    RESOURCE_PERMISSION_REVOKED,
    ORG_UNIT_CREATED,
    ORG_UNIT_UPDATED,
    ORG_UNIT_DELETED,
    USER_SCOPE_ASSIGNED,
    USER_SCOPE_REVOKED,
  ];

  for (const name of securityEventNames) {
    bus.subscribe(name, permissionCacheHandler);
    bus.subscribe(name, auditHandler);
  }

  // Slice 6c: threat-detection / audit-chain events go exclusively to
  // SecurityAuditHandler, which logs them with the correct
  // category='security' + severity and fans critical ones out to
  // organization owners via the notification system. They are NOT also
  // subscribed to the generic AuditHandler (would double-log with worse
  // metadata) or PermissionCacheInvalidationHandler (irrelevant here).
  const threatEventNames = [
    SECURITY_LOGIN_SUCCESS,
    SECURITY_LOGIN_FAILED,
    SECURITY_BRUTE_FORCE_DETECTED,
    SECURITY_ACCOUNT_LOCKED,
    SECURITY_ACCOUNT_UNLOCKED,
    SECURITY_RATE_LIMIT_ANOMALY,
    AUDIT_CHAIN_INTEGRITY_FAILURE,
  ];

  for (const name of threatEventNames) {
    bus.subscribe(name, securityAuditHandler);
  }

  // Slice 6d: MFA events subscribed to SecurityAuditHandler
  // for audit trail purposes (severity 'info', entityType 'security').
  // NOT subscribed to PermissionCacheInvalidationHandler — MFA status
  // doesn't affect cached permission decisions.
  bus.subscribe(MFA_ENROLLED, securityAuditHandler);
  bus.subscribe(MFA_DISABLED, securityAuditHandler);
  bus.subscribe(MFA_BACKUP_CODE_USED, securityAuditHandler);

  // Phase 9 — Enterprise Observability: alert delivery
  bus.subscribe(OBSERVABILITY_ALERT_TRIGGERED, alertHandler);

  // ── FleetOps – SLA Tracking ──────────────────────────────────────
  // Start SLA tracking when work orders or dispatch jobs are created.
  bus.subscribe(WORK_ORDER_CREATED, slaTrackingStarterHandler);
  bus.subscribe(DISPATCH_JOB_CREATED, slaTrackingStarterHandler);

  // Record first-response time when work orders or dispatch jobs are assigned.
  bus.subscribe(WORK_ORDER_ASSIGNED, slaResponseRecorderHandler);
  bus.subscribe(DISPATCH_JOB_ASSIGNED, slaResponseRecorderHandler);

  // Resolve SLA tracking (met/breached) when work orders, dispatch jobs,
  // or bookings reach a terminal state.
  bus.subscribe(WORK_ORDER_COMPLETED, slaTrackingResolverHandler);
  bus.subscribe(DISPATCH_JOB_COMPLETED, slaTrackingResolverHandler);
  bus.subscribe(BOOKING_CHECKED_IN, slaTrackingResolverHandler);

  // ── FleetOps – Compliance Auto-Scheduling ────────────────────────
  // When a vehicle or driver is created, auto-schedule compliance records
  // for all active compliance rules that apply to that entity type.
  bus.subscribe(VEHICLE_CREATED, complianceAutoSchedulerHandler);
  bus.subscribe(DRIVER_SHIFT_CREATED, complianceAutoSchedulerHandler);

  // ── Digital Twin Projection ──────────────────────────────────────
  // Subscribe to events that update the digital twin read model.
  // This handler maintains a materialized view of vehicle state by
  // projecting domain events into a query-optimized representation
  // used by real-time dashboards, status APIs, and analytics.
  const digitalTwinEventNames = [
    VEHICLE_CREATED,
    VEHICLE_UPDATED,
    VEHICLE_STATUS_CHANGED,
    FUEL_LOGGED,
    TRIP_CREATED,
    TRIP_COMPLETED,
    REMINDER_OVERDUE,
    REMINDER_COMPLETED,
    TELEMATICS_DATA_INGESTED,
    GEOFENCE_ALERT,
    WORK_ORDER_COMPLETED,
  ];

  for (const name of digitalTwinEventNames) {
    bus.subscribe(name, digitalTwinProjectionHandler);
  }

  console.log('[EventBus] Bootstrap complete.');
}