// server/events/event-names.ts

export const VEHICLE_CREATED = 'VehicleCreated';
export const VEHICLE_UPDATED = 'VehicleUpdated';
export const VEHICLE_DELETED = 'VehicleDeleted';
export const VEHICLE_STATUS_CHANGED = 'VehicleStatusChanged';

export const EXPENSE_CREATED = 'ExpenseCreated';
export const EXPENSE_UPDATED = 'ExpenseUpdated';
export const EXPENSE_DELETED = 'ExpenseDeleted';

export const FUEL_LOGGED = 'FuelLogged';
export const FUEL_LOG_UPDATED = 'FuelLogUpdated';
export const FUEL_LOG_DELETED = 'FuelLogDeleted';

export const REMINDER_CREATED = 'ReminderCreated';
export const REMINDER_UPDATED = 'ReminderUpdated';
export const REMINDER_DELETED = 'ReminderDeleted';
export const REMINDER_COMPLETED = 'ReminderCompleted';
export const REMINDER_OVERDUE = 'ReminderOverdue';

export const TRIP_CREATED = 'TripCreated';
export const TRIP_UPDATED = 'TripUpdated';
export const TRIP_DELETED = 'TripDeleted';
export const TRIP_COMPLETED = 'TripCompleted';

export const RULE_CREATED = 'RuleCreated';
export const RULE_UPDATED = 'RuleUpdated';
export const RULE_DELETED = 'RuleDeleted';

export const INVOICE_CREATED = 'InvoiceCreated';
export const INVOICE_PAID = 'InvoicePaid';
export const SUBSCRIPTION_UPGRADED = 'SubscriptionUpgraded';

export const ORGANIZATION_CREATED = 'OrganizationCreated';
export const MEMBER_JOINED = 'MemberJoined';
export const MEMBER_REMOVED = 'MemberRemoved';

export const TELEMATICS_DATA_INGESTED = 'TelematicsDataIngested';
export const GEOFENCE_ALERT = 'GeofenceAlert';

// ── FleetOps (Dispatch, Shifts, Bookings, Work Orders, Workshop, Spare Parts, Procurement, Vendors, SLA, Compliance) ──

export const DISPATCH_JOB_CREATED = 'DispatchJobCreated';
export const DISPATCH_JOB_ASSIGNED = 'DispatchJobAssigned';
export const DISPATCH_JOB_STARTED = 'DispatchJobStarted';
export const DISPATCH_JOB_COMPLETED = 'DispatchJobCompleted';
export const DISPATCH_JOB_CANCELLED = 'DispatchJobCancelled';

export const DRIVER_SHIFT_CREATED = 'DriverShiftCreated';
export const DRIVER_SHIFT_UPDATED = 'DriverShiftUpdated';
export const DRIVER_SHIFT_CANCELLED = 'DriverShiftCancelled';
export const DRIVER_SHIFT_CONFLICT_DETECTED = 'DriverShiftConflictDetected';

export const BOOKING_CREATED = 'BookingCreated';
export const BOOKING_APPROVED = 'BookingApproved';
export const BOOKING_REJECTED = 'BookingRejected';
export const BOOKING_CANCELLED = 'BookingCancelled';
export const BOOKING_CHECKED_OUT = 'BookingCheckedOut';
export const BOOKING_CHECKED_IN = 'BookingCheckedIn';

export const WORK_ORDER_CREATED = 'WorkOrderCreated';
export const WORK_ORDER_ASSIGNED = 'WorkOrderAssigned';
export const WORK_ORDER_STATUS_CHANGED = 'WorkOrderStatusChanged';
export const WORK_ORDER_PARTS_CONSUMED = 'WorkOrderPartsConsumed';
export const WORK_ORDER_COMPLETED = 'WorkOrderCompleted';
export const WORK_ORDER_CANCELLED = 'WorkOrderCancelled';

export const WORKSHOP_BAY_CREATED = 'WorkshopBayCreated';
export const WORKSHOP_BAY_STATUS_CHANGED = 'WorkshopBayStatusChanged';
export const MECHANIC_ASSIGNED = 'MechanicAssigned';
export const MECHANIC_UNASSIGNED = 'MechanicUnassigned';

export const SPARE_PART_CREATED = 'SparePartCreated';
export const SPARE_PART_UPDATED = 'SparePartUpdated';
export const STOCK_RECEIVED = 'StockReceived';
export const STOCK_CONSUMED = 'StockConsumed';
export const STOCK_ADJUSTED = 'StockAdjusted';
export const STOCK_LOW_THRESHOLD_BREACHED = 'StockLowThresholdBreached';

