
// frontend/shared/forms/FormPermissions.ts

import { Permission, permissionService } from '@/server/permissions/roles';

/**
 * RESOLVED (Phase E, task 3): this file shipped as an empty placeholder
 * -- FormBuilder.tsx / FormSections.tsx / ConditionalFields.tsx /
 * DynamicFields.tsx are all form-permission consumers by name, but
 * nothing here backed them, meaning any field- or section-level gating
 * they need would have had to hand-roll its own role check the same
 * way Sidebar.tsx / WidgetPermissions.ts / maintenance's utils/index.ts
 * did before their own Phase E fixes. Implemented on the exact same
 * shape as canViewWidget() in
 * frontend/shared/dashboards/WidgetPermissions.ts: a definition carries
 * an optional `permission` list, resolved through the same
 * permissionService every other authorization check in this app uses.
 * No new permission framework, no role strings.
 */

/** A single field or section in a dynamic/conditional form. */
export interface FormFieldPermissionDefinition {
  /** Field is visible if the user holds ANY of these permissions. Omit/empty = visible to everyone who can see the form. */
  viewPermission?: Permission[];
  /** Field is editable (not just visible/read-only) if the user holds ANY of these permissions. Omit/empty = editable by anyone who can view it. */
  editPermission?: Permission[];
}

/**
 * Whether a field/section should render at all for this user's roles.
 * Mirrors canViewWidget()'s "no permission list = visible" default so
 * forms with no gating configured behave exactly as they do today.
 */
export function canViewField(definition: FormFieldPermissionDefinition, roles: string[]): boolean {
  if (!definition.viewPermission || definition.viewPermission.length === 0) return true;
  return permissionService.hasAnyPermission(roles, definition.viewPermission);
}

/**
 * Whether a visible field should render editable vs. read-only/disabled.
 * Falls back to canViewField()'s permission list when editPermission
 * isn't set, so a field gated only on viewPermission is editable by
 * anyone who can see it (today's implicit behavior), rather than
 * silently becoming read-only for everyone.
 */
export function canEditField(definition: FormFieldPermissionDefinition, roles: string[]): boolean {
  const required = definition.editPermission ?? definition.viewPermission;
  if (!required || required.length === 0) return true;
  return permissionService.hasAnyPermission(roles, required);
}

/**
 * Convenience for FormSections.tsx: a section is visible if at least
 * one of its fields is visible to the current user's roles.
 */
export function getVisibleFields<T extends FormFieldPermissionDefinition>(
  fields: T[],
  roles: string[]
): T[] {
  return fields.filter((field) => canViewField(field, roles));
}