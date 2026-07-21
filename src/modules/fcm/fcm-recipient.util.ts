import { FcmOrderChannel, FcmPushKind } from './fcm.constants';

export function parsePermissionsJson(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((p) => String(p).trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export function deviceShouldReceivePush(input: {
  permissions: string[];
  kind: FcmPushKind;
  channel: FcmOrderChannel;
}): boolean {
  const set = new Set(input.permissions.map((p) => p.trim()).filter(Boolean));

  if (input.kind === 'new_call') {
    if (input.channel === 'delivery') {
      return set.has('delivery:view');
    }
    // table new order: floor/kitchen interest
    return (
      set.has('orders:view') &&
      (set.has('orders:confirm') || set.has('orders:prepare'))
    );
  }

  // guest_add / bill / waiter_request — table attention
  if (
    input.kind === 'guest_add' ||
    input.kind === 'bill' ||
    input.kind === 'waiter_request'
  ) {
    return set.has('orders:confirm');
  }

  return false;
}
