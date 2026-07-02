import { StaffJobRole } from './staff-job-role.util';
import { StaffOrderChannel } from './staff-order-channel.util';
import { StaffOrderStatus } from './staff-order-status.util';
import { StaffOrderActionSpec } from './staff-order-actions.util';
import { StaffPresentedOrderEntry } from './staff-order-presenter.service';
export declare function shouldBlockWaiterSelfAccept(params: {
    channel: StaffOrderChannel;
    status: StaffOrderStatus;
    createdByStaffId: number | null;
    role: StaffJobRole;
    currentStaffId: number;
}): boolean;
export declare function filterSelfAcceptActions(actions: StaffOrderActionSpec[], blockSelfAccept: boolean): StaffOrderActionSpec[];
export declare function applyStaffOrderSelfAcceptRules(entry: StaffPresentedOrderEntry, context: {
    role: StaffJobRole;
    currentStaffId: number;
    createdByStaffId: number | null;
}): StaffPresentedOrderEntry;
