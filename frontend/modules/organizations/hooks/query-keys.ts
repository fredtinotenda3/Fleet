// frontend/modules/organizations/hooks/query-keys.ts

export const organizationKeys = {
  all: ['organizations'] as const,
  lists: () => [...organizationKeys.all, 'list'] as const,
  detail: (id: string) => [...organizationKeys.all, 'detail', id] as const,
  statistics: (id: string) => [...organizationKeys.all, 'statistics', id] as const,
  auditLog: (id: string, page: number, limit: number) =>
    [...organizationKeys.all, 'audit-log', id, page, limit] as const,
  invites: (id: string) => [...organizationKeys.all, 'invites', id] as const,
};

export const orgUnitKeys = {
  all: ['org-units'] as const,
  lists: () => [...orgUnitKeys.all, 'list'] as const,
  list: (filters?: { type?: string; parentId?: string | null }) =>
    [...orgUnitKeys.lists(), filters ?? {}] as const,
  detail: (id: string) => [...orgUnitKeys.all, 'detail', id] as const,
};