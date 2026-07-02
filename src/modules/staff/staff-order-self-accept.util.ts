import { StaffJobRole } from './staff-job-role.util';
import { StaffOrderChannel } from './staff-order-channel.util';
import { StaffOrderStatus } from './staff-order-status.util';
import {
  StaffOrderActionSpec,
  StaffOrderActionType,
} from './staff-order-actions.util';
import { StaffPresentedOrderEntry } from './staff-order-presenter.service';

const TABLE_CALL_CONFIRMED: StaffOrderActionType = 'TABLE_CALL_CONFIRMED';

export function shouldBlockWaiterSelfAccept(params: {
  channel: StaffOrderChannel;
  status: StaffOrderStatus;
  createdByStaffId: number | null;
  role: StaffJobRole;
  currentStaffId: number;
}): boolean {
  return (
    params.channel === 'table' &&
    params.status === 'pending' &&
    params.role === 'waiter' &&
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
    role: StaffJobRole;
    currentStaffId: number;
    createdByStaffId: number | null;
  },
): StaffPresentedOrderEntry {
  const createdByStaffId = context.createdByStaffId;
  const waitingForCashierApproval = shouldBlockWaiterSelfAccept({
    channel: entry.channel,
    status: entry.status,
    createdByStaffId,
    role: context.role,
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
