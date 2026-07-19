"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.availableActionsForOrder = availableActionsForOrder;
exports.canStaffProcessOrders = canStaffProcessOrders;
exports.canStaffViewDelivery = canStaffViewDelivery;
exports.canStaffViewOrders = canStaffViewOrders;
exports.canStaffViewHistory = canStaffViewHistory;
exports.statusLabelFor = statusLabelFor;
exports.permissionForOrderAction = permissionForOrderAction;
exports.canPerformOrderAction = canPerformOrderAction;
const staff_capability_mapper_1 = require("./staff-capability.mapper");
const staff_order_status_util_1 = require("./staff-order-status.util");
const ACTION_LABELS = {
    TABLE_CALL_CONFIRMED: { en: 'Accept', ar: 'قبول' },
    TABLE_CALL_CANCELLED: { en: 'Reject', ar: 'رفض' },
    TABLE_CALL_PREPARED: { en: 'Mark prepared', ar: 'تم التحضير' },
    TABLE_CALL_DELIVERED: { en: 'Mark delivered', ar: 'تم التسليم' },
};
function availableActionsForOrder(status, auth, channel = 'table') {
    const specs = [];
    const push = (action) => {
        specs.push({ action, label: ACTION_LABELS[action] });
    };
    if (channel === 'delivery') {
        if (!(0, staff_capability_mapper_1.staffHasPermission)(auth, 'delivery:view')) {
            return specs;
        }
        switch (status) {
            case 'pending':
            case 'confirmed':
                if ((0, staff_capability_mapper_1.staffHasPermission)(auth, 'orders:prepare')) {
                    push('TABLE_CALL_PREPARED');
                }
                break;
            case 'prepared':
                if ((0, staff_capability_mapper_1.staffHasPermission)(auth, 'orders:deliver')) {
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
            if ((0, staff_capability_mapper_1.staffHasPermission)(auth, 'orders:confirm')) {
                push('TABLE_CALL_CONFIRMED');
            }
            if ((0, staff_capability_mapper_1.staffHasPermission)(auth, 'orders:cancel')) {
                push('TABLE_CALL_CANCELLED');
            }
            break;
        case 'confirmed':
            if ((0, staff_capability_mapper_1.staffHasPermission)(auth, 'orders:prepare')) {
                push('TABLE_CALL_PREPARED');
            }
            break;
        case 'prepared':
            if ((0, staff_capability_mapper_1.staffHasPermission)(auth, 'orders:deliver')) {
                push('TABLE_CALL_DELIVERED');
            }
            break;
        default:
            break;
    }
    return specs;
}
function canStaffProcessOrders(auth) {
    const caps = 'capabilities' in auth ? auth.capabilities : auth;
    return caps.canProcessOrders;
}
function canStaffViewDelivery(auth) {
    return (0, staff_capability_mapper_1.staffHasPermission)(auth, 'delivery:view');
}
function canStaffViewOrders(auth) {
    return (0, staff_capability_mapper_1.staffHasPermission)(auth, 'orders:view');
}
function canStaffViewHistory(auth) {
    return (0, staff_capability_mapper_1.staffHasPermission)(auth, 'orders:view');
}
function statusLabelFor(status) {
    return staff_order_status_util_1.STAFF_ORDER_STATUS_LABELS[status];
}
function permissionForOrderAction(action) {
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
function canPerformOrderAction(auth, action) {
    return (0, staff_capability_mapper_1.staffHasPermission)(auth, permissionForOrderAction(action));
}
//# sourceMappingURL=staff-order-actions.util.js.map