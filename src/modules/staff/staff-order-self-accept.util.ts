import {
  StaffMappedCapabilities,
  StaffResolvedAuth,
  staffHasPermission,
} from './staff-capability.mapper';
import { StaffOrderChannel } from './staff-order-channel.util';
import { StaffOrderStatus } from './staff-order-status.util';
import {
  StaffOrderActionSpec,
  StaffOrderActionType,
} from './staff-order-actions.util';
import { StaffPresentedOrderEntry } from './staff-order-presenter.service';

const TABLE_CALL_CONFIRMED: StaffOrderActionType = 'TABLE_CALL_CONFIRMED';

type AuthCaps = StaffResolvedAuth | StaffMappedCapabilities;

/**
 * Self-accept is blocked when the actor has `orders:confirm` but not
 * `orders:deliver` (classic waiter shape) and created the pending table order.
 */
export function shouldBlockStaffSelfAccept(params: {
  channel: StaffOrderChannel;
  status: StaffOrderStatus;
  createdByStaffId: number | null;
  auth: AuthCaps;
  currentStaffId: number;
}): boolean {
  const canConfirm = staffHasPermission(params.auth, 'orders:confirm');
  const canDeliver = staffHasPermission(params.auth, 'orders:deliver');

  return (
    params.channel === 'table' &&
    params.status === 'pending' &&
    canConfirm &&
    !canDeliver &&
    params.createdByStaffId != null &&
    params.createdByStaffId > 0 &&
    params.currentStaffId > 0 &&
    params.createdByStaffId === params.currentStaffId
  );
}

export function filterSelfAcceptActions(
  actions: StaffOrderActionSpec[],
  blockSelfAccept: boolean,
): StaffOrderActionSpec[] {
  if (!blockSelfAccept) return actions;
  return actions.filter((spec) => spec.action !== TABLE_CALL_CONFIRMED);
}

export function applyStaffOrderSelfAcceptRules(
  entry: StaffPresentedOrderEntry,
  context: {
    auth: AuthCaps;
    currentStaffId: number;
    createdByStaffId: number | null;
  },
): StaffPresentedOrderEntry {
  const createdByStaffId = context.createdByStaffId;
  const waitingForCashierApproval = shouldBlockStaffSelfAccept({
    channel: entry.channel,
    status: entry.status,
    createdByStaffId,
    auth: context.auth,
    currentStaffId: context.currentStaffId,
  });

  return {
    ...entry,
    createdByStaffId,
    waitingForCashierApproval,
    availableActions: filterSelfAcceptActions(
      entry.availableActions,
      waitingForCashierApproval,
    ),
  };
}
