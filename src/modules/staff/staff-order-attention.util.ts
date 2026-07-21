import { StaffPresentedOrderEntry } from './staff-order-presenter.service';
import { StaffOrderStatus } from './staff-order-status.util';

export type StaffRequestKind = 'order' | 'waiter' | 'bill';

/** Parse Express `requestKind` — defaults to food order. */
export function parseStaffRequestKind(raw: unknown): StaffRequestKind {
  const normalized = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (normalized === 'waiter' || normalized === 'bill') {
    return normalized;
  }
  return 'order';
}

export function isServiceRequestKind(kind: StaffRequestKind): boolean {
  return kind === 'waiter' || kind === 'bill';
}

/** Web `isPendingOrder` + pending Staff service rows (waiter / orphan bill). */
export function entryNeedsAttention(entry: {
  status: StaffOrderStatus | string;
  pendingGuestAddition?: boolean;
  pendingBillRequest?: boolean;
  requestKind?: StaffRequestKind | string;
}): boolean {
  const kind = parseStaffRequestKind(entry.requestKind);
  const isService = kind === 'waiter' || kind === 'bill';
  // Service rows only need attention while still pending.
  if (isService) {
    return entry.status === 'pending';
  }
  return (
    entry.status === 'pending' ||
    entry.pendingGuestAddition === true ||
    entry.pendingBillRequest === true
  );
}

/**
 * Sort priority (lower = higher):
 * 0 bill (flag or pending orphan) → 1 guest addition → 2 pending waiter → 3 pending order → 4 rest
 */
export function attentionSortRank(entry: {
  status: StaffOrderStatus | string;
  pendingGuestAddition?: boolean;
  pendingBillRequest?: boolean;
  requestKind?: StaffRequestKind | string;
}): number {
  const kind = parseStaffRequestKind(entry.requestKind);
  const pendingService = entry.status === 'pending';
  if (
    entry.pendingBillRequest === true ||
    (kind === 'bill' && pendingService)
  ) {
    return 0;
  }
  if (entry.pendingGuestAddition === true) return 1;
  if (kind === 'waiter' && pendingService) return 2;
  if (entry.status === 'pending') return 3;
  return 4;
}

export function sortTableEntriesByAttention(
  entries: StaffPresentedOrderEntry[],
): StaffPresentedOrderEntry[] {
  return [...entries].sort((a, b) => {
    const rankDiff = attentionSortRank(a) - attentionSortRank(b);
    if (rankDiff !== 0) return rankDiff;
    const aTime = Date.parse(a.createdAt ?? '') || 0;
    const bTime = Date.parse(b.createdAt ?? '') || 0;
    return bTime - aTime;
  });
}

export function countAttentionEntries(
  entries: Array<{
    status: StaffOrderStatus | string;
    pendingGuestAddition?: boolean;
    pendingBillRequest?: boolean;
    requestKind?: StaffRequestKind | string;
  }>,
): number {
  return entries.filter(entryNeedsAttention).length;
}

/** Pending table-calls rows that are missing from activity-logs table channel. */
export function isMergeableServiceTableCall(
  raw: Record<string, unknown>,
): boolean {
  if (!isServiceRequestKind(parseStaffRequestKind(raw.requestKind))) {
    return false;
  }
  const status = String(raw.status ?? 'pending')
    .trim()
    .toLowerCase();
  return status === 'pending' || status === '';
}

/** Staff call id from activity-log list row (`orderId` preferred over log `id`). */
export function resolveStaffCallIdFromListRow(
  raw: Record<string, unknown>,
): number {
  const orderId = Number(raw.orderId ?? 0);
  if (Number.isFinite(orderId) && orderId > 0) return orderId;
  const id = Number(raw.id ?? 0);
  return Number.isFinite(id) && id > 0 ? id : 0;
}

/** Read attention flags from an upstream activity-log / table-call row. */
export function activityLogRowNeedsAttention(
  raw: Record<string, unknown>,
): boolean {
  return entryNeedsAttention({
    status: String(raw.status ?? 'pending')
      .trim()
      .toLowerCase(),
    pendingGuestAddition: raw.pendingGuestAddition === true,
    pendingBillRequest: raw.pendingBillRequest === true,
    requestKind: parseStaffRequestKind(raw.requestKind),
  });
}

/**
 * Full-table attention count for badge accuracy.
 * Dedupes by staffCallId across activity-logs + waiter/bill service rows.
 * Intentionally ignores list pagination and browse filters (q/date/status).
 */
export function countTableAttentionAcrossSources(input: {
  activityLogRows: Array<Record<string, unknown>>;
  serviceTableCallRows: Array<Record<string, unknown>>;
}): number {
  const countedIds = new Set<number>();
  let count = 0;

  for (const row of input.activityLogRows) {
    if (!row || typeof row !== 'object') continue;
    if (!activityLogRowNeedsAttention(row)) continue;
    const id = resolveStaffCallIdFromListRow(row);
    if (id > 0) {
      if (countedIds.has(id)) continue;
      countedIds.add(id);
    }
    count += 1;
  }

  for (const row of input.serviceTableCallRows) {
    if (!row || typeof row !== 'object') continue;
    if (!isMergeableServiceTableCall(row)) continue;
    const id = Number(row.id ?? 0);
    if (Number.isFinite(id) && id > 0) {
      if (countedIds.has(id)) continue;
      countedIds.add(id);
    }
    count += 1;
  }

  return count;
}

/** Max upstream rows scanned when computing global table pendingCount. */
export const TABLE_ATTENTION_COUNT_MAX_SCAN_ROWS = 500;
