"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveStaffMenuId = resolveStaffMenuId;
const common_1 = require("@nestjs/common");
const jwt_payload_util_1 = require("../../common/utils/jwt-payload.util");
function resolveStaffMenuId(req, query, body) {
    const identity = (0, jwt_payload_util_1.requireAuthIdentity)(req);
    const scoped = identity.menuId;
    const clientRaw = body?.menuId ?? query?.menuId;
    const client = clientRaw != null && String(clientRaw).trim() !== ''
        ? Number(clientRaw)
        : 0;
    const clientValid = Number.isFinite(client) && client > 0 ? client : 0;
    if (scoped == null || scoped <= 0) {
        throw new common_1.ForbiddenException({
            error: 'Staff session is missing menu scope — please sign in again',
            errorAr: 'جلسة الموظف بدون صلاحية قائمة — يرجى تسجيل الدخول مجدداً',
            code: 'STAFF_MENU_SCOPE_REQUIRED',
        });
    }
    if (clientValid > 0 && clientValid !== scoped) {
        throw new common_1.ForbiddenException({
            error: 'Menu access denied for this staff session',
            errorAr: 'غير مسموح بالوصول إلى هذه القائمة لهذا الموظف',
            code: 'STAFF_MENU_SCOPE_MISMATCH',
        });
    }
    return scoped;
}
//# sourceMappingURL=staff-menu-scope.util.js.map