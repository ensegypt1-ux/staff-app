"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pickForwardHeaders = pickForwardHeaders;
const FORWARD_HEADER_NAMES = [
    'authorization',
    'accept-language',
    'content-type',
    'x-request-id',
];
function pickForwardHeaders(req) {
    const headers = {};
    for (const name of FORWARD_HEADER_NAMES) {
        const value = req.headers[name];
        if (typeof value === 'string' && value.length > 0) {
            headers[name] = value;
        }
    }
    return headers;
}
//# sourceMappingURL=forward-headers.util.js.map