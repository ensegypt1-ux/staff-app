"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeStaffJobRole = normalizeStaffJobRole;
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
//# sourceMappingURL=staff-job-role.util.js.map