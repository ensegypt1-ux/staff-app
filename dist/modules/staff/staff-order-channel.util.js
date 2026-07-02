"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveStaffOrderChannel = resolveStaffOrderChannel;
exports.isDeliveryUpstreamRow = isDeliveryUpstreamRow;
function resolveStaffOrderChannel(raw, listChannelHint) {
    for (const key of ['type', 'orderType', 'orderChannel']) {
        const value = String(raw[key] ?? '')
            .trim()
            .toLowerCase();
        if (value === 'delivery')
            return 'delivery';
        if (value === 'table')
            return 'table';
    }
    const channelField = String(raw.channel ?? '')
        .trim()
        .toLowerCase();
    if (channelField === 'delivery')
        return 'delivery';
    if (channelField === 'table')
        return 'table';
    const order = raw.order && typeof raw.order === 'object'
        ? raw.order
        : null;
    if (order) {
        const nested = resolveStaffOrderChannel(order);
        if (nested === 'delivery')
            return 'delivery';
    }
    const table = String(raw.tableNumber ?? '')
        .trim()
        .toLowerCase();
    if (table === 'delivery')
        return 'delivery';
    if (table === '')
        return 'delivery';
    if (listChannelHint === 'delivery' || listChannelHint === 'table') {
        return listChannelHint;
    }
    return 'table';
}
function isDeliveryUpstreamRow(raw) {
    return resolveStaffOrderChannel(raw) === 'delivery';
}
//# sourceMappingURL=staff-order-channel.util.js.map