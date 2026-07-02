"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.availableActionsForOrder = availableActionsForOrder;
exports.canStaffProcessOrders = canStaffProcessOrders;
exports.canStaffViewDelivery = canStaffViewDelivery;
exports.statusLabelFor = statusLabelFor;
exports.isCashierOnlyAction = isCashierOnlyAction;
const staff_order_status_util_1 = require("./staff-order-status.util");
const ACTION_LABELS = {
    TABLE_CALL_CONFIRMED: { en: 'Accept', ar: 'قبول' },
    TABLE_CALL_CANCELLED: { en: 'Reject', ar: 'رفض' },
    TABLE_CALL_PREPARED: { en: 'Mark prepared', ar: 'تم التحضير' },
    TABLE_CALL_DELIVERED: { en: 'Mark delivered', ar: 'تم التسليم' },
};
function availableActionsForOrder(status, role, channel = 'table') {
    const specs = [];
    const push = (action) => {
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
function canStaffProcessOrders(role) {
    return role === 'cashier';
}
function canStaffViewDelivery(role) {
    return role === 'cashier';
}
function statusLabelFor(status) {
    return staff_order_status_util_1.STAFF_ORDER_STATUS_LABELS[status];
}
function isCashierOnlyAction(action) {
    return (action === 'TABLE_CALL_PREPARED' || action === 'TABLE_CALL_DELIVERED');
}
//# sourceMappingURL=staff-order-actions.util.js.map