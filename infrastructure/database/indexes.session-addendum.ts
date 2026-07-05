// infrastructure/database/indexes.session-addendum.ts
//
// Merge into the INDEXES map in infrastructure/database/indexes.ts.

export const SESSION_INDEXES = {
  tblusersessions: [
    { key: { sessionId: 1 }, name: 'idx_session_sessionid', unique: true },
    { key: { tenantId: 1, userId: 1, status: 1 }, name: 'idx_session_tenant_user_status' },
    { key: { expiresAt: 1 }, name: 'idx_session_expires' },
  ],
  tblrefreshtokens: [
    { key: { tokenHash: 1 }, name: 'idx_refreshtoken_hash', unique: true },
    { key: { familyId: 1 }, name: 'idx_refreshtoken_family' },
    { key: { tenantId: 1, userId: 1, status: 1 }, name: 'idx_refreshtoken_tenant_user_status' },
    { key: { expiresAt: 1 }, name: 'idx_refreshtoken_expires' },
  ],
  tblapikeys: [
    { key: { keyPrefix: 1 }, name: 'idx_apikey_prefix', unique: true },
    { key: { organizationId: 1, status: 1 }, name: 'idx_apikey_org_status' },
  ],
} as const;