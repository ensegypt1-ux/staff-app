"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldBlockWaiterSelfAccept = shouldBlockWaiterSelfAccept;
exports.filterSelfAcceptActions = filterSelfAcceptActions;
exports.applyStaffOrderSelfAcceptRules = applyStaffOrderSelfAcceptRules;
const TABLE_CALL_CONFIRMED = 'TABLE_CALL_CONFIRMED';
function shouldBlockWaiterSelfAccept(params) {
    return (params.channel === 'table' &&
        params.status === 'pending' &&
        params.role === 'waiter' &&
        params.createdByStaffId != null &&
        params.createdByStaffId > 0 &&
        params.currentStaffId > 0 &&
        params.createdByStaffId === params.currentStaffId);
}
function filterSelfAcceptActions(actions, blockSelfAccept) {
    if (!blockSelfAccept)
        return actions;
    return actions.filter((spec) => spec.action !== TABLE_CALL_CONFIRMED);
}
function applyStaffOrderSelfAcceptRules(entry, context) {
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
        availableActions: filterSelfAcceptActions(entry.availableActions, waitingForCashierApproval),
    };
}
//# sourceMappingURL=staff-order-self-accept.util.js.map