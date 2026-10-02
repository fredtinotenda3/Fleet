// frontend/modules/dispatch/routes/index.ts

export const DISPATCH_ROUTES = {
  list: '/dispatch',
  detail: (id: string) => `/dispatch/${id}`,
} as const;
