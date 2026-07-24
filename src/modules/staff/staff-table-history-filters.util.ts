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
 * Per-channel History (table|delivery) always has an explicit date window.
 * Defaults to venue-today when the client omits dates.
 */
export function resolveChannelHistoryDateRange(
  query: Record<string, unknown>,
  scope: 'active' | 'history',
  channel: StaffOrderChannel,
): TableHistoryDateRange | null {
  if (scope !== 'history') return null;
  if (channel !== 'table' && channel !== 'delivery') return null;
  return resolveHistoryDateRangeFromQuery(query, venueTodayIsoDate());
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
 * Default max inclusive calendar days for unified History (Express frozen →
 * BFF date-scoped collect/merge). Override with STAFF_HISTORY_MAX_RANGE_DAYS.
 */
export const UNIFIED_HISTORY_MAX_RANGE_DAYS_DEFAULT = 30;

/**
 * Resolved max History window. Configurable so ops can tighten later without
 * a code change (e.g. set STAFF_HISTORY_MAX_RANGE_DAYS=7).
 */
export function resolveUnifiedHistoryMaxRangeDays(): number {
  const raw = process.env.STAFF_HISTORY_MAX_RANGE_DAYS;
  if (raw == null || String(raw).trim() === '') {
    return UNIFIED_HISTORY_MAX_RANGE_DAYS_DEFAULT;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) {
    return UNIFIED_HISTORY_MAX_RANGE_DAYS_DEFAULT;
  }
  // Hard ceiling avoids accidental huge env values.
  return Math.min(90, Math.floor(n));
}

/** @deprecated Prefer resolveUnifiedHistoryMaxRangeDays() for runtime config. */
export const UNIFIED_HISTORY_MAX_RANGE_DAYS =
  UNIFIED_HISTORY_MAX_RANGE_DAYS_DEFAULT;

/**
 * Max Express pages (limit 100) per channel when collecting a date-scoped
 * unified history window. Hitting this with more pages remaining → explicit error.
 * 50 × 100 = 5000 rows/channel ceiling inside an allowed date window.
 */
export const UNIFIED_HISTORY_MAX_SCAN_PAGES = 50;

/** Inclusive day count for YYYY-MM-DD range (same day → 1). */
export function inclusiveHistoryDayCount(
  dateFrom: string,
  dateTo: string,
): number {
  const fromMs = Date.parse(`${dateFrom}T00:00:00Z`);
  const toMs = Date.parse(`${dateTo}T00:00:00Z`);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return Number.POSITIVE_INFINITY;
  const from = Math.min(fromMs, toMs);
  const to = Math.max(fromMs, toMs);
  return Math.floor((to - from) / 86_400_000) + 1;
}

export function isUnifiedHistoryDateRangeAllowed(
  range: TableHistoryDateRange,
  maxDays: number = resolveUnifiedHistoryMaxRangeDays(),
): boolean {
  return inclusiveHistoryDayCount(range.dateFrom, range.dateTo) <= maxDays;
}

/** Staff-facing copy for History window/volume validation (never expose internals). */
export function unifiedHistoryPeriodTooLargeMessage(locale: 'en' | 'ar'): string {
  if (locale === 'ar') {
    return 'الفترة المحددة كبيرة جداً للتحميل. اختر نطاقاً أقصر أو استخدم البحث للعثور على طلبات محددة.';
  }
  return 'This period is too large to load. Choose a shorter date range or use search to find specific orders.';
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
