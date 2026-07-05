// server/permissions/roles.rules-addendum.ts
//
// Optional follow-up: introduces dedicated rule permissions instead of
// reusing ORG_VIEW/ORG_MANAGE (which is what app/api/rules/**/route.ts
// uses today so the module compiles and works immediately). Merge into
// server/permissions/roles.ts when finer-grained rule access control is
// needed.
//
// 1. Add to the Permission enum:
//
//   RULE_VIEW = 'rule:view',
//   RULE_CREATE = 'rule:create',
//   RULE_EDIT = 'rule:edit',
//   RULE_DELETE = 'rule:delete',
//   RULE_TEST = 'rule:test',
//
// 2. Role.SUPER_ADMIN and Role.ORGANIZATION_OWNER already cover every new
//    permission automatically (both are defined as Object.values(Permission)).
//
// 3. Add to Role.FLEET_MANAGER's permission array:
//
//   Permission.RULE_VIEW,
//   Permission.RULE_TEST,
//
//    (Fleet managers can see and test rules but not author or change them
//    by default in this initial phase â€” rule authoring is reserved for
//    organization owners, matching how workflow *definitions* aren't
//    editable by fleet managers either, only workflow *instances* are
//    actionable by them via approve/reject.)
//
// 4. Once merged, update:
//   - app/api/rules/route.ts            (GET -> RULE_VIEW, POST -> RULE_CREATE)
//   - app/api/rules/[id]/route.ts        (GET -> RULE_VIEW, PUT -> RULE_EDIT, DELETE -> RULE_DELETE)
//   - app/api/rules/[id]/test/route.ts   (POST -> RULE_TEST)
//   - app/api/rules/[id]/duplicate/route.ts (POST -> RULE_CREATE)
//   - app/api/rules/evaluate/route.ts    (POST -> RULE_TEST, or a new RULE_EXECUTE if
//     manually firing a trigger should be gated more strictly than testing one)