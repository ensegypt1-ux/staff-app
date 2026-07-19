import {
  StaffMappedCapabilities,
  StaffResolvedAuth,
  staffHasPermission,
} from './staff-capability.mapper';
import { StaffOrderChannel } from './staff-order-channel.util';
import { StaffOrderStatus } from './staff-order-status.util';

type AuthCaps = StaffResolvedAuth | StaffMappedCapabilities;

/**
 * Mirrors Web `isEditableOrderStatus`: pending | confirmed | prepared
 * when `orders:edit_items` is granted. Delivery also requires `delivery:view`.
 */
export function resolveCanEditItems(
  channel: StaffOrderChannel,
  auth: AuthCaps,
  status: StaffOrderStatus,
): boolean {
  if (status === 'delivered' || status === 'cancelled') {
    return false;
  }

  if (!staffHasPermission(auth, 'orders:edit_items')) {
    return false;
  }

  if (channel === 'delivery' && !staffHasPermission(auth, 'delivery:view')) {
    return false;
  }

  if (channel !== 'table' && channel !== 'delivery') {
    return false;
  }

  return (
    status === 'pending' || status === 'confirmed' || status === 'prepared'
  );
}
