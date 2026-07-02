import { StaffJobRole } from './staff-job-role.util';
import { StaffOrderChannel } from './staff-order-channel.util';
import { StaffOrderStatus } from './staff-order-status.util';

/** Single source of truth for order item editing by role, channel, and status. */
export function resolveCanEditItems(
  channel: StaffOrderChannel,
  role: StaffJobRole,
  status: StaffOrderStatus,
): boolean {
  if (status === 'delivered' || status === 'cancelled') {
    return false;
  }

  if (role === 'waiter') {
    return channel === 'table' && status === 'pending';
  }

  if (role === 'cashier') {
    if (channel !== 'table' && channel !== 'delivery') {
      return false;
    }
    // Upstream item PATCH allows pending + confirmed only.
    return status === 'pending' || status === 'confirmed';
  }

  return false;
}
