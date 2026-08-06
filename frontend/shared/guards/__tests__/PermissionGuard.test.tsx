// frontend/shared/guards/__tests__/PermissionGuard.test.tsx
//
// Phase E, objective 6 (test coverage) -- PermissionGuard.
//
// ASSUMPTION (please verify against your actual project config): this
// assumes Jest + @testing-library/react + a DOM test environment
// ("jsdom") are already configured in jest.config.js, since that file's
// contents weren't available when this was written. If the project
// uses a different runner/renderer, translate the `render`/`screen`
// calls accordingly -- the test *cases* (what to assert) are the part
// that matters and shouldn't need to change.
//
// Mocks useSessionStore directly rather than going through real login/
// session-hydration, so these tests check ONLY what PermissionGuard.tsx
// is responsible for: given a user object with `roles`, does it render
// children or fallback. It intentionally does not re-test
// permissionService itself (that's server/permissions/roles.ts's own
// concern) or the session store's hydration logic.

import { render, screen } from '@testing-library/react';
import { PermissionGuard } from '../PermissionGuard';
import { Permission } from '@/server/permissions/roles';
import { useSessionStore } from '@/frontend/shared/store/session.store';

jest.mock('@/frontend/shared/store/session.store', () => ({
  useSessionStore: jest.fn(),
}));

const mockUseSessionStore = useSessionStore as unknown as jest.Mock;

function setUser(roles: string[] | null) {
  mockUseSessionStore.mockReturnValue({
    user: roles === null ? null : { id: 'u1', email: 'test@example.com', roles, tenantId: 'default' },
  });
}

describe('PermissionGuard', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders fallback (not children) when there is no session user at all', () => {
    setUser(null);
    render(
      <PermissionGuard permission={Permission.VEHICLE_VIEW} fallback={<span>no-access</span>}>
        <span>secret</span>
      </PermissionGuard>
    );
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
    expect(screen.getByText('no-access')).toBeInTheDocument();
  });

  it('renders children when the user holds the required single permission', () => {
    // FLEET_MANAGER holds VEHICLE_VIEW per rolePermissions.
    setUser(['fleet_manager']);
    render(
      <PermissionGuard permission={Permission.VEHICLE_VIEW} fallback={<span>no-access</span>}>
        <span>secret</span>
      </PermissionGuard>
    );
    expect(screen.getByText('secret')).toBeInTheDocument();
    expect(screen.queryByText('no-access')).not.toBeInTheDocument();
  });

  it('renders fallback when the user does NOT hold the required permission', () => {
    // VIEWER holds no *_DELETE permission anywhere.
    setUser(['viewer']);
    render(
      <PermissionGuard permission={Permission.VEHICLE_DELETE} fallback={<span>no-access</span>}>
        <span>secret</span>
      </PermissionGuard>
    );
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
    expect(screen.getByText('no-access')).toBeInTheDocument();
  });

  it('anyOf: renders children if the user holds at least one of the listed permissions', () => {
    // DRIVER holds FUEL_CREATE but not FUEL_EDIT.
    setUser(['driver']);
    render(
      <PermissionGuard anyOf={[Permission.FUEL_EDIT, Permission.FUEL_CREATE]} fallback={<span>no-access</span>}>
        <span>secret</span>
      </PermissionGuard>
    );
    expect(screen.getByText('secret')).toBeInTheDocument();
  });

  it('allOf: renders fallback unless the user holds every listed permission', () => {
    // BRANCH_MANAGER holds EXPENSE_APPROVE and EXPENSE_EDIT (both) --
    // sanity-check the positive case ANDs correctly rather than ORing.
    setUser(['branch_manager']);
    render(
      <PermissionGuard allOf={[Permission.EXPENSE_APPROVE, Permission.EXPENSE_EDIT]} fallback={<span>no-access</span>}>
        <span>secret</span>
      </PermissionGuard>
    );
    expect(screen.getByText('secret')).toBeInTheDocument();

    // MECHANIC holds MAINTENANCE_EDIT but not EXPENSE_APPROVE -- allOf
    // must fail even though one of the two is satisfied.
    setUser(['mechanic']);
    render(
      <PermissionGuard allOf={[Permission.EXPENSE_APPROVE, Permission.MAINTENANCE_EDIT]} fallback={<span>no-access-2</span>}>
        <span>secret-2</span>
      </PermissionGuard>
    );
    expect(screen.queryByText('secret-2')).not.toBeInTheDocument();
    expect(screen.getByText('no-access-2')).toBeInTheDocument();
  });

  it('renders children unconditionally when no permission prop is given at all', () => {
    setUser(['viewer']);
    render(
      <PermissionGuard>
        <span>always-visible</span>
      </PermissionGuard>
    );
    expect(screen.getByText('always-visible')).toBeInTheDocument();
  });

  it('defaults fallback to nothing (not an error) when fallback is omitted', () => {
    setUser(['viewer']);
    const { container } = render(
      <PermissionGuard permission={Permission.ORG_MANAGE}>
        <span>secret</span>
      </PermissionGuard>
    );
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });
});