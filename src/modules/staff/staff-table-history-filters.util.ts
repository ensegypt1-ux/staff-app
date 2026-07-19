import {
  StaffPresentedListResult,
  StaffPresentedOrderEntry,
} from './staff-order-presenter.service';
import {
  StaffMappedCapabilities,
  StaffResolvedAuth,
} from './staff-capability.mapper';
import { StaffOrderChannel } from './staff-order-channel.util';

export type TableHistoryDateRange = {
  dateFrom: string;
  dateTo: string;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseIsoDateParam(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!ISO_DATE.test(trimmed)) return null;
  const parsed = new Date(`${trimmed}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return trimmed;
}

export function formatIsoDateLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayIsoDateLocal(): string {
  return formatIsoDateLocal(new Date());
}

/**
 * Table history defaults to today when no range is supplied.
 */
export function resolveTableHistoryDateRange(
  query: Record<string, unknown>,
  scope: 'active' | 'history',
  channel: StaffOrderChannel,
): TableHistoryDateRange | null {
  if (scope !== 'history' || channel !== 'table') {
    return null;
  }

  const from = parseIsoDateParam(query.dateFrom);
  const to = parseIsoDateParam(query.dateTo);

  if (from && to) {
    if (from > to) {
      return { dateFrom: to, dateTo: from };
    }
    return { dateFrom: from, dateTo: to };
  }

  if (from && !to) {
    return { dateFrom: from, dateTo: from };
  }

  if (!from && to) {
    return { dateFrom: to, dateTo: to };
  }

  const today = todayIsoDateLocal();
  return { dateFrom: today, dateTo: today };
}

export function entryCreatedAtIsoDate(
  entry: StaffPresentedOrderEntry,
): string | null {
  const raw = entry.createdAt;
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (ISO_DATE.test(trimmed)) {
    return trimmed;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return formatIsoDateLocal(parsed);
}

export function filterEntriesByDateRange(
  entries: StaffPresentedOrderEntry[],
  range: TableHistoryDateRange,
): StaffPresentedOrderEntry[] {
  return entries.filter((entry) => {
    const created = entryCreatedAtIsoDate(entry);
    if (!created) return false;
    return created >= range.dateFrom && created <= range.dateTo;
  });
}

export function paginatePresentedEntries(
  entries: StaffPresentedOrderEntry[],
  page: number,
  limit: number,
): {
  entries: StaffPresentedOrderEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
} {
  const safePage = Math.max(1, Math.floor(page));
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
  const total = entries.length;
  const totalPages = total > 0 ? Math.ceil(total / safeLimit) : 0;
  const start = (safePage - 1) * safeLimit;
  const paged = entries.slice(start, start + safeLimit);

  return {
    entries: paged,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages,
  };
}

export const TABLE_HISTORY_MAX_SCAN_ROWS = 500;

export function dedupeEntriesByStaffCallId(
  entries: StaffPresentedOrderEntry[],
): StaffPresentedOrderEntry[] {
  const seen = new Set<number>();
  const out: StaffPresentedOrderEntry[] = [];
  for (const entry of entries) {
    if (seen.has(entry.staffCallId)) continue;
    seen.add(entry.staffCallId);
    out.push(entry);
  }
  return out;
}

export function buildTableHistoryListResult(input: {
  auth: StaffResolvedAuth;
  channel: StaffOrderChannel;
  scope: 'history';
  entries: StaffPresentedOrderEntry[];
  page: number;
  limit: number;
  dateRange: TableHistoryDateRange;
  capabilities: StaffMappedCapabilities;
}): StaffPresentedListResult {
  const unique = dedupeEntriesByStaffCallId(input.entries);
  const paged = paginatePresentedEntries(unique, input.page, input.limit);

  return {
    staffJobRole: input.auth.staffJobRole,
    permissions: input.auth.permissions,
    roleName: input.auth.roleName,
    roleId: input.auth.roleId,
    channel: input.channel,
    scope: input.scope,
    entries: paged.entries,
    total: paged.total,
    page: paged.page,
    limit: paged.limit,
    totalPages: paged.totalPages,
    capabilities: input.capabilities,
    filters: {
      dateFrom: input.dateRange.dateFrom,
      dateTo: input.dateRange.dateTo,
    },
  };
}
