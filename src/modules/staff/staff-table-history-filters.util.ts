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

/** Default venue calendar TZ until menus expose their own. */
export const STAFF_VENUE_TIMEZONE_DEFAULT = 'Asia/Riyadh';

export function resolveStaffVenueTimeZone(): string {
  const raw = process.env.STAFF_VENUE_TIMEZONE;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return STAFF_VENUE_TIMEZONE_DEFAULT;
}

/** YYYY-MM-DD for "now" in an IANA timezone (venue calendar day). */
export function todayIsoDateInTimeZone(timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    // Invalid TZ → fall through to host local.
  }
  return todayIsoDateLocal();
}

export function venueTodayIsoDate(): string {
  return todayIsoDateInTimeZone(resolveStaffVenueTimeZone());
}

function resolveHistoryDateRangeFromQuery(
  query: Record<string, unknown>,
  todayIso: string,
): TableHistoryDateRange {
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

  return { dateFrom: todayIso, dateTo: todayIso };
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

  return resolveHistoryDateRangeFromQuery(query, todayIsoDateLocal());
}

/**
 * Unified History (channel=all) always has an explicit date window.
 * Defaults to venue-today when the client omits dates.
 */
export function resolveUnifiedHistoryDateRange(
  query: Record<string, unknown>,
): TableHistoryDateRange {
  return resolveHistoryDateRangeFromQuery(query, venueTodayIsoDate());
}

/**
 * Max Express pages (limit 100) per channel when collecting a date-scoped
 * unified history window. Hitting this with more pages remaining → explicit error.
 */
export const UNIFIED_HISTORY_MAX_SCAN_PAGES = 50;

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
