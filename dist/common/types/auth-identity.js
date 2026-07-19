"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AUTH_IDENTITY_KEY = void 0;
exports.isStaffRole = isStaffRole;
exports.AUTH_IDENTITY_KEY = 'authIdentity';
function isStaffRole(role) {
    return (String(role ?? '')
        .trim()
        .toLowerCase() === 'staff');
}
//# sourceMappingURL=auth-identity.js.map