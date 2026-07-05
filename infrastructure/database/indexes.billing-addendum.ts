// infrastructure/database/indexes.billing-addendum.ts
//
// Merge into the INDEXES map in infrastructure/database/indexes.ts.

export const BILLING_INDEXES = {
  tblinvoices: [
    {
      key: { merchantReference: 1 },
      name: 'idx_invoice_merchant_ref',
      unique: true,
    },
    {
      key: { tenantId: 1, organizationId: 1, createdAt: -1 },
      name: 'idx_invoice_tenant_org_created',
    },
    {
      key: { status: 1, createdAt: 1 },
      name: 'idx_invoice_status_created',
    },
  ],
} as const;

/**
 * package.json changes required for this batch:
 *
 * REMOVE:
 *   "stripe": "^..."        (was never actually listed in the provided
 *                             package.json dependencies, only imported
 *                             in modules/billing/services/stripe.service.ts)
 *
 * ADD:
 *   "paynow": "^2.2.2"
 *
 * DELETE FILE:
 *   modules/billing/services/stripe.service.ts
 *   (fully superseded by modules/billing/services/billing.service.ts +
 *    infrastructure/payments/paynow.client.ts in this batch)
 *
 * ENV VARS (replace STRIPE_SECRET_KEY with):
 *   PAYNOW_INTEGRATION_ID=
 *   PAYNOW_INTEGRATION_KEY=
 */