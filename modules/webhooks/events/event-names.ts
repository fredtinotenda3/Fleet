// modules/webhooks/events/event-names.ts
//
// Merge these into server/events/event-names.ts when wiring bootstrap
// subscriptions (subscribed onto AuditHandler/PermissionCacheInvalidationHandler-
// style handlers the same way Phase 6's security events are).

export const WEBHOOK_SUBSCRIPTION_CREATED = 'WebhookSubscriptionCreated';
export const WEBHOOK_SUBSCRIPTION_UPDATED = 'WebhookSubscriptionUpdated';
export const WEBHOOK_SUBSCRIPTION_DELETED = 'WebhookSubscriptionDeleted';
export const WEBHOOK_DELIVERY_FAILED = 'WebhookDeliveryFailed';
export const WEBHOOK_DELIVERY_SUCCEEDED = 'WebhookDeliverySucceeded';