export const PURCHASE_REQUEST_CREATED = 'PurchaseRequestCreated';
export const PURCHASE_REQUEST_APPROVED = 'PurchaseRequestApproved';
export const PURCHASE_REQUEST_REJECTED = 'PurchaseRequestRejected';
export const PURCHASE_ORDER_CREATED = 'PurchaseOrderCreated';
export const PURCHASE_ORDER_SENT = 'PurchaseOrderSent';
export const PURCHASE_ORDER_RECEIVED = 'PurchaseOrderReceived';
export const PURCHASE_ORDER_CANCELLED = 'PurchaseOrderCancelled';

export const VENDOR_CREATED = 'VendorCreated';
export const VENDOR_UPDATED = 'VendorUpdated';
export const VENDOR_STATUS_CHANGED = 'VendorStatusChanged';
export const VENDOR_RATED = 'VendorRated';

export const SLA_POLICY_CREATED = 'SlaPolicyCreated';
export const SLA_POLICY_UPDATED = 'SlaPolicyUpdated';
export const SLA_TRACKING_STARTED = 'SlaTrackingStarted';
export const SLA_WARNING_TRIGGERED = 'SlaWarningTriggered';
export const SLA_BREACHED = 'SlaBreached';
export const SLA_MET = 'SlaMet';

export const COMPLIANCE_RULE_CREATED = 'ComplianceRuleCreated';
export const COMPLIANCE_RECORD_CREATED = 'ComplianceRecordCreated';
export const COMPLIANCE_RECORD_DUE_SOON = 'ComplianceRecordDueSoon';
export const COMPLIANCE_RECORD_OVERDUE = 'ComplianceRecordOverdue';
export const COMPLIANCE_RECORD_RESOLVED = 'ComplianceRecordResolved';

// ── AI & Predictions ──

export const AI_PREDICTION_GENERATED = 'AIPredictionGenerated';
export const AI_PREDICTION_CONFIRMED = 'AIPredictionConfirmed';
export const AI_PREDICTION_DISMISSED = 'AIPredictionDismissed';
export const AI_INSIGHT_AVAILABLE = 'AIInsightAvailable';

// ── Security / Permission Engine (Slice 6a) ──

export const CUSTOM_ROLE_CREATED = 'CustomRoleCreated';
export const CUSTOM_ROLE_UPDATED = 'CustomRoleUpdated';
export const CUSTOM_ROLE_DELETED = 'CustomRoleDeleted';
export const RESOURCE_PERMISSION_GRANTED = 'ResourcePermissionGranted';
export const RESOURCE_PERMISSION_REVOKED = 'ResourcePermissionRevoked';
export const ORG_UNIT_CREATED = 'OrgUnitCreated';
export const ORG_UNIT_UPDATED = 'OrgUnitUpdated';
export const ORG_UNIT_DELETED = 'OrgUnitDeleted';
export const USER_SCOPE_ASSIGNED = 'UserScopeAssigned';
export const USER_SCOPE_REVOKED = 'UserScopeRevoked';

// ── Session Management, Refresh Tokens & API Keys (Slice 6b) ──

export const SESSION_CREATED = 'SessionCreated';
export const SESSION_REVOKED = 'SessionRevoked';
export const API_KEY_CREATED = 'ApiKeyCreated';
export const API_KEY_REVOKED = 'ApiKeyRevoked';
export const REFRESH_TOKEN_REUSE_DETECTED = 'RefreshTokenReuseDetected';

// ── Immutable Audit Trail & Threat Detection (Slice 6c) ──

export const SECURITY_LOGIN_SUCCESS = 'SecurityLoginSuccess';
export const SECURITY_LOGIN_FAILED = 'SecurityLoginFailed';
export const SECURITY_BRUTE_FORCE_DETECTED = 'SecurityBruteForceDetected';
export const SECURITY_ACCOUNT_LOCKED = 'SecurityAccountLocked';
export const SECURITY_ACCOUNT_UNLOCKED = 'SecurityAccountUnlocked';
export const SECURITY_RATE_LIMIT_ANOMALY = 'SecurityRateLimitAnomaly';
export const AUDIT_CHAIN_INTEGRITY_FAILURE = 'AuditChainIntegrityFailure';

// ── Digital Twin (Phase 13) ──
export const DIGITAL_TWIN_UPDATED = 'DigitalTwinUpdated';
export const DIGITAL_TWIN_REBUILT = 'DigitalTwinRebuilt';

// ── MFA (Slice 6d) ──

export { MFA_ENROLLED, MFA_DISABLED, MFA_BACKUP_CODE_USED } from '@/modules/security/events/mfa.events';