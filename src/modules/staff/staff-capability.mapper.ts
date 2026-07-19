import { StaffJobRole, normalizeStaffJobRole } from './staff-job-role.util';
import { StaffOrderChannel } from './staff-order-channel.util';

/** Permission keys consumed from Express `GET /staff-auth/me`. */
export const STAFF_PERMISSION_KEYS = [
  'orders:view',
  'orders:confirm',
  'orders:cancel',
  'orders:edit_items',
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
  'staff:manage',
  'settings:manage',
  'analytics:view',
  'ads:manage',
] as const;

export type StaffPermissionKey = (typeof STAFF_PERMISSION_KEYS)[number];

export type StaffGranularCapabilities = {
  'orders:view': boolean;
  'orders:confirm': boolean;
  'orders:cancel': boolean;
  'orders:edit_items': boolean;
  'orders:prepare': boolean;
  'orders:deliver': boolean;
  'orders:complete': boolean;
  'delivery:view': boolean;
  'menu:view': boolean;
  'menu:categories': boolean;
  'menu:items': boolean;
  'menu:tables': boolean;
  'menu:import': boolean;
  'analytics:view': boolean;
  'staff:manage': boolean;
  'settings:manage': boolean;
  canViewKitchen: boolean;
};

/** Backward-compatible flags still consumed by the Flutter staff app. */
export type StaffLegacyCapabilityFlags = {
  /** @deprecated Display / header metadata only — do not authorize with this. */
  staffJobRole: StaffJobRole;
  canProcessOrders: boolean;
  canViewDelivery: boolean;
  canViewHistory: boolean;
  canEditItems: boolean;
  channels: StaffOrderChannel[];
};

export type StaffMappedCapabilities = StaffGranularCapabilities &
  StaffLegacyCapabilityFlags;

export type MapStaffCapabilitiesInput = {
  permissions: unknown;
  roleName: string | null;
  roleId: number | null;
  /** Legacy `staff.role` text from `/staff-auth/me` (display only). */
  legacyRole?: unknown;
};

export type StaffResolvedAuth = {
  permissions: string[];
  roleName: string | null;
  roleId: number | null;
  /** @deprecated Prefer permissions / capabilities. */
  staffJobRole: StaffJobRole;
  capabilities: StaffMappedCapabilities;
};

function hasPermission(
  permissionSet: Set<string>,
  key: StaffPermissionKey,
): boolean {
  return permissionSet.has(key);
}

export function normalizePermissionList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const key = String(item ?? '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/**
 * Derive deprecated `staffJobRole` for Flutter headers / display only.
 * Never used for authorization decisions.
 */
export function deriveDeprecatedStaffJobRole(input: {
  legacyRole?: unknown;
  roleName?: string | null;
  permissions: string[];
}): StaffJobRole {
  const fromLegacy = normalizeStaffJobRole(input.legacyRole);
  if (fromLegacy !== 'unknown') return fromLegacy;

  const name = String(input.roleName ?? '')
    .trim()
    .toLowerCase();
  if (name.includes('cashier') || name.includes('casher') || name.includes('كاشير')) {
    return 'cashier';
  }
  if (name.includes('waiter') || name.includes('نادل')) {
    return 'waiter';
  }

  const set = new Set(input.permissions);
  // Cashier-shaped default roles include delivery + prepare.
  if (set.has('delivery:view') && set.has('orders:prepare')) {
    return 'cashier';
  }
  if (set.has('orders:view')) {
    return 'waiter';
  }
  return 'unknown';
}

/**
 * Map Express `/staff-auth/me` permissions into granular + legacy capability flags.
 * Permissions are the sole authorization source of truth.
 */
export function mapStaffCapabilities(
  input: MapStaffCapabilitiesInput,
): StaffMappedCapabilities {
  const permissions = normalizePermissionList(input.permissions);
  const set = new Set(permissions);

  const ordersView = hasPermission(set, 'orders:view');
  const ordersConfirm = hasPermission(set, 'orders:confirm');
  const ordersCancel = hasPermission(set, 'orders:cancel');
  const ordersEditItems = hasPermission(set, 'orders:edit_items');
  const ordersPrepare = hasPermission(set, 'orders:prepare');
  const ordersDeliver = hasPermission(set, 'orders:deliver');
  const ordersComplete = hasPermission(set, 'orders:complete');
  const deliveryView = hasPermission(set, 'delivery:view');
  const menuView = hasPermission(set, 'menu:view');
  const menuCategories = hasPermission(set, 'menu:categories');
  const menuItems = hasPermission(set, 'menu:items');
  const menuTables = hasPermission(set, 'menu:tables');
  const menuImport = hasPermission(set, 'menu:import');
  const analyticsView = hasPermission(set, 'analytics:view');
  const staffManage = hasPermission(set, 'staff:manage');
  const settingsManage = hasPermission(set, 'settings:manage');
  const canViewKitchen = ordersPrepare;

  const staffJobRole = deriveDeprecatedStaffJobRole({
    legacyRole: input.legacyRole,
    roleName: input.roleName,
    permissions,
  });

  const channels: StaffOrderChannel[] = [];
  if (ordersView) channels.push('table');
  if (deliveryView) channels.push('delivery');

  return {
    'orders:view': ordersView,
    'orders:confirm': ordersConfirm,
    'orders:cancel': ordersCancel,
    'orders:edit_items': ordersEditItems,
    'orders:prepare': ordersPrepare,
    'orders:deliver': ordersDeliver,
    'orders:complete': ordersComplete,
    'delivery:view': deliveryView,
    'menu:view': menuView,
    'menu:categories': menuCategories,
    'menu:items': menuItems,
    'menu:tables': menuTables,
    'menu:import': menuImport,
    'analytics:view': analyticsView,
    'staff:manage': staffManage,
    'settings:manage': settingsManage,
    canViewKitchen,
    staffJobRole,
    canProcessOrders: ordersPrepare || ordersDeliver || ordersComplete,
    canViewDelivery: deliveryView,
    canViewHistory: ordersView,
    canEditItems: ordersEditItems,
    channels,
  };
}

export function buildStaffResolvedAuth(
  input: MapStaffCapabilitiesInput,
): StaffResolvedAuth {
  const permissions = normalizePermissionList(input.permissions);
  const capabilities = mapStaffCapabilities({
    ...input,
    permissions,
  });
  return {
    permissions,
    roleName: input.roleName,
    roleId: input.roleId,
    staffJobRole: capabilities.staffJobRole,
    capabilities,
  };
}

export function emptyStaffResolvedAuth(): StaffResolvedAuth {
  return buildStaffResolvedAuth({
    permissions: [],
    roleName: null,
    roleId: null,
  });
}

export type StaffCapabilityFlagKey = keyof StaffGranularCapabilities;

export function staffHasPermission(
  auth: StaffResolvedAuth | StaffMappedCapabilities,
  key: StaffCapabilityFlagKey,
): boolean {
  const caps =
    'capabilities' in auth ? auth.capabilities : (auth as StaffMappedCapabilities);
  return caps[key] === true;
}
