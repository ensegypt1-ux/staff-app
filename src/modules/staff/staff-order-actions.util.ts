import {
  StaffMappedCapabilities,
  StaffResolvedAuth,
  staffHasPermission,
} from './staff-capability.mapper';
import { StaffOrderChannel } from './staff-order-channel.util';
import {
  StaffOrderStatus,
  STAFF_DELIVERY_ORDER_STATUS_LABELS,
  STAFF_ORDER_STATUS_LABELS,
} from './staff-order-status.util';

export type StaffOrderActionType =
  | 'TABLE_CALL_CONFIRMED'
  | 'TABLE_CALL_CANCELLED'
  | 'TABLE_CALL_PREPARED'
  | 'TABLE_CALL_DELIVERED'
  | 'TABLE_CALL_COMPLETED';

export type StaffOrderActionSpec = {
  action: StaffOrderActionType;
  label: { en: string; ar: string };
};

const ACTION_LABELS: Record<
  StaffOrderActionType,
  { en: string; ar: string }
> = {
  TABLE_CALL_CONFIRMED: { en: 'Accept', ar: 'قبول' },
  TABLE_CALL_CANCELLED: { en: 'Reject', ar: 'رفض' },
  TABLE_CALL_PREPARED: { en: 'Mark prepared', ar: 'تم التحضير' },
  TABLE_CALL_DELIVERED: { en: 'Mark delivered', ar: 'تم التسليم' },
  TABLE_CALL_COMPLETED: { en: 'Finish', ar: 'إنهاء' },
};

/**
 * Staff-facing delivery action copy (Express actions unchanged).
 * Prepare / Accept labels match Web `deliveryOrders.markPrepared` / `accept`.
 * Deliver keeps Staff courier-handoff wording (not Web "Mark delivered").
 */
const DELIVERY_ACTION_LABELS: Partial<
  Record<StaffOrderActionType, { en: string; ar: string }>
> = {
  TABLE_CALL_CONFIRMED: { en: 'Accept', ar: 'قبول' },
  TABLE_CALL_PREPARED: { en: 'Mark prepared', ar: 'تم التحضير' },
  TABLE_CALL_DELIVERED: {
    en: 'Mark as sent out',
    ar: 'تم التسليم للمندوب',
  },
  TABLE_CALL_CANCELLED: { en: 'Reject', ar: 'رفض' },
};

const ACCEPT_ADDITION_LABEL = {
  en: 'Accept addition',
  ar: 'قبول الإضافة',
};

type AuthCaps = StaffResolvedAuth | StaffMappedCapabilities;

export type AvailableActionsOptions = {
  pendingGuestAddition?: boolean;
  /** Standalone waiter / orphan-bill service request (not a food order). */
  requestKind?: 'order' | 'waiter' | 'bill' | string;
};

/** Available order actions — mirrors Web `OrderActionButtons.actionsForStatus`. */
export function availableActionsForOrder(
  status: StaffOrderStatus,
  auth: AuthCaps,
  channel: StaffOrderChannel = 'table',
  options: AvailableActionsOptions = {},
): StaffOrderActionSpec[] {
  const specs: StaffOrderActionSpec[] = [];
  const pendingGuestAddition = options.pendingGuestAddition === true;
  const requestKind = String(options.requestKind ?? 'order')
    .trim()
    .toLowerCase();
  const isService = requestKind === 'waiter' || requestKind === 'bill';

  const push = (
    action: StaffOrderActionType,
    labelOverride?: { en: string; ar: string },
  ) => {
    const deliveryLabel =
      channel === 'delivery' ? DELIVERY_ACTION_LABELS[action] : undefined;
    specs.push({
      action,
      label: labelOverride ?? deliveryLabel ?? ACTION_LABELS[action],
    });
  };

  // Standalone service requests: Accept / Reject only while pending.
  if (isService && channel === 'table') {
    if (status !== 'pending') {
      return specs;
    }
    if (staffHasPermission(auth, 'orders:confirm')) {
      push('TABLE_CALL_CONFIRMED');
    }
    if (staffHasPermission(auth, 'orders:cancel')) {
      push('TABLE_CALL_CANCELLED');
    }
    return specs;
  }

  // Delivery — mirrors Web `OrderActionButtons` variant="delivery".
  if (channel === 'delivery') {
    if (!staffHasPermission(auth, 'delivery:view')) {
      return specs;
    }
    switch (status) {
      case 'pending':
        if (staffHasPermission(auth, 'orders:confirm')) {
          push('TABLE_CALL_CONFIRMED');
        }
        if (staffHasPermission(auth, 'orders:cancel')) {
          push('TABLE_CALL_CANCELLED');
        }
        break;
      case 'confirmed':
        if (staffHasPermission(auth, 'orders:prepare')) {
          push('TABLE_CALL_PREPARED');
        }
        break;
      case 'prepared':
        if (staffHasPermission(auth, 'orders:deliver')) {
          push('TABLE_CALL_DELIVERED');
        }
        break;
      default:
        break;
    }
    return specs;
  }

  // Table channel — Web dashboard parity (no prepare/deliver).
  if (
    pendingGuestAddition &&
    (status === 'confirmed' || status === 'prepared')
  ) {
    if (staffHasPermission(auth, 'orders:confirm')) {
      push('TABLE_CALL_CONFIRMED', ACCEPT_ADDITION_LABEL);
    }
    return specs;
  }

  switch (status) {
    case 'pending':
      if (staffHasPermission(auth, 'orders:confirm')) {
        push(
          'TABLE_CALL_CONFIRMED',
          pendingGuestAddition ? ACCEPT_ADDITION_LABEL : undefined,
        );
      }
      if (staffHasPermission(auth, 'orders:cancel')) {
        push('TABLE_CALL_CANCELLED');
      }
      break;
    case 'confirmed':
    case 'prepared':
      if (staffHasPermission(auth, 'orders:complete')) {
        push('TABLE_CALL_COMPLETED');
      }
      break;
    default:
      break;
  }

  return specs;
}

export function canStaffProcessOrders(auth: AuthCaps): boolean {
  const caps =
    'capabilities' in auth ? auth.capabilities : (auth as StaffMappedCapabilities);
  return caps.canProcessOrders;
}

export function canStaffViewDelivery(auth: AuthCaps): boolean {
  return staffHasPermission(auth, 'delivery:view');
}

export function canStaffViewOrders(auth: AuthCaps): boolean {
  return staffHasPermission(auth, 'orders:view');
}

export function canStaffViewHistory(auth: AuthCaps): boolean {
  return staffHasPermission(auth, 'orders:view');
}

export function statusLabelFor(
  status: StaffOrderStatus,
  channel: StaffOrderChannel = 'table',
): {
  en: string;
  ar: string;
} {
  if (channel === 'delivery') {
    return STAFF_DELIVERY_ORDER_STATUS_LABELS[status];
  }
  return STAFF_ORDER_STATUS_LABELS[status];
}

/** Permission required to perform a staff order action. */
export function permissionForOrderAction(
  action: StaffOrderActionType,
):
  | 'orders:confirm'
  | 'orders:cancel'
  | 'orders:prepare'
  | 'orders:deliver'
  | 'orders:complete' {
  switch (action) {
    case 'TABLE_CALL_CONFIRMED':
      return 'orders:confirm';
    case 'TABLE_CALL_CANCELLED':
      return 'orders:cancel';
    case 'TABLE_CALL_PREPARED':
      return 'orders:prepare';
    case 'TABLE_CALL_DELIVERED':
      return 'orders:deliver';
    case 'TABLE_CALL_COMPLETED':
      return 'orders:complete';
    default:
      return 'orders:confirm';
  }
}

export function canPerformOrderAction(
  auth: AuthCaps,
  action: StaffOrderActionType,
): boolean {
  return staffHasPermission(auth, permissionForOrderAction(action));
}
