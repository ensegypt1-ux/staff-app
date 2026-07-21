"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isMenuAccessAuthorizationSoft404 = isMenuAccessAuthorizationSoft404;
exports.isFinishConflictOrMenuUpstreamError = isFinishConflictOrMenuUpstreamError;
exports.isPostFinishHistoryPresentationFailure = isPostFinishHistoryPresentationFailure;
exports.normalizeStaffUpstreamError = normalizeStaffUpstreamError;
exports.deniedOrderResult = deniedOrderResult;
exports.staffHistoryDeniedResult = staffHistoryDeniedResult;
exports.staffScopeDeniedResult = staffScopeDeniedResult;
exports.logUpstreamDenial = logUpstreamDenial;
exports.rejectUpstreamListResult = rejectUpstreamListResult;
const NOT_EDITABLE_MARKERS = [
    'not editable',
    'tablecallnoteditable',
    'not_editable',
];
const NOT_PENDING_MARKERS = [
    'not pending',
    'not found or not pending',
    'callnotfoundornotpending',
];
const MENU_ACCESS_SOFT_404_MARKERS = [
    'menu not found',
    'المنيو غير موجود',
];
const GENUINE_NOT_FOUND_CODES = new Set([
    'ORDER_NOT_FOUND',
    'ACTIVITY_LOG_NOT_FOUND',
    'STAFF_CALL_NOT_FOUND',
]);
function isMenuAccessAuthorizationSoft404(result) {
    if (result.status !== 404)
        return false;
    const data = result.data;
    if (!data || typeof data !== 'object')
        return false;
    const body = data;
    const code = String(body.code ?? '').trim().toUpperCase();
    if (GENUINE_NOT_FOUND_CODES.has(code)) {
        return false;
    }
    const haystack = [body.error, body.errorEn, body.errorAr, body.message]
        .map((value) => String(value ?? '').trim().toLowerCase())
        .filter((value) => value.length > 0)
        .join(' | ');
    if (!haystack)
        return false;
    return MENU_ACCESS_SOFT_404_MARKERS.some((marker) => haystack.includes(marker.toLowerCase()));
}
function isFinishConflictOrMenuUpstreamError(result) {
    if (result.status === 409)
        return true;
    if (isMenuAccessAuthorizationSoft404(result))
        return true;
    const data = result.data;
    if (!data || typeof data !== 'object')
        return false;
    const body = data;
    const code = String(body.code ?? '')
        .trim()
        .toUpperCase();
    if (code === 'MENU_ACCESS_SOFT_404' || code === 'STAFF_ORDER_STATE_CHANGED') {
        return true;
    }
    const haystack = [body.error, body.errorEn, body.errorAr, body.message]
        .map((value) => String(value ?? '').trim().toLowerCase())
        .filter((value) => value.length > 0)
        .join(' | ');
    if (MENU_ACCESS_SOFT_404_MARKERS.some((marker) => haystack.includes(marker.toLowerCase()))) {
        return true;
    }
    if (NOT_PENDING_MARKERS.some((marker) => haystack.includes(marker))) {
        return true;
    }
    return false;
}
function isPostFinishHistoryPresentationFailure(result) {
    if (result.status !== 404)
        return false;
    const data = result.data;
    if (!data || typeof data !== 'object')
        return false;
    const body = data;
    const code = String(body.code ?? '')
        .trim()
        .toUpperCase();
    if (code === 'ORDER_NOT_FOUND')
        return true;
    const haystack = [body.error, body.errorEn, body.errorAr, body.message]
        .map((value) => String(value ?? '').trim().toLowerCase())
        .filter((value) => value.length > 0)
        .join(' | ');
    return (haystack.includes('order not found') ||
        haystack.includes('الطلب غير موجود'));
}
function normalizeStaffUpstreamError(result) {
    if (result.status < 400)
        return result;
    const data = result.data;
    if (!data || typeof data !== 'object') {
        return result;
    }
    const body = data;
    const code = String(body.code ?? '').trim();
    const message = String(body.error ?? body.message ?? '')
        .trim()
        .toLowerCase();
    const messageAr = String(body.errorAr ?? '').trim();
    if (code === 'PRO_REQUIRED' || message.includes('pro')) {
        return {
            status: result.status,
            data: {
                error: 'Table orders require an active Pro plan',
                errorAr: 'طلبات الطاولات تتطلب خطة Pro نشطة',
                code: 'STAFF_PRO_REQUIRED',
            },
        };
    }
    if (code === 'STAFF_ACTION_DENIED' ||
        code === 'STAFF_DELIVERY_DENIED' ||
        code === 'ORDER_NOT_FOUND' ||
        code === 'INVALID_ORDER' ||
        code === 'STAFF_ITEMS_NOT_EDITABLE') {
        return result;
    }
    if (NOT_EDITABLE_MARKERS.some((marker) => message.includes(marker))) {
        return {
            status: 409,
            data: {
                error: 'Order items cannot be edited in the current status',
                errorAr: 'لا يمكن تعديل أصناف الطلب في هذه الحالة',
                code: 'STAFF_ITEMS_NOT_EDITABLE',
            },
        };
    }
    if (NOT_PENDING_MARKERS.some((marker) => message.includes(marker))) {
        return {
            status: 409,
            data: {
                error: 'This order action is no longer available',
                errorAr: 'هذا الإجراء لم يعد متاحاً على الطلب',
                code: 'STAFF_ORDER_STATE_CHANGED',
            },
        };
    }
    if (isMenuAccessAuthorizationSoft404(result)) {
        return {
            status: 404,
            data: {
                error: String(body.error ?? body.errorEn ?? 'Menu not found'),
                errorAr: String(body.errorAr ?? 'المنيو غير موجود'),
                code: 'MENU_ACCESS_SOFT_404',
            },
        };
    }
    if (result.status === 404) {
        return {
            status: 404,
            data: {
                error: 'Order not found',
                errorAr: 'الطلب غير موجود',
                code: 'ORDER_NOT_FOUND',
            },
        };
    }
    if (messageAr) {
        return result;
    }
    return result;
}
function deniedOrderResult(httpStatus, payload) {
    return { status: httpStatus, data: payload };
}
function staffHistoryDeniedResult() {
    return {
        status: 403,
        data: {
            error: 'Order history is not available for your staff role',
            errorAr: 'سجل الطلبات غير متاح لدورك الوظيفي',
            code: 'STAFF_HISTORY_DENIED',
        },
    };
}
function staffScopeDeniedResult(scope) {
    return {
        status: 403,
        data: {
            error: `Order scope "${scope}" is not available`,
            errorAr: 'نطاق الطلبات المطلوب غير متاح',
            code: 'STAFF_SCOPE_DENIED',
        },
    };
}
function logUpstreamDenial(logger, context, upstream) {
    const body = upstream.data && typeof upstream.data === 'object'
        ? upstream.data
        : {};
    const error = String(body.error ?? body.message ?? 'upstream error');
    const errorAr = String(body.errorAr ?? '');
    const code = String(body.code ?? '');
    logger.warn(`[upstream-denied] ${context} -> ${upstream.status}` +
        (code ? ` code=${code}` : '') +
        ` error=${error}` +
        (errorAr ? ` errorAr=${errorAr}` : ''));
}
function rejectUpstreamListResult(logger, context, upstream) {
    if (upstream.status < 400) {
        return upstream;
    }
    logUpstreamDenial(logger, context, upstream);
    return normalizeStaffUpstreamError(upstream);
}
//# sourceMappingURL=staff-order-errors.util.js.map