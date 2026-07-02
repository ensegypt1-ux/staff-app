"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeStaffJobRole = normalizeStaffJobRole;
exports.staffJobRoleFromRequest = staffJobRoleFromRequest;
const jsonwebtoken_1 = require("jsonwebtoken");
function normalizeStaffJobRole(raw) {
    const value = String(raw ?? '')
        .trim()
        .toLowerCase();
    if (value === 'cashier' || value === 'casher')
        return 'cashier';
    if (value === 'waiter')
        return 'waiter';
    return 'unknown';
}
function staffJobRoleFromRequest(req) {
    const authorization = req.headers.authorization;
    if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
        return 'unknown';
    }
    const token = authorization.slice('Bearer '.length).trim();
    if (!token)
        return 'unknown';
    const decoded = (0, jsonwebtoken_1.decode)(token);
    if (!decoded || typeof decoded !== 'object')
        return 'unknown';
    const role = normalizeStaffJobRole(decoded.staffJobRole);
    return role === 'unknown' ? 'waiter' : role;
}
//# sourceMappingURL=staff-job-role.util.js.map