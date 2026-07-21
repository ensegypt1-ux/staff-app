"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parsePermissionsJson = parsePermissionsJson;
exports.deviceShouldReceivePush = deviceShouldReceivePush;
function parsePermissionsJson(raw) {
    if (!raw)
        return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed))
            return [];
        return parsed.map((p) => String(p).trim()).filter(Boolean);
    }
    catch {
        return [];
    }
}
function deviceShouldReceivePush(input) {
    const set = new Set(input.permissions.map((p) => p.trim()).filter(Boolean));
    if (input.kind === 'new_call') {
        if (input.channel === 'delivery') {
            return set.has('delivery:view');
        }
        return (set.has('orders:view') &&
            (set.has('orders:confirm') || set.has('orders:prepare')));
    }
    if (input.kind === 'guest_add' ||
        input.kind === 'bill' ||
        input.kind === 'waiter_request') {
        return set.has('orders:confirm');
    }
    return false;
}
//# sourceMappingURL=fcm-recipient.util.js.map