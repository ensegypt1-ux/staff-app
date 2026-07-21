"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TABLE_ATTENTION_COUNT_MAX_SCAN_ROWS = void 0;
exports.parseStaffRequestKind = parseStaffRequestKind;
exports.isServiceRequestKind = isServiceRequestKind;
exports.entryNeedsAttention = entryNeedsAttention;
exports.attentionSortRank = attentionSortRank;
exports.sortTableEntriesByAttention = sortTableEntriesByAttention;
exports.countAttentionEntries = countAttentionEntries;
exports.isMergeableServiceTableCall = isMergeableServiceTableCall;
exports.resolveStaffCallIdFromListRow = resolveStaffCallIdFromListRow;
exports.activityLogRowNeedsAttention = activityLogRowNeedsAttention;
exports.countTableAttentionAcrossSources = countTableAttentionAcrossSources;
function parseStaffRequestKind(raw) {
    const normalized = String(raw ?? '')
        .trim()
        .toLowerCase();
    if (normalized === 'waiter' || normalized === 'bill') {
        return normalized;
    }
    return 'order';
}
function isServiceRequestKind(kind) {
    return kind === 'waiter' || kind === 'bill';
}
function entryNeedsAttention(entry) {
    const kind = parseStaffRequestKind(entry.requestKind);
    const isService = kind === 'waiter' || kind === 'bill';
    if (isService) {
        return entry.status === 'pending';
    }
    return (entry.status === 'pending' ||
        entry.pendingGuestAddition === true ||
        entry.pendingBillRequest === true);
}
function attentionSortRank(entry) {
    const kind = parseStaffRequestKind(entry.requestKind);
    const pendingService = entry.status === 'pending';
    if (entry.pendingBillRequest === true ||
        (kind === 'bill' && pendingService)) {
        return 0;
    }
    if (entry.pendingGuestAddition === true)
        return 1;
    if (kind === 'waiter' && pendingService)
        return 2;
    if (entry.status === 'pending')
        return 3;
    return 4;
}
function sortTableEntriesByAttention(entries) {
    return [...entries].sort((a, b) => {
        const rankDiff = attentionSortRank(a) - attentionSortRank(b);
        if (rankDiff !== 0)
            return rankDiff;
        const aTime = Date.parse(a.createdAt ?? '') || 0;
        const bTime = Date.parse(b.createdAt ?? '') || 0;
        return bTime - aTime;
    });
}
function countAttentionEntries(entries) {
    return entries.filter(entryNeedsAttention).length;
}
function isMergeableServiceTableCall(raw) {
    if (!isServiceRequestKind(parseStaffRequestKind(raw.requestKind))) {
        return false;
    }
    const status = String(raw.status ?? 'pending')
        .trim()
        .toLowerCase();
    return status === 'pending' || status === '';
}
function resolveStaffCallIdFromListRow(raw) {
    const orderId = Number(raw.orderId ?? 0);
    if (Number.isFinite(orderId) && orderId > 0)
        return orderId;
    const id = Number(raw.id ?? 0);
    return Number.isFinite(id) && id > 0 ? id : 0;
}
function activityLogRowNeedsAttention(raw) {
    return entryNeedsAttention({
        status: String(raw.status ?? 'pending')
            .trim()
            .toLowerCase(),
        pendingGuestAddition: raw.pendingGuestAddition === true,
        pendingBillRequest: raw.pendingBillRequest === true,
        requestKind: parseStaffRequestKind(raw.requestKind),
    });
}
function countTableAttentionAcrossSources(input) {
    const countedIds = new Set();
    let count = 0;
    for (const row of input.activityLogRows) {
        if (!row || typeof row !== 'object')
            continue;
        if (!activityLogRowNeedsAttention(row))
            continue;
        const id = resolveStaffCallIdFromListRow(row);
        if (id > 0) {
            if (countedIds.has(id))
                continue;
            countedIds.add(id);
        }
        count += 1;
    }
    for (const row of input.serviceTableCallRows) {
        if (!row || typeof row !== 'object')
            continue;
        if (!isMergeableServiceTableCall(row))
            continue;
        const id = Number(row.id ?? 0);
        if (Number.isFinite(id) && id > 0) {
            if (countedIds.has(id))
                continue;
            countedIds.add(id);
        }
        count += 1;
    }
    return count;
}
exports.TABLE_ATTENTION_COUNT_MAX_SCAN_ROWS = 500;
//# sourceMappingURL=staff-order-attention.util.js.map