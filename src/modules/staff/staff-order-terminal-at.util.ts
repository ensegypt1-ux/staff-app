import {
  isActiveStaffOrderStatus,
  isHistoryStaffOrderStatus,
  orderStatusFromAction,
  StaffOrderStatus,
} from './staff-order-status.util';
import { StaffOrderActionDetail } from './staff-order-action-details.util';

/** Operational grace before terminal orders move to archive (server-side only). */
export const STAFF_ARCHIVE_GRACE_MS = 24 * 60 * 60 * 1000;

export type StaffTerminalAtInput = {
  status: StaffOrderStatus;
  actionDetails?: StaffOrderActionDetail[] | null;
  createdAt?: string | null;
  lastEditedAt?: string | null;
};

function parseTimeMs(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const ms = Date.parse(String(raw));
  return Number.isFinite(ms) ? ms : null;
}

function isTerminalCloseStatus(status: StaffOrderStatus): boolean {
  return status === 'delivered' || status === 'cancelled';
}

/**
 * Latest delivered/cancelled action timestamp from activity details.
 * Walks newest → oldest (array end is typically newest).
 */
function terminalAtFromActionDetails(
  actionDetails: StaffOrderActionDetail[] | null | undefined,
): number | null {
  if (!actionDetails?.length) return null;
  for (let i = actionDetails.length - 1; i >= 0; i -= 1) {
    const detail = actionDetails[i]!;
    const action = String(detail.action ?? '')
      .trim()
      .toUpperCase();
    let status: StaffOrderStatus | null = null;
    if (action) {
      const fromAction = orderStatusFromAction(action);
      if (isTerminalCloseStatus(fromAction)) {
        status = fromAction;
      }
    }
    if (!status) {
      const raw = String(detail.status ?? '')
        .trim()
        .toLowerCase();
      if (raw === 'delivered' || raw === 'cancelled') {
        status = raw;
      }
    }
    if (!status) continue;
    const ms = parseTimeMs(detail.time);
    if (ms != null) return ms;
  }
  return null;
}

/**
 * Resolve close time for archive membership. Internal only — never serialize.
 *
 * Priority: terminal action time → lastEditedAt → createdAt.
 * Returns null when nothing parseable (caller treats terminal+null as archive).
 */
export function resolveTerminalAtMs(
  input: StaffTerminalAtInput,
  nowMs: number = Date.now(),
): number | null {
  void nowMs;
  const fromActions = terminalAtFromActionDetails(input.actionDetails);
  if (fromActions != null) return fromActions;

  const fromEdit = parseTimeMs(input.lastEditedAt);
  if (fromEdit != null) return fromEdit;

  return parseTimeMs(input.createdAt);
}

export function isOperationallyVisible(
  input: StaffTerminalAtInput,
  nowMs: number = Date.now(),
): boolean {
  if (isActiveStaffOrderStatus(input.status)) {
    return true;
  }
  if (!isHistoryStaffOrderStatus(input.status)) {
    return false;
  }
  const terminalAt = resolveTerminalAtMs(input, nowMs);
  if (terminalAt == null) {
    // Conservative: missing close time → archive (keep ops clean).
    return false;
  }
  return nowMs - terminalAt < STAFF_ARCHIVE_GRACE_MS;
}

export function isArchivedVisible(
  input: StaffTerminalAtInput,
  nowMs: number = Date.now(),
): boolean {
  if (!isHistoryStaffOrderStatus(input.status)) {
    return false;
  }
  if (isActiveStaffOrderStatus(input.status)) {
    return false;
  }
  const terminalAt = resolveTerminalAtMs(input, nowMs);
  if (terminalAt == null) {
    return true;
  }
  return nowMs - terminalAt >= STAFF_ARCHIVE_GRACE_MS;
}

/** Sort key for archive merge (desc). Missing terminalAt sorts last. */
export function terminalAtSortMs(input: StaffTerminalAtInput): number {
  return resolveTerminalAtMs(input) ?? 0;
}
