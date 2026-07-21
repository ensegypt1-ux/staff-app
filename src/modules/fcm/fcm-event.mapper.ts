import { FcmOrderChannel, FcmPushKind } from './fcm.constants';

export type ExpressTableCallPayload = {
  id?: unknown;
  menuId?: unknown;
  tableNumber?: unknown;
  status?: unknown;
  requestKind?: unknown;
  pendingGuestAddition?: unknown;
  pendingBillRequest?: unknown;
  at?: unknown;
  createdAt?: unknown;
  type?: unknown;
  orderType?: unknown;
  orderChannel?: unknown;
  channel?: unknown;
  customerName?: unknown;
  items?: unknown;
  orderTotal?: unknown;
};

export type MappedFcmEvent = {
  menuId: number;
  staffCallId: number;
  kind: FcmPushKind;
  channel: FcmOrderChannel;
  eventId: string;
  at: string;
  tableNumber: string;
  customerName?: string;
};

function asPositiveInt(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function coerceAt(payload: ExpressTableCallPayload): string {
  const raw = payload.at ?? payload.createdAt;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return new Date().toISOString();
}

export function inferChannelFromPayload(
  payload: ExpressTableCallPayload,
): FcmOrderChannel {
  for (const key of ['type', 'orderType', 'orderChannel', 'channel'] as const) {
    const value = String(payload[key] ?? '')
      .trim()
      .toLowerCase();
    if (value === 'delivery') return 'delivery';
    if (value === 'table') return 'table';
  }
  const table = String(payload.tableNumber ?? '')
    .trim()
    .toLowerCase();
  if (table === 'delivery' || table === '') return 'delivery';
  return 'table';
}

/**
 * Map `staff:table_call` → always new_call when ids valid.
 */
export function mapNewTableCallEvent(
  payload: ExpressTableCallPayload,
  channelOverride?: FcmOrderChannel,
): MappedFcmEvent | null {
  const menuId = asPositiveInt(payload.menuId);
  const staffCallId = asPositiveInt(payload.id);
  if (menuId == null || staffCallId == null) return null;

  const at = coerceAt(payload);
  const channel = channelOverride ?? inferChannelFromPayload(payload);
  const kind: FcmPushKind = 'new_call';
  return {
    menuId,
    staffCallId,
    kind,
    channel,
    eventId: `fcm:${menuId}:${staffCallId}:${kind}:${at}`,
    at,
    tableNumber: String(payload.tableNumber ?? '').trim(),
    customerName:
      typeof payload.customerName === 'string'
        ? payload.customerName.trim() || undefined
        : undefined,
  };
}

/**
 * Map attention-worthy `staff:table_call_changed` only.
 * Routine confirm/prepare/deliver/cancel → null (no FCM).
 */
export function mapAttentionChangedEvent(
  payload: ExpressTableCallPayload,
  channelOverride?: FcmOrderChannel,
): MappedFcmEvent | null {
  const menuId = asPositiveInt(payload.menuId);
  const staffCallId = asPositiveInt(payload.id);
  if (menuId == null || staffCallId == null) return null;

  const requestKind = String(payload.requestKind ?? '')
    .trim()
    .toLowerCase();
  const status = String(payload.status ?? '')
    .trim()
    .toLowerCase();

  let kind: FcmPushKind | null = null;
  if (payload.pendingGuestAddition === true) {
    kind = 'guest_add';
  } else if (
    payload.pendingBillRequest === true ||
    (requestKind === 'bill' && (status === 'pending' || status === ''))
  ) {
    kind = 'bill';
  } else if (requestKind === 'waiter' && (status === 'pending' || status === '')) {
    kind = 'waiter_request';
  }

  if (!kind) return null;

  const at = coerceAt(payload);
  const channel = channelOverride ?? inferChannelFromPayload(payload);
  return {
    menuId,
    staffCallId,
    kind,
    channel,
    eventId: `fcm:${menuId}:${staffCallId}:${kind}:${at}`,
    at,
    tableNumber: String(payload.tableNumber ?? '').trim(),
    customerName:
      typeof payload.customerName === 'string'
        ? payload.customerName.trim() || undefined
        : undefined,
  };
}
