"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STAFF_JOB_ROLE_HEADER = exports.STAFF_ORDER_ENRICHMENT_HEADER = exports.STAFF_ORDER_PRESENTER_VERSION = exports.STAFF_ORDER_PRESENTER_HEADER = void 0;
exports.sendProxyResponse = sendProxyResponse;
exports.STAFF_ORDER_PRESENTER_HEADER = 'X-Staff-Order-Presenter';
exports.STAFF_ORDER_PRESENTER_VERSION = 'v1';
exports.STAFF_ORDER_ENRICHMENT_HEADER = 'X-Staff-Order-Enrichment';
exports.STAFF_JOB_ROLE_HEADER = 'X-Staff-Job-Role';
function sendProxyResponse(res, result, assetUrlService, extraHeaders) {
    if (extraHeaders) {
        for (const [key, value] of Object.entries(extraHeaders)) {
            res.setHeader(key, value);
        }
    }
    const body = assetUrlService.rewriteDeep(result.data);
    res.status(result.status).json(body);
}
//# sourceMappingURL=proxy-response.util.js.map