export type StaffOrderStatus =
  | 'pending'
  | 'confirmed'
  | 'cancelled'
  | 'prepared'
  | 'delivered';

const TERMINAL = new Set<StaffOrderStatus>([
  'confirmed',
  'cancelled',
  'prepared',
  'delivered',
]);

export function normalizeStaffOrderStatus(raw: unknown): StaffOrderStatus {
  const value = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (value === 'table_call_created') return 'pending';
  if (
    value === 'confirmed' ||
    value === 'cancelled' ||
    value === 'prepared' ||
    value === 'delivered' ||
    value === 'pending'
  ) {
    return value;
  }
  return 'pending';
}

/** Mirrors web `resolveLatestOrderStatus`. */
export function resolveLatestOrderStatus(
  actions?: Array<{ status?: string }> | null,
  order?: { status?: string } | null,
): StaffOrderStatus {
  const orderStatus = normalizeStaffOrderStatus(order?.status);
  if (TERMINAL.has(orderStatus) && orderStatus !== 'confirmed') {
    return orderStatus;
  }
  if (orderStatus === 'confirmed' && !actions?.length) {
    return 'confirmed';
  }
  if (!actions?.length) return 'pending';
  for (let i = actions.length - 1; i >= 0; i -= 1) {
    const status = normalizeStaffOrderStatus(actions[i]?.status);
    if (status === 'pending') continue;
    return status;
  }
  return 'pending';
}

export function resolveListEntryStatus(entry: {
  actionDetails?: Array<{ status?: string }> | null;
  status?: string | null;
}): StaffOrderStatus {
  if (entry.status) {
    return normalizeStaffOrderStatus(entry.status);
  }
  return resolveLatestOrderStatus(entry.actionDetails);
}

export function orderStatusFromAction(action: string): StaffOrderStatus {
  switch (action) {
    case 'TABLE_CALL_CONFIRMED':
      return 'confirmed';
    case 'TABLE_CALL_CANCELLED':
      return 'cancelled';
    case 'TABLE_CALL_PREPARED':
      return 'prepared';
    case 'TABLE_CALL_DELIVERED':
    case 'TABLE_CALL_COMPLETED':
      return 'delivered';
    default:
      return 'pending';
  }
}

export function isActiveStaffOrderStatus(status: StaffOrderStatus): boolean {
  return status === 'pending' || status === 'confirmed' || status === 'prepared';
}

export function isHistoryStaffOrderStatus(status: StaffOrderStatus): boolean {
  return status === 'delivered' || status === 'cancelled';
}

export const STAFF_ORDER_STATUS_LABELS: Record<
  StaffOrderStatus,
  { en: string; ar: string }
> = {
  pending: { en: 'Pending', ar: 'قيد الانتظار' },
  confirmed: { en: 'Accepted', ar: 'مقبول' },
  prepared: { en: 'Prepared', ar: 'تم التحضير' },
  delivered: { en: 'Delivered', ar: 'تم التسليم' },
  cancelled: { en: 'Rejected', ar: 'مرفوض' },
};
