export type StaffOrderChannel = 'table' | 'delivery';

/**
 * Detect table vs delivery from upstream payloads (activity-logs, table-calls).
 * Express table-calls API may omit `type`; delivery orders use empty `tableNumber`.
 */
export function resolveStaffOrderChannel(
  raw: Record<string, unknown>,
  listChannelHint?: StaffOrderChannel,
): StaffOrderChannel {
  for (const key of ['type', 'orderType', 'orderChannel'] as const) {
    const value = String(raw[key] ?? '')
      .trim()
      .toLowerCase();
    if (value === 'delivery') return 'delivery';
    if (value === 'table') return 'table';
  }

  const channelField = String(raw.channel ?? '')
    .trim()
    .toLowerCase();
  if (channelField === 'delivery') return 'delivery';
  if (channelField === 'table') return 'table';

  const order =
    raw.order && typeof raw.order === 'object'
      ? (raw.order as Record<string, unknown>)
      : null;
  if (order) {
    const nested = resolveStaffOrderChannel(order);
    if (nested === 'delivery') return 'delivery';
  }

  const table = String(raw.tableNumber ?? '')
    .trim()
    .toLowerCase();
  if (table === 'delivery') return 'delivery';

  // Express requires non-empty tableNumber for table orders; delivery uses "".
  if (table === '') return 'delivery';

  if (listChannelHint === 'delivery' || listChannelHint === 'table') {
    return listChannelHint;
  }

  return 'table';
}

export function isDeliveryUpstreamRow(
  raw: Record<string, unknown>,
): boolean {
  return resolveStaffOrderChannel(raw) === 'delivery';
}
