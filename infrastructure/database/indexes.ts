// infrastructure/database/indexes.ts

import connectToDatabase from './mongodb';
import { ensureDigitalTwinIndexes } from './indexes.digital-twin-addendum';

export const INDEXES = {
  // ── Domain collections ───────────────────────────────────────────
  tblvehicles: [
    {
      key: { tenantId: 1, license_plate: 1 },
      name: 'idx_vehicle_tenant_plate',
      unique: true,
    },
    {
      key: { tenantId: 1, status: 1, isDeleted: 1 },
      name: 'idx_vehicle_tenant_status',
    },
    {
      key: { tenantId: 1, make: 1, model: 1 },
      name: 'idx_vehicle_tenant_make_model',
    },
    {
      key: { tenantId: 1, createdAt: -1 },
      name: 'idx_vehicle_tenant_created',
    },
    {
      key: { isDeleted: 1, status: 1 },
      name: 'idx_vehicle_deleted_status',
    },
    // Phase 7 — org-unit scoped queries (getFilteredVehiclesInScope)
    {
      key: { tenantId: 1, orgUnitId: 1 },
      name: 'idx_vehicle_tenant_orgunit',
    },
  ],
  tblexpenses: [
    {
      key: { tenantId: 1, license_plate: 1, date: -1 },
      name: 'idx_expense_tenant_plate_date',
    },
    {
      key: { tenantId: 1, expense_type_id: 1 },
      name: 'idx_expense_tenant_type',
    },
    {
      key: { tenantId: 1, date: -1 },
      name: 'idx_expense_tenant_date',
    },
    {
      key: { tenantId: 1, amount: 1 },
      name: 'idx_expense_tenant_amount',
    },
    {
      key: { isDeleted: 1, tenantId: 1 },
      name: 'idx_expense_deleted_tenant',
    },
    // Phase 7 — org-unit scoped queries
    {
      key: { tenantId: 1, orgUnitId: 1 },
      name: 'idx_expense_tenant_orgunit',
    },
  ],
  tblfuellogs: [
    {
      key: { tenantId: 1, license_plate: 1, date: -1 },
      name: 'idx_fuel_tenant_plate_date',
    },
    {
      key: { tenantId: 1, date: -1 },
      name: 'idx_fuel_tenant_date',
    },
    {
      key: { tenantId: 1, unit_id: 1 },
      name: 'idx_fuel_tenant_unit',
    },
    // Phase 7 — org-unit scoped queries
    {
      key: { tenantId: 1, orgUnitId: 1 },
      name: 'idx_fuel_tenant_orgunit',
    },
  ],
  tblreminders: [
    {
      key: { tenantId: 1, license_plate: 1, due_date: 1 },
      name: 'idx_reminder_tenant_plate_due',
    },
    {
      key: { tenantId: 1, status: 1, due_date: 1 },
      name: 'idx_reminder_tenant_status_due',
    },
    {
      key: { tenantId: 1, assigned_to: 1, status: 1 },
      name: 'idx_reminder_tenant_assignee_status',
    },
    {
      key: { tenantId: 1, category: 1 },
      name: 'idx_reminder_tenant_category',
    },
    {
      key: { tenantId: 1, priority: 1, status: 1 },
      name: 'idx_reminder_tenant_priority_status',
    },
  ],
  tbltrips: [
    {
      key: { tenantId: 1, license_plate: 1, date: -1 },
      name: 'idx_trip_tenant_plate_date',
    },
    {
      key: { tenantId: 1, date: -1 },
      name: 'idx_trip_tenant_date',
    },
    {
      key: { tenantId: 1, driver_id: 1 },
      name: 'idx_trip_tenant_driver',
    },
    // Phase 7 — org-unit scoped queries
    {
      key: { tenantId: 1, orgUnitId: 1 },
      name: 'idx_trip_tenant_orgunit',
    },
  ],
  tblmeterlogs: [
    {
      key: { tenantId: 1, license_plate: 1, date: -1 },
      name: 'idx_meter_tenant_plate_date',
    },
  ],

  // ── FleetOps collections ─────────────────────────────────────────
  tbldispatchjobs: [
    { key: { tenantId: 1, status: 1, priority: 1 }, name: 'idx_dispatch_tenant_status_priority' },
    { key: { tenantId: 1, assignedDriverId: 1 }, name: 'idx_dispatch_tenant_driver' },
    { key: { tenantId: 1, assignedVehicleId: 1 }, name: 'idx_dispatch_tenant_vehicle' },
    { key: { tenantId: 1, scheduledFor: 1 }, name: 'idx_dispatch_tenant_scheduled' },
  ],
  tbldrivershifts: [
    { key: { tenantId: 1, driverId: 1, startTime: 1 }, name: 'idx_shift_tenant_driver_start' },
    { key: { tenantId: 1, vehicleId: 1, startTime: 1 }, name: 'idx_shift_tenant_vehicle_start' },
    { key: { tenantId: 1, status: 1 }, name: 'idx_shift_tenant_status' },
  ],
  tblbookings: [
    { key: { tenantId: 1, vehicleId: 1, startTime: 1, endTime: 1 }, name: 'idx_booking_tenant_vehicle_window' },
    { key: { tenantId: 1, requestedBy: 1, status: 1 }, name: 'idx_booking_tenant_requester_status' },
    { key: { tenantId: 1, status: 1 }, name: 'idx_booking_tenant_status' },
  ],
  tblworkorders: [
    { key: { tenantId: 1, status: 1, priority: 1 }, name: 'idx_workorder_tenant_status_priority' },
    { key: { tenantId: 1, license_plate: 1 }, name: 'idx_workorder_tenant_plate' },
    { key: { tenantId: 1, assignedMechanicId: 1 }, name: 'idx_workorder_tenant_mechanic' },
    { key: { tenantId: 1, bayId: 1 }, name: 'idx_workorder_tenant_bay' },
  ],
  tblworkshopbays: [
    { key: { tenantId: 1, status: 1 }, name: 'idx_bay_tenant_status' },
  ],
  tblspareparts: [
    { key: { tenantId: 1, sku: 1 }, name: 'idx_sparepart_tenant_sku', unique: true },
    { key: { tenantId: 1, category: 1 }, name: 'idx_sparepart_tenant_category' },
    { key: { tenantId: 1, quantityOnHand: 1 }, name: 'idx_sparepart_tenant_qty' },
  ],
  tblstockmovements: [
    { key: { tenantId: 1, sparePartId: 1, createdAt: -1 }, name: 'idx_stockmove_tenant_part_created' },
    { key: { tenantId: 1, workOrderId: 1 }, name: 'idx_stockmove_tenant_workorder' },
  ],
  tblpurchaserequests: [
    { key: { tenantId: 1, status: 1 }, name: 'idx_pr_tenant_status' },
    { key: { tenantId: 1, requestedBy: 1 }, name: 'idx_pr_tenant_requester' },
  ],
  tblpurchaseorders: [
    { key: { tenantId: 1, status: 1 }, name: 'idx_po_tenant_status' },
    { key: { tenantId: 1, vendorId: 1 }, name: 'idx_po_tenant_vendor' },
  ],
  tblvendors: [
    { key: { tenantId: 1, name: 1 }, name: 'idx_vendor_tenant_name' },
    { key: { tenantId: 1, category: 1, status: 1 }, name: 'idx_vendor_tenant_category_status' },
  ],
  tblslapolicies: [
    { key: { tenantId: 1, entityType: 1, status: 1 }, name: 'idx_slapolicy_tenant_entitytype_status' },
  ],
  tblslatrackings: [
    { key: { tenantId: 1, entityType: 1, entityId: 1 }, name: 'idx_slatrack_tenant_entity' },
    { key: { tenantId: 1, status: 1, targetAt: 1 }, name: 'idx_slatrack_tenant_status_target' },
  ],
  tblcompliancerules: [
    { key: { tenantId: 1, appliesTo: 1, status: 1 }, name: 'idx_compliancerule_tenant_appliesto_status' },
  ],
  tblcompliancerecords: [
    { key: { tenantId: 1, entityType: 1, entityId: 1 }, name: 'idx_compliancerecord_tenant_entity' },
    { key: { tenantId: 1, status: 1, dueDate: 1 }, name: 'idx_compliancerecord_tenant_status_due' },
  ],

  // ── Organization & auth ──────────────────────────────────────────
  tblorganizations: [
    { key: { slug: 1 }, name: 'idx_org_slug', unique: true },
    { key: { ownerId: 1 }, name: 'idx_org_owner' },
    { key: { 'members.userId': 1 }, name: 'idx_org_member_user' },
  ],
  tblnotifications: [
    {
      key: { tenantId: 1, userId: 1, sentAt: -1 },
      name: 'idx_notif_tenant_user_sent',
    },
    {
      key: { tenantId: 1, userId: 1, read: 1 },
      name: 'idx_notif_tenant_user_read',
    },
  ],

  // ── Security ─────────────────────────────────────────────────────
  tblauditlog: [
    { key: { sequence: 1 }, name: 'idx_audit_sequence', unique: true },
    { key: { tenantId: 1, recordedAt: -1 }, name: 'idx_audit_tenant_recorded' },
    { key: { category: 1, severity: 1 }, name: 'idx_audit_category_severity' },
    { key: { entityType: 1, entityId: 1 }, name: 'idx_audit_entity' },
    { key: { userId: 1, recordedAt: -1 }, name: 'idx_audit_user_recorded' },
  ],
  tblloginattempts: [
    { key: { email: 1, tenantId: 1, attemptedAt: -1 }, name: 'idx_loginattempt_email_tenant_time' },
    { key: { ipAddress: 1, attemptedAt: -1 }, name: 'idx_loginattempt_ip_time' },
  ],
  tblaccountlockouts: [
    { key: { email: 1, tenantId: 1 }, name: 'idx_lockout_email_tenant', unique: true },
    { key: { lockedUntil: 1 }, name: 'idx_lockout_locked_until' },
  ],
  tblmfafactors: [
    { key: { userId: 1, status: 1 }, name: 'idx_mfa_factor_user_status' },
    { key: { tenantId: 1 }, name: 'idx_mfa_factor_tenant' },
  ],
  tblmfabackupcodes: [
    { key: { userId: 1, used: 1 }, name: 'idx_mfa_backup_user_used' },
    { key: { codeHash: 1 }, name: 'idx_mfa_backup_hash' },
  ],
  tblssoconnections: [
    { key: { organizationId: 1, status: 1 }, name: 'idx_sso_org_status' },
    { key: { domainHints: 1, status: 1 }, name: 'idx_sso_domainhints_status' },
  ],

  // ── Phase 7 — Org Unit Hierarchy ─────────────────────────────────
  tblorgunits: [
    {
      key: { organizationId: 1, path: 1 },
      name: 'idx_orgunit_org_path_contains',
    },
  ],

  // ── Phase 10a — Plugins / Integrations ───────────────────────────
  tblplugins: [
    {
      key: { pluginId: 1 },
      name: 'idx_plugin_pluginid',
      unique: true,
    },
    {
      key: { status: 1 },
      name: 'idx_plugin_status',
    },
    {
      key: { isSystemPlugin: 1 },
      name: 'idx_plugin_issystem',
    },
  ],
  tblplugininstallations: [
    {
      key: { organizationId: 1, pluginId: 1 },
      name: 'idx_plugininstall_org_pluginid',
      unique: true,
    },
    {
      key: { organizationId: 1, status: 1 },
      name: 'idx_plugininstall_org_status',
    },
    {
      key: { pluginId: 1 },
      name: 'idx_plugininstall_pluginid',
    },
  ],

  // ── Phase 10b — Webhooks / Event Subscriptions ───────────────────
  tblwebhooksubscriptions: [
    {
      key: { organizationId: 1, status: 1, events: 1 },
      name: 'idx_webhooksub_org_status_events',
    },
    {
      key: { organizationId: 1, createdAt: -1 },
      name: 'idx_webhooksub_org_created',
    },
  ],
  tblwebhookdeliveries: [
    {
      key: { deliveryId: 1 },
      name: 'idx_webhookdelivery_deliveryid',
      unique: true,
    },
    {
      key: { organizationId: 1, subscriptionId: 1, createdAt: -1 },
      name: 'idx_webhookdelivery_org_sub_created',
    },
    {
      key: { organizationId: 1, status: 1 },
      name: 'idx_webhookdelivery_org_status',
    },
  ],

  // ── Slice 10d — OAuth Clients ────────────────────────────────────
  tbloauth_clients: [
    {
      key: { clientId: 1 },
      name: 'idx_oauth_client_clientid',
      unique: true,
    },
    {
      key: { organizationId: 1, status: 1 },
      name: 'idx_oauth_client_org_status',
    },
    {
      key: { organizationId: 1, createdAt: -1 },
      name: 'idx_oauth_client_org_created',
    },
    {
      key: { expiresAt: 1 },
      name: 'idx_oauth_client_expires',
    },
  ],
  tbloauth_tokens: [
    {
      key: { tokenHash: 1 },
      name: 'idx_oauth_token_hash',
      unique: true,
    },
    {
      key: { clientId: 1, status: 1, expiresAt: 1 },
      name: 'idx_oauth_token_client_status_expires',
    },
    {
      key: { userId: 1, status: 1 },
      name: 'idx_oauth_token_user_status',
    },
    {
      key: { expiresAt: 1 },
      name: 'idx_oauth_token_expires',
    },
  ],

  // ── External Providers ───────────────────────────────────────────
  tblexternal_providers: [
    {
      key: { providerId: 1 },
      name: 'idx_extprovider_providerid',
      unique: true,
    },
    {
      key: { organizationId: 1, status: 1 },
      name: 'idx_extprovider_org_status',
    },
    {
      key: { domainHints: 1, status: 1 },
      name: 'idx_extprovider_domainhints_status',
    },
    {
      key: { organizationId: 1, type: 1 },
      name: 'idx_extprovider_org_type',
    },
  ],
} as const;

