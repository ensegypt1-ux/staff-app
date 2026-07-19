import { buildStaffResolvedAuth, StaffResolvedAuth } from './staff-capability.mapper';

/** Default role permission sets aligned with Express `staffRoleDefaults`. */
export const WAITER_PERMISSIONS = [
  'orders:view',
  'orders:confirm',
  'orders:cancel',
  'orders:edit_items',
] as const;

export const CASHIER_PERMISSIONS = [
  ...WAITER_PERMISSIONS,
  'orders:prepare',
  'orders:deliver',
  'orders:complete',
  'dashboard:access',
  'menu:view',
  'menu:categories',
  'menu:items',
  'menu:tables',
  'menu:import',
  'delivery:view',
] as const;

export const FOOD_PREPARER_PERMISSIONS = [
  'orders:view',
  'orders:prepare',
] as const;

export function authFromPermissions(
  permissions: readonly string[],
  options?: {
    roleName?: string | null;
    roleId?: number | null;
    legacyRole?: unknown;
  },
): StaffResolvedAuth {
  return buildStaffResolvedAuth({
    permissions: [...permissions],
    roleName: options?.roleName ?? null,
    roleId: options?.roleId ?? null,
    legacyRole: options?.legacyRole,
  });
}

export function waiterAuth(): StaffResolvedAuth {
  return authFromPermissions(WAITER_PERMISSIONS, {
    roleName: 'Waiter',
    roleId: 1,
    legacyRole: 'waiter',
  });
}

export function cashierAuth(): StaffResolvedAuth {
  return authFromPermissions(CASHIER_PERMISSIONS, {
    roleName: 'Cashier',
    roleId: 2,
    legacyRole: 'cashier',
  });
}

export function foodPreparerAuth(): StaffResolvedAuth {
  return authFromPermissions(FOOD_PREPARER_PERMISSIONS, {
    roleName: 'Food preparer',
    roleId: 3,
  });
}
