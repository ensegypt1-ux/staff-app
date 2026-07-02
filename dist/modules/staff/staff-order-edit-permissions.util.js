"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveCanEditItems = resolveCanEditItems;
function resolveCanEditItems(channel, role, status) {
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
        return status === 'pending' || status === 'confirmed';
    }
    return false;
}
//# sourceMappingURL=staff-order-edit-permissions.util.js.map