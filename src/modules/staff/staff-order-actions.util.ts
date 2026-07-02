import { StaffJobRole } from './staff-job-role.util';
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

/** Mirrors web `actionsForStatus`, filtered by staff job role and channel. */
export function availableActionsForOrder(
  status: StaffOrderStatus,
  role: StaffJobRole,
  channel: StaffOrderChannel = 'table',
): StaffOrderActionSpec[] {
  const specs: StaffOrderActionSpec[] = [];

  const push = (action: StaffOrderActionType) => {
    specs.push({ action, label: ACTION_LABELS[action] });
  };

  if (channel === 'delivery' && role === 'cashier') {
    switch (status) {
      case 'pending':
      case 'confirmed':
        push('TABLE_CALL_PREPARED');
        break;
      case 'prepared':
        push('TABLE_CALL_DELIVERED');
        break;
      default:
        break;
    }
    return specs;
  }

  switch (status) {
    case 'pending':
      if (role === 'cashier' || role === 'waiter') {
        push('TABLE_CALL_CONFIRMED');
        push('TABLE_CALL_CANCELLED');
      }
      break;
    case 'confirmed':
      if (role === 'cashier') {
        push('TABLE_CALL_PREPARED');
      }
      break;
    case 'prepared':
      if (role === 'cashier') {
        push('TABLE_CALL_DELIVERED');
      }
      break;
    default:
      break;
  }

  return specs;
}

export function canStaffProcessOrders(role: StaffJobRole): boolean {
  return role === 'cashier';
}

export function canStaffViewDelivery(role: StaffJobRole): boolean {
  return role === 'cashier';
}

export function statusLabelFor(status: StaffOrderStatus): {
  en: string;
  ar: string;
} {
  return STAFF_ORDER_STATUS_LABELS[status];
}

export function isCashierOnlyAction(action: StaffOrderActionType): boolean {
  return (
    action === 'TABLE_CALL_PREPARED' || action === 'TABLE_CALL_DELIVERED'
  );
}
