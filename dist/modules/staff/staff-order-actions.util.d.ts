import { StaffMappedCapabilities, StaffResolvedAuth } from './staff-capability.mapper';
import { StaffOrderChannel } from './staff-order-channel.util';
import { StaffOrderStatus } from './staff-order-status.util';
export type StaffOrderActionType = 'TABLE_CALL_CONFIRMED' | 'TABLE_CALL_CANCELLED' | 'TABLE_CALL_PREPARED' | 'TABLE_CALL_DELIVERED';
export type StaffOrderActionSpec = {
    action: StaffOrderActionType;
    label: {
        en: string;
        ar: string;
    };
};
type AuthCaps = StaffResolvedAuth | StaffMappedCapabilities;
export declare function availableActionsForOrder(status: StaffOrderStatus, auth: AuthCaps, channel?: StaffOrderChannel): StaffOrderActionSpec[];
export declare function canStaffProcessOrders(auth: AuthCaps): boolean;
export declare function canStaffViewDelivery(auth: AuthCaps): boolean;
export declare function canStaffViewOrders(auth: AuthCaps): boolean;
export declare function canStaffViewHistory(auth: AuthCaps): boolean;
export declare function statusLabelFor(status: StaffOrderStatus): {
    en: string;
    ar: string;
};
export declare function permissionForOrderAction(action: StaffOrderActionType): 'orders:confirm' | 'orders:cancel' | 'orders:prepare' | 'orders:deliver';
export declare function canPerformOrderAction(auth: AuthCaps, action: StaffOrderActionType): boolean;
export {};
