"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inferChannelFromPayload = inferChannelFromPayload;
exports.mapNewTableCallEvent = mapNewTableCallEvent;
exports.mapAttentionChangedEvent = mapAttentionChangedEvent;
function asPositiveInt(raw) {
    const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
}
function coerceAt(payload) {
    const raw = payload.at ?? payload.createdAt;
    if (typeof raw === 'string' && raw.trim())
        return raw.trim();
    return new Date().toISOString();
}
function inferChannelFromPayload(payload) {
    for (const key of ['type', 'orderType', 'orderChannel', 'channel']) {
        const value = String(payload[key] ?? '')
            .trim()
            .toLowerCase();
        if (value === 'delivery')
            return 'delivery';
        if (value === 'table')
            return 'table';
    }
    const table = String(payload.tableNumber ?? '')
        .trim()
        .toLowerCase();
    if (table === 'delivery' || table === '')
        return 'delivery';
    return 'table';
}
function mapNewTableCallEvent(payload, channelOverride) {
    const menuId = asPositiveInt(payload.menuId);
    const staffCallId = asPositiveInt(payload.id);
    if (menuId == null || staffCallId == null)
        return null;
    const at = coerceAt(payload);
    const channel = channelOverride ?? inferChannelFromPayload(payload);
    const kind = 'new_call';
    return {
        menuId,
        staffCallId,
        kind,
        channel,
        eventId: `fcm:${menuId}:${staffCallId}:${kind}:${at}`,
        at,
        tableNumber: String(payload.tableNumber ?? '').trim(),
        customerName: typeof payload.customerName === 'string'
            ? payload.customerName.trim() || undefined
            : undefined,
    };
}
function mapAttentionChangedEvent(payload, channelOverride) {
    const menuId = asPositiveInt(payload.menuId);
    const staffCallId = asPositiveInt(payload.id);
    if (menuId == null || staffCallId == null)
        return null;
    const requestKind = String(payload.requestKind ?? '')
        .trim()
        .toLowerCase();
    const status = String(payload.status ?? '')
        .trim()
        .toLowerCase();
    let kind = null;
    if (payload.pendingGuestAddition === true) {
        kind = 'guest_add';
    }
    else if (payload.pendingBillRequest === true ||
        (requestKind === 'bill' && (status === 'pending' || status === ''))) {
        kind = 'bill';
    }
    else if (requestKind === 'waiter' && (status === 'pending' || status === '')) {
        kind = 'waiter_request';
    }
    if (!kind)
        return null;
    const at = coerceAt(payload);
    const channel = channelOverride ?? inferChannelFromPayload(payload);
    return {
        menuId,
        staffCallId,
        kind,
        channel,
        eventId: `fcm:${menuId}:${staffCallId}:${kind}:${at}`,
        at,
        tableNumber: String(payload.tableNumber ?? '').trim(),
        customerName: typeof payload.customerName === 'string'
            ? payload.customerName.trim() || undefined
            : undefined,
    };
}
//# sourceMappingURL=fcm-event.mapper.js.map