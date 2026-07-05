// infrastructure/database/indexes.security-addendum.ts
//
// Merge these entries into the INDEXES map in infrastructure/database/indexes.ts.

export const SECURITY_INDEXES = {
  tblorgunits: [
    {
      key: { organizationId: 1, parentId: 1 },
      name: 'idx_orgunit_org_parent',
    },
    {
      key: { organizationId: 1, type: 1, status: 1 },
      name: 'idx_orgunit_org_type_status',
    },
    {
      key: { organizationId: 1, path: 1 },
      name: 'idx_orgunit_org_path',
    },
  ],
  tblcustomroles: [
    {
      key: { organizationId: 1, name: 1 },
      name: 'idx_customrole_org_name',
      unique: true,
    },
    {
      key: { organizationId: 1, status: 1 },
      name: 'idx_customrole_org_status',
    },
  ],
  tblresourcepermissions: [
    {
      key: { organizationId: 1, subjectId: 1, permission: 1 },
      name: 'idx_respermission_org_subject_permission',
    },
    {
      key: { organizationId: 1, resourceType: 1, resourceId: 1 },
      name: 'idx_respermission_org_resource',
    },
    {
      key: { organizationId: 1, orgUnitId: 1 },
      name: 'idx_respermission_org_orgunit',
    },
    {
      key: { expiresAt: 1 },
      name: 'idx_respermission_expires',
    },
  ],
  tbluser_scope_assignments: [
    {
      key: { organizationId: 1, userId: 1 },
      name: 'idx_scopeassignment_org_user',
    },
    {
      key: { organizationId: 1, orgUnitId: 1 },
      name: 'idx_scopeassignment_org_orgunit',
    },
    {
      key: { organizationId: 1, userId: 1, orgUnitId: 1 },
      name: 'idx_scopeassignment_org_user_orgunit',
      unique: true,
    },
  ],
} as const;