/**
 * IMPORTANT INTEGRITY NOTES:
 *
 * 1. The `{ organizationId, pluginId }` unique index on tblplugininstallations
 *    is the integrity constraint that makes PluginService.install()'s pre-check
 *    ("findByOrgAndPluginId then reject if found") race-safe under
 *    concurrent installs — without it, two simultaneous POST /api/plugins
 *    requests for the same pluginId could both pass the pre-check and
 *    insert duplicate installation rows.
 *
 * 2. The `{ organizationId, status, events }` compound index on
 *    tblwebhooksubscriptions is the hot-path query: every single domain
 *    event that fires calls WebhookSubscriptionRepository.findActiveSubscribers(),
 *    which filters on exactly these three fields. At fleet scale (thousands of orgs,
 *    many events/minute) this must stay index-covered rather than scanning
 *    every subscription document per event.
 *
 * 3. The `{ clientId, status, expiresAt }` compound index on tbloauth_tokens
 *    supports the hot-path token introspection query during API authentication:
 *    lookup by clientId, filter active tokens, and prune expired ones in a
 *    single index-covered scan. At high request volumes this avoids a full
 *    collection scan on every authenticated request.
 *
 * 4. FleetOps indexes (tbldispatchjobs, tbldrivershifts, tblbookings, tblworkorders,
 *    tblworkshopbays, tblspareparts, tblstockmovements, tblpurchaserequests,
 *    tblpurchaseorders, tblvendors, tblslapolicies, tblslatrackings,
 *    tblcompliancerules, tblcompliancerecords) are designed for multi-tenant
 *    isolation (tenantId prefix) plus domain-specific hot-path queries.
 */

export async function ensureIndexes(): Promise<void> {
  const db = await connectToDatabase();

  for (const [collectionName, indexes] of Object.entries(INDEXES)) {
    const collection = db.collection(collectionName);
    for (const indexDef of indexes) {
      try {
        await collection.createIndex(
          (indexDef as any).key,
          {
            name: (indexDef as any).name,
            unique: (indexDef as any).unique || false,
            background: true,
          }
        );
      } catch (err: any) {
        // Index already exists or name conflict — log and continue
        if (err?.code !== 85 && err?.code !== 86) {
          console.error(
            `[Indexes] Failed to create ${(indexDef as any).name}:`,
            err.message
          );
        }
      }
    }
  }

  // Phase 13 — Digital Twin projection indexes
  await ensureDigitalTwinIndexes(db);

  console.log('[Indexes] All indexes ensured');
}