import { StaffResolvedAuth } from './staff-capability.mapper';
export declare const WAITER_PERMISSIONS: readonly ["orders:view", "orders:confirm", "orders:cancel", "orders:edit_items"];
export declare const CASHIER_PERMISSIONS: readonly ["orders:view", "orders:confirm", "orders:cancel", "orders:edit_items", "orders:prepare", "orders:deliver", "orders:complete", "dashboard:access", "menu:view", "menu:categories", "menu:items", "menu:tables", "menu:import", "delivery:view"];
export declare const FOOD_PREPARER_PERMISSIONS: readonly ["orders:view", "orders:prepare"];
export declare function authFromPermissions(permissions: readonly string[], options?: {
    roleName?: string | null;
    roleId?: number | null;
    legacyRole?: unknown;
}): StaffResolvedAuth;
export declare function waiterAuth(): StaffResolvedAuth;
export declare function cashierAuth(): StaffResolvedAuth;
export declare function foodPreparerAuth(): StaffResolvedAuth;
