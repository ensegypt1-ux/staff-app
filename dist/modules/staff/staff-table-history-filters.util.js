"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TABLE_HISTORY_MAX_SCAN_ROWS = void 0;
exports.parseIsoDateParam = parseIsoDateParam;
exports.formatIsoDateLocal = formatIsoDateLocal;
exports.todayIsoDateLocal = todayIsoDateLocal;
exports.resolveTableHistoryDateRange = resolveTableHistoryDateRange;
exports.entryCreatedAtIsoDate = entryCreatedAtIsoDate;
exports.filterEntriesByDateRange = filterEntriesByDateRange;
exports.paginatePresentedEntries = paginatePresentedEntries;
exports.dedupeEntriesByStaffCallId = dedupeEntriesByStaffCallId;
exports.buildTableHistoryListResult = buildTableHistoryListResult;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
function parseIsoDateParam(raw) {
    if (typeof raw !== 'string')
        return null;
    const trimmed = raw.trim();
    if (!ISO_DATE.test(trimmed))
        return null;
    const parsed = new Date(`${trimmed}T00:00:00`);
    if (Number.isNaN(parsed.getTime()))
        return null;
    return trimmed;
}
function formatIsoDateLocal(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}
function todayIsoDateLocal() {
    return formatIsoDateLocal(new Date());
}
function resolveTableHistoryDateRange(query, scope, channel) {
    if (scope !== 'history' || channel !== 'table') {
        return null;
    }
    const from = parseIsoDateParam(query.dateFrom);
    const to = parseIsoDateParam(query.dateTo);
    if (from && to) {
        if (from > to) {
            return { dateFrom: to, dateTo: from };
        }
        return { dateFrom: from, dateTo: to };
    }
    if (from && !to) {
        return { dateFrom: from, dateTo: from };
    }
    if (!from && to) {
        return { dateFrom: to, dateTo: to };
    }
    const today = todayIsoDateLocal();
    return { dateFrom: today, dateTo: today };
}
function entryCreatedAtIsoDate(entry) {
    const raw = entry.createdAt;
    if (!raw || typeof raw !== 'string')
        return null;
    const trimmed = raw.trim();
    if (!trimmed)
        return null;
    if (ISO_DATE.test(trimmed)) {
        return trimmed;
    }
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime()))
        return null;
    return formatIsoDateLocal(parsed);
}
function filterEntriesByDateRange(entries, range) {
    return entries.filter((entry) => {
        const created = entryCreatedAtIsoDate(entry);
        if (!created)
            return false;
        return created >= range.dateFrom && created <= range.dateTo;
    });
}
function paginatePresentedEntries(entries, page, limit) {
    const safePage = Math.max(1, Math.floor(page));
    const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
    const total = entries.length;
    const totalPages = total > 0 ? Math.ceil(total / safeLimit) : 0;
    const start = (safePage - 1) * safeLimit;
    const paged = entries.slice(start, start + safeLimit);
    return {
        entries: paged,
        total,
        page: safePage,
        limit: safeLimit,
        totalPages,
    };
}
exports.TABLE_HISTORY_MAX_SCAN_ROWS = 500;
function dedupeEntriesByStaffCallId(entries) {
    const seen = new Set();
    const out = [];
    for (const entry of entries) {
        if (seen.has(entry.staffCallId))
            continue;
        seen.add(entry.staffCallId);
        out.push(entry);
    }
    return out;
}
function buildTableHistoryListResult(input) {
    const unique = dedupeEntriesByStaffCallId(input.entries);
    const paged = paginatePresentedEntries(unique, input.page, input.limit);
    return {
        staffJobRole: input.role,
        channel: input.channel,
        scope: input.scope,
        entries: paged.entries,
        total: paged.total,
        page: paged.page,
        limit: paged.limit,
        totalPages: paged.totalPages,
        capabilities: input.capabilities,
        filters: {
            dateFrom: input.dateRange.dateFrom,
            dateTo: input.dateRange.dateTo,
        },
    };
}
//# sourceMappingURL=staff-table-history-filters.util.js.map