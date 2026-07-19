import { StaffMappedCapabilities, StaffResolvedAuth } from './staff-capability.mapper';
import { StaffOrderChannel } from './staff-order-channel.util';
import { StaffOrderStatus } from './staff-order-status.util';
import { StaffOrderActionSpec } from './staff-order-actions.util';
import { StaffPresentedOrderEntry } from './staff-order-presenter.service';
type AuthCaps = StaffResolvedAuth | StaffMappedCapabilities;
export declare function shouldBlockStaffSelfAccept(params: {
    channel: StaffOrderChannel;
    status: StaffOrderStatus;
    createdByStaffId: number | null;
    auth: AuthCaps;
    currentStaffId: number;
}): boolean;
export declare function filterSelfAcceptActions(actions: StaffOrderActionSpec[], blockSelfAccept: boolean): StaffOrderActionSpec[];
export declare function applyStaffOrderSelfAcceptRules(entry: StaffPresentedOrderEntry, context: {
    auth: AuthCaps;
    currentStaffId: number;
    createdByStaffId: number | null;
}): StaffPresentedOrderEntry;
export {};
