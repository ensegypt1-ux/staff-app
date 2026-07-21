import { StaffPresentedOrderEntry } from './staff-order-presenter.service';
import { StaffOrderStatus } from './staff-order-status.util';
export type StaffRequestKind = 'order' | 'waiter' | 'bill';
export declare function parseStaffRequestKind(raw: unknown): StaffRequestKind;
export declare function isServiceRequestKind(kind: StaffRequestKind): boolean;
export declare function entryNeedsAttention(entry: {
    status: StaffOrderStatus | string;
    pendingGuestAddition?: boolean;
    pendingBillRequest?: boolean;
    requestKind?: StaffRequestKind | string;
}): boolean;
export declare function attentionSortRank(entry: {
    status: StaffOrderStatus | string;
    pendingGuestAddition?: boolean;
    pendingBillRequest?: boolean;
    requestKind?: StaffRequestKind | string;
}): number;
export declare function sortTableEntriesByAttention(entries: StaffPresentedOrderEntry[]): StaffPresentedOrderEntry[];
export declare function countAttentionEntries(entries: Array<{
    status: StaffOrderStatus | string;
    pendingGuestAddition?: boolean;
    pendingBillRequest?: boolean;
    requestKind?: StaffRequestKind | string;
}>): number;
export declare function isMergeableServiceTableCall(raw: Record<string, unknown>): boolean;
export declare function resolveStaffCallIdFromListRow(raw: Record<string, unknown>): number;
export declare function resolveActivityLogRowStatus(raw: Record<string, unknown>): StaffOrderStatus;
export declare function activityLogRowNeedsAttention(raw: Record<string, unknown>): boolean;
export declare function countTableAttentionAcrossSources(input: {
    activityLogRows: Array<Record<string, unknown>>;
    serviceTableCallRows: Array<Record<string, unknown>>;
}): number;
export declare const TABLE_ATTENTION_COUNT_MAX_SCAN_ROWS = 500;
