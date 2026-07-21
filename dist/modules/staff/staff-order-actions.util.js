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
    TABLE_CALL_COMPLETED: { en: 'Finish', ar: 'إنهاء' },
};
const DELIVERY_ACTION_LABELS = {
    TABLE_CALL_CONFIRMED: { en: 'Accept', ar: 'قبول' },
    TABLE_CALL_PREPARED: { en: 'Mark prepared', ar: 'تم التحضير' },
    TABLE_CALL_DELIVERED: {
        en: 'Mark as sent out',
        ar: 'تم التسليم للمندوب',
    },
    TABLE_CALL_CANCELLED: { en: 'Reject', ar: 'رفض' },
};
const ACCEPT_ADDITION_LABEL = {
    en: 'Accept addition',
    ar: 'قبول الإضافة',
};
function availableActionsForOrder(status, auth, channel = 'table', options = {}) {
    const specs = [];
    const pendingGuestAddition = options.pendingGuestAddition === true;
    const requestKind = String(options.requestKind ?? 'order')
        .trim()
        .toLowerCase();
    const isService = requestKind === 'waiter' || requestKind === 'bill';
    const push = (action, labelOverride) => {
        const deliveryLabel = channel === 'delivery' ? DELIVERY_ACTION_LABELS[action] : undefined;
        specs.push({
            action,
            label: labelOverride ?? deliveryLabel ?? ACTION_LABELS[action],
        });
    };
    if (isService && channel === 'table') {
        if (status !== 'pending') {
            return specs;
        }
        if ((0, staff_capability_mapper_1.staffHasPermission)(auth, 'orders:confirm')) {
            push('TABLE_CALL_CONFIRMED');
        }
        if ((0, staff_capability_mapper_1.staffHasPermission)(auth, 'orders:cancel')) {
            push('TABLE_CALL_CANCELLED');
        }
        return specs;
    }
    if (channel === 'delivery') {
        if (!(0, staff_capability_mapper_1.staffHasPermission)(auth, 'delivery:view')) {
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
    if (pendingGuestAddition &&
        (status === 'confirmed' || status === 'prepared')) {
        if ((0, staff_capability_mapper_1.staffHasPermission)(auth, 'orders:confirm')) {
            push('TABLE_CALL_CONFIRMED', ACCEPT_ADDITION_LABEL);
        }
        return specs;
    }
    switch (status) {
        case 'pending':
            if ((0, staff_capability_mapper_1.staffHasPermission)(auth, 'orders:confirm')) {
                push('TABLE_CALL_CONFIRMED', pendingGuestAddition ? ACCEPT_ADDITION_LABEL : undefined);
            }
            if ((0, staff_capability_mapper_1.staffHasPermission)(auth, 'orders:cancel')) {
                push('TABLE_CALL_CANCELLED');
            }
            break;
        case 'confirmed':
        case 'prepared':
            if ((0, staff_capability_mapper_1.staffHasPermission)(auth, 'orders:complete')) {
                push('TABLE_CALL_COMPLETED');
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
function statusLabelFor(status, channel = 'table') {
    if (channel === 'delivery') {
        return staff_order_status_util_1.STAFF_DELIVERY_ORDER_STATUS_LABELS[status];
    }
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
        case 'TABLE_CALL_COMPLETED':
            return 'orders:complete';
        default:
            return 'orders:confirm';
    }
}
function canPerformOrderAction(auth, action) {
    return (0, staff_capability_mapper_1.staffHasPermission)(auth, permissionForOrderAction(action));
}
//# sourceMappingURL=staff-order-actions.util.js.map