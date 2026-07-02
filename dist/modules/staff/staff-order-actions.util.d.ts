import { StaffJobRole } from './staff-job-role.util';
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
export declare function availableActionsForOrder(status: StaffOrderStatus, role: StaffJobRole, channel?: StaffOrderChannel): StaffOrderActionSpec[];
export declare function canStaffProcessOrders(role: StaffJobRole): boolean;
export declare function canStaffViewDelivery(role: StaffJobRole): boolean;
export declare function statusLabelFor(status: StaffOrderStatus): {
    en: string;
    ar: string;
};
export declare function isCashierOnlyAction(action: StaffOrderActionType): boolean;
