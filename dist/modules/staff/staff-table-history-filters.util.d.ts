import { StaffPresentedListResult, StaffPresentedOrderEntry } from './staff-order-presenter.service';
import { StaffJobRole } from './staff-job-role.util';
import { StaffOrderChannel } from './staff-order-channel.util';
import { StaffOrderPresenterService } from './staff-order-presenter.service';
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
    role: StaffJobRole;
    channel: StaffOrderChannel;
    scope: 'history';
    entries: StaffPresentedOrderEntry[];
    page: number;
    limit: number;
    dateRange: TableHistoryDateRange;
    capabilities: ReturnType<StaffOrderPresenterService['capabilitiesFor']>;
}): StaffPresentedListResult;
