"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STAFF_PERMISSION_KEYS = void 0;
exports.normalizePermissionList = normalizePermissionList;
exports.deriveDeprecatedStaffJobRole = deriveDeprecatedStaffJobRole;
exports.mapStaffCapabilities = mapStaffCapabilities;
exports.buildStaffResolvedAuth = buildStaffResolvedAuth;
exports.emptyStaffResolvedAuth = emptyStaffResolvedAuth;
exports.staffHasPermission = staffHasPermission;
const staff_job_role_util_1 = require("./staff-job-role.util");
exports.STAFF_PERMISSION_KEYS = [
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
];
function hasPermission(permissionSet, key) {
    return permissionSet.has(key);
}
function normalizePermissionList(raw) {
    if (!Array.isArray(raw))
        return [];
    const seen = new Set();
    const out = [];
    for (const item of raw) {
        const key = String(item ?? '').trim();
        if (!key || seen.has(key))
            continue;
        seen.add(key);
        out.push(key);
    }
    return out;
}
function deriveDeprecatedStaffJobRole(input) {
    const fromLegacy = (0, staff_job_role_util_1.normalizeStaffJobRole)(input.legacyRole);
    if (fromLegacy !== 'unknown')
        return fromLegacy;
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
    if (set.has('delivery:view') && set.has('orders:prepare')) {
        return 'cashier';
    }
    if (set.has('orders:view')) {
        return 'waiter';
    }
    return 'unknown';
}
function mapStaffCapabilities(input) {
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
    const channels = [];
    if (ordersView)
        channels.push('table');
    if (deliveryView)
        channels.push('delivery');
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
function buildStaffResolvedAuth(input) {
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
function emptyStaffResolvedAuth() {
    return buildStaffResolvedAuth({
        permissions: [],
        roleName: null,
        roleId: null,
    });
}
function staffHasPermission(auth, key) {
    const caps = 'capabilities' in auth ? auth.capabilities : auth;
    return caps[key] === true;
}
//# sourceMappingURL=staff-capability.mapper.js.map