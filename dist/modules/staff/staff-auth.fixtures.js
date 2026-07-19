"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FOOD_PREPARER_PERMISSIONS = exports.CASHIER_PERMISSIONS = exports.WAITER_PERMISSIONS = void 0;
exports.authFromPermissions = authFromPermissions;
exports.waiterAuth = waiterAuth;
exports.cashierAuth = cashierAuth;
exports.foodPreparerAuth = foodPreparerAuth;
const staff_capability_mapper_1 = require("./staff-capability.mapper");
exports.WAITER_PERMISSIONS = [
    'orders:view',
    'orders:confirm',
    'orders:cancel',
    'orders:edit_items',
];
exports.CASHIER_PERMISSIONS = [
    ...exports.WAITER_PERMISSIONS,
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
];
exports.FOOD_PREPARER_PERMISSIONS = [
    'orders:view',
    'orders:prepare',
];
function authFromPermissions(permissions, options) {
    return (0, staff_capability_mapper_1.buildStaffResolvedAuth)({
        permissions: [...permissions],
        roleName: options?.roleName ?? null,
        roleId: options?.roleId ?? null,
        legacyRole: options?.legacyRole,
    });
}
function waiterAuth() {
    return authFromPermissions(exports.WAITER_PERMISSIONS, {
        roleName: 'Waiter',
        roleId: 1,
        legacyRole: 'waiter',
    });
}
function cashierAuth() {
    return authFromPermissions(exports.CASHIER_PERMISSIONS, {
        roleName: 'Cashier',
        roleId: 2,
        legacyRole: 'cashier',
    });
}
function foodPreparerAuth() {
    return authFromPermissions(exports.FOOD_PREPARER_PERMISSIONS, {
        roleName: 'Food preparer',
        roleId: 3,
    });
}
//# sourceMappingURL=staff-auth.fixtures.js.map