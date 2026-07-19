import {
  StaffMappedCapabilities,
  StaffResolvedAuth,
  staffHasPermission,
} from './staff-capability.mapper';
import { StaffOrderChannel } from './staff-order-channel.util';
import {
  StaffOrderStatus,
  STAFF_ORDER_STATUS_LABELS,
} from './staff-order-status.util';

export type StaffOrderActionType =
  | 'TABLE_CALL_CONFIRMED'
  | 'TABLE_CALL_CANCELLED'
  | 'TABLE_CALL_PREPARED'
  | 'TABLE_CALL_DELIVERED';

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
};

type AuthCaps = StaffResolvedAuth | StaffMappedCapabilities;

/** Available order actions from permissions + channel + status. */
export function availableActionsForOrder(
  status: StaffOrderStatus,
  auth: AuthCaps,
  channel: StaffOrderChannel = 'table',
): StaffOrderActionSpec[] {
  const specs: StaffOrderActionSpec[] = [];

  const push = (action: StaffOrderActionType) => {
    specs.push({ action, label: ACTION_LABELS[action] });
  };

  if (channel === 'delivery') {
    if (!staffHasPermission(auth, 'delivery:view')) {
      return specs;
    }
    switch (status) {
      case 'pending':
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

export function statusLabelFor(status: StaffOrderStatus): {
  en: string;
  ar: string;
} {
  return STAFF_ORDER_STATUS_LABELS[status];
}

/** Permission required to perform a staff order action. */
export function permissionForOrderAction(
  action: StaffOrderActionType,
):
  | 'orders:confirm'
  | 'orders:cancel'
  | 'orders:prepare'
  | 'orders:deliver' {
  switch (action) {
    case 'TABLE_CALL_CONFIRMED':
      return 'orders:confirm';
    case 'TABLE_CALL_CANCELLED':
      return 'orders:cancel';
    case 'TABLE_CALL_PREPARED':
      return 'orders:prepare';
    case 'TABLE_CALL_DELIVERED':
      return 'orders:deliver';
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
