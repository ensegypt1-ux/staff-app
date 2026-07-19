import { StaffJobRole } from './staff-job-role.util';
import { StaffOrderChannel } from './staff-order-channel.util';
export declare const STAFF_PERMISSION_KEYS: readonly ["orders:view", "orders:confirm", "orders:cancel", "orders:edit_items", "orders:prepare", "orders:deliver", "orders:complete", "dashboard:access", "menu:view", "menu:categories", "menu:items", "menu:tables", "menu:import", "delivery:view", "staff:manage", "settings:manage", "analytics:view", "ads:manage"];
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
export type StaffLegacyCapabilityFlags = {
    staffJobRole: StaffJobRole;
    canProcessOrders: boolean;
    canViewDelivery: boolean;
    canViewHistory: boolean;
    canEditItems: boolean;
    channels: StaffOrderChannel[];
};
export type StaffMappedCapabilities = StaffGranularCapabilities & StaffLegacyCapabilityFlags;
export type MapStaffCapabilitiesInput = {
    permissions: unknown;
    roleName: string | null;
    roleId: number | null;
    legacyRole?: unknown;
};
export type StaffResolvedAuth = {
    permissions: string[];
    roleName: string | null;
    roleId: number | null;
    staffJobRole: StaffJobRole;
    capabilities: StaffMappedCapabilities;
};
export declare function normalizePermissionList(raw: unknown): string[];
export declare function deriveDeprecatedStaffJobRole(input: {
    legacyRole?: unknown;
    roleName?: string | null;
    permissions: string[];
}): StaffJobRole;
export declare function mapStaffCapabilities(input: MapStaffCapabilitiesInput): StaffMappedCapabilities;
export declare function buildStaffResolvedAuth(input: MapStaffCapabilitiesInput): StaffResolvedAuth;
export declare function emptyStaffResolvedAuth(): StaffResolvedAuth;
export type StaffCapabilityFlagKey = keyof StaffGranularCapabilities;
export declare function staffHasPermission(auth: StaffResolvedAuth | StaffMappedCapabilities, key: StaffCapabilityFlagKey): boolean;
