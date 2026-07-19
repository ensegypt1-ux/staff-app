"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldBlockStaffSelfAccept = shouldBlockStaffSelfAccept;
exports.filterSelfAcceptActions = filterSelfAcceptActions;
exports.applyStaffOrderSelfAcceptRules = applyStaffOrderSelfAcceptRules;
const staff_capability_mapper_1 = require("./staff-capability.mapper");
const TABLE_CALL_CONFIRMED = 'TABLE_CALL_CONFIRMED';
function shouldBlockStaffSelfAccept(params) {
    const canConfirm = (0, staff_capability_mapper_1.staffHasPermission)(params.auth, 'orders:confirm');
    const canDeliver = (0, staff_capability_mapper_1.staffHasPermission)(params.auth, 'orders:deliver');
    return (params.channel === 'table' &&
        params.status === 'pending' &&
        canConfirm &&
        !canDeliver &&
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
        availableActions: filterSelfAcceptActions(entry.availableActions, waitingForCashierApproval),
    };
}
//# sourceMappingURL=staff-order-self-accept.util.js.map