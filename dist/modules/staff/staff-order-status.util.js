"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STAFF_ORDER_STATUS_LABELS = void 0;
exports.normalizeStaffOrderStatus = normalizeStaffOrderStatus;
exports.resolveLatestOrderStatus = resolveLatestOrderStatus;
exports.resolveListEntryStatus = resolveListEntryStatus;
exports.orderStatusFromAction = orderStatusFromAction;
exports.isActiveStaffOrderStatus = isActiveStaffOrderStatus;
exports.isHistoryStaffOrderStatus = isHistoryStaffOrderStatus;
exports.staffOrderStatusLifecycleRank = staffOrderStatusLifecycleRank;
exports.preferAuthoritativeLifecycleStatus = preferAuthoritativeLifecycleStatus;
const TERMINAL = new Set([
    'confirmed',
    'cancelled',
    'prepared',
    'delivered',
]);
function normalizeStaffOrderStatus(raw) {
    const value = String(raw ?? '')
        .trim()
        .toLowerCase();
    if (value === 'table_call_created')
        return 'pending';
    if (value === 'confirmed' ||
        value === 'cancelled' ||
        value === 'prepared' ||
        value === 'delivered' ||
        value === 'pending') {
        return value;
    }
    return 'pending';
}
function resolveLatestOrderStatus(actions, order) {
    const orderStatus = normalizeStaffOrderStatus(order?.status);
    if (TERMINAL.has(orderStatus) && orderStatus !== 'confirmed') {
        return orderStatus;
    }
    if (orderStatus === 'confirmed' && !actions?.length) {
        return 'confirmed';
    }
    if (!actions?.length)
        return 'pending';
    for (let i = actions.length - 1; i >= 0; i -= 1) {
        const status = normalizeStaffOrderStatus(actions[i]?.status);
        if (status === 'pending')
            continue;
        return status;
    }
    return 'pending';
}
function resolveListEntryStatus(entry) {
    if (entry.status) {
        return normalizeStaffOrderStatus(entry.status);
    }
    return resolveLatestOrderStatus(entry.actionDetails);
}
function orderStatusFromAction(action) {
    switch (action) {
        case 'TABLE_CALL_CONFIRMED':
            return 'confirmed';
        case 'TABLE_CALL_CANCELLED':
            return 'cancelled';
        case 'TABLE_CALL_PREPARED':
            return 'prepared';
        case 'TABLE_CALL_DELIVERED':
        case 'TABLE_CALL_COMPLETED':
            return 'delivered';
        default:
            return 'pending';
    }
}
function isActiveStaffOrderStatus(status) {
    return status === 'pending' || status === 'confirmed' || status === 'prepared';
}
function isHistoryStaffOrderStatus(status) {
    return status === 'delivered' || status === 'cancelled';
}
function staffOrderStatusLifecycleRank(status) {
    switch (status) {
        case 'pending':
            return 0;
        case 'confirmed':
            return 1;
        case 'prepared':
            return 2;
        case 'delivered':
        case 'cancelled':
            return 3;
    }
}
function preferAuthoritativeLifecycleStatus(primary, secondary) {
    return staffOrderStatusLifecycleRank(primary) >=
        staffOrderStatusLifecycleRank(secondary)
        ? primary
        : secondary;
}
exports.STAFF_ORDER_STATUS_LABELS = {
    pending: { en: 'Pending', ar: 'قيد الانتظار' },
    confirmed: { en: 'Accepted', ar: 'مقبول' },
    prepared: { en: 'Prepared', ar: 'تم التحضير' },
    delivered: { en: 'Delivered', ar: 'تم التسليم' },
    cancelled: { en: 'Rejected', ar: 'مرفوض' },
};
//# sourceMappingURL=staff-order-status.util.js.map