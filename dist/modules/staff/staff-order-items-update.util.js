"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isUpstreamItemsNotEditable = isUpstreamItemsNotEditable;
exports.shouldRetryPreparedItemsWithPut = shouldRetryPreparedItemsWithPut;
const NOT_EDITABLE_MARKERS = [
    'not editable',
    'tablecallnoteditable',
    'not_editable',
    'لا يمكن تعديل',
    'لم يعد يقبل تعديل',
];
function isUpstreamItemsNotEditable(result) {
    if (result.status !== 409)
        return false;
    const data = result.data;
    if (!data || typeof data !== 'object')
        return false;
    const body = data;
    const code = String(body.code ?? '').trim().toLowerCase();
    if (code === 'staff_items_not_editable')
        return true;
    const message = String(body.error ?? body.message ?? '')
        .trim()
        .toLowerCase();
    const messageAr = String(body.errorAr ?? '').trim();
    return (NOT_EDITABLE_MARKERS.some((marker) => message.includes(marker) || messageAr.includes(marker)) || code.includes('not_editable'));
}
function shouldRetryPreparedItemsWithPut(status, patchResult) {
    return status === 'prepared' && isUpstreamItemsNotEditable(patchResult);
}
//# sourceMappingURL=staff-order-items-update.util.js.map