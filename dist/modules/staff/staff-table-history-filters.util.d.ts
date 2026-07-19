import { StaffPresentedListResult, StaffPresentedOrderEntry } from './staff-order-presenter.service';
import { StaffMappedCapabilities, StaffResolvedAuth } from './staff-capability.mapper';
import { StaffOrderChannel } from './staff-order-channel.util';
export type TableHistoryDateRange = {
    dateFrom: string;
    dateTo: string;
};
export declare function parseIsoDateParam(raw: unknown): string | null;
export declare function formatIsoDateLocal(date: Date): string;
export declare function todayIsoDateLocal(): string;
export declare function resolveTableHistoryDateRange(query: Record<string, unknown>, scope: 'active' | 'history', channel: StaffOrderChannel): TableHistoryDateRange | null;
export declare function entryCreatedAtIsoDate(entry: StaffPresentedOrderEntry): string | null;
export declare function filterEntriesByDateRange(entries: StaffPresentedOrderEntry[], range: TableHistoryDateRange): StaffPresentedOrderEntry[];
export declare function paginatePresentedEntries(entries: StaffPresentedOrderEntry[], page: number, limit: number): {
    entries: StaffPresentedOrderEntry[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
};
export declare const TABLE_HISTORY_MAX_SCAN_ROWS = 500;
export declare function dedupeEntriesByStaffCallId(entries: StaffPresentedOrderEntry[]): StaffPresentedOrderEntry[];
export declare function buildTableHistoryListResult(input: {
    auth: StaffResolvedAuth;
    channel: StaffOrderChannel;
    scope: 'history';
    entries: StaffPresentedOrderEntry[];
    page: number;
    limit: number;
    dateRange: TableHistoryDateRange;
    capabilities: StaffMappedCapabilities;
}): StaffPresentedListResult;
