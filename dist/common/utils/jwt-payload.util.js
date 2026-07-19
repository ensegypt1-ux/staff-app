"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.coerceUserId = coerceUserId;
exports.verifyAccessToken = verifyAccessToken;
exports.extractBearerToken = extractBearerToken;
exports.attachAuthIdentity = attachAuthIdentity;
exports.getAuthIdentity = getAuthIdentity;
exports.requireAuthIdentity = requireAuthIdentity;
const common_1 = require("@nestjs/common");
const jwt = require("jsonwebtoken");
const auth_identity_1 = require("../types/auth-identity");
function coerceUserId(raw) {
    if (typeof raw === 'number' && Number.isFinite(raw))
        return raw;
    if (typeof raw === 'string' && raw.trim()) {
        const parsed = Number.parseInt(raw, 10);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}
function accessSecret(configService) {
    const secret = configService.get('jwtAccessSecret')?.trim();
    if (!secret || secret.length < 32)
        return null;
    return secret;
}
function payloadToIdentity(payload) {
    const userId = coerceUserId(payload.id ?? payload.userId ?? payload.sub);
    if (userId == null || userId <= 0)
        return null;
    const roleRaw = payload.role ?? payload.userRole;
    const role = typeof roleRaw === 'string' && roleRaw.trim()
        ? roleRaw.trim()
        : 'user';
    const menuId = coerceUserId(payload.menuId) ?? undefined;
    const staffRoleId = coerceUserId(payload.staffRoleId) ?? undefined;
    return Object.freeze({
        userId,
        role,
        ...(menuId != null && menuId > 0 ? { menuId } : {}),
        ...(staffRoleId != null && staffRoleId > 0 ? { staffRoleId } : {}),
    });
}
function verifyAccessToken(token, configService) {
    const secret = accessSecret(configService);
    if (!secret) {
        throw new common_1.UnauthorizedException({
            error: 'Authentication service misconfigured',
            errorAr: 'خدمة المصادقة غير مهيأة',
            code: 'AUTH_MISCONFIGURED',
        });
    }
    let payload;
    try {
        payload = jwt.verify(token, secret, {
            algorithms: ['HS256'],
        });
    }
    catch (err) {
        const name = err && typeof err === 'object' && 'name' in err
            ? String(err.name)
            : '';
        if (name === 'TokenExpiredError') {
            throw new common_1.UnauthorizedException({
                error: 'Token expired',
                errorAr: 'انتهت صلاحية الرمز',
                code: 'TOKEN_EXPIRED',
            });
        }
        throw new common_1.UnauthorizedException({
            error: 'Invalid or expired token',
            errorAr: 'رمز الدخول غير صالح أو منتهي الصلاحية',
            code: 'AUTH_INVALID_TOKEN',
        });
    }
    const identity = payloadToIdentity(payload);
    if (!identity) {
        throw new common_1.UnauthorizedException({
            error: 'Invalid or expired token',
            errorAr: 'رمز الدخول غير صالح أو منتهي الصلاحية',
            code: 'AUTH_INVALID_TOKEN',
        });
    }
    return identity;
}
function extractBearerToken(req) {
    const authorization = req.headers.authorization;
    if (typeof authorization !== 'string' ||
        !authorization.startsWith('Bearer ')) {
        return null;
    }
    const token = authorization.slice('Bearer '.length).trim();
    return token.length > 0 ? token : null;
}
function attachAuthIdentity(req, identity) {
    const existingAuth = Object.getOwnPropertyDescriptor(req, auth_identity_1.AUTH_IDENTITY_KEY);
    if (!existingAuth) {
        Object.defineProperty(req, auth_identity_1.AUTH_IDENTITY_KEY, {
            value: identity,
            writable: false,
            enumerable: true,
            configurable: false,
        });
    }
    const existingUser = Object.getOwnPropertyDescriptor(req, 'user');
    if (!existingUser) {
        Object.defineProperty(req, 'user', {
            value: identity,
            writable: false,
            enumerable: true,
            configurable: false,
        });
    }
}
function getAuthIdentity(req) {
    const fromKey = req
        .authIdentity;
    if (fromKey && typeof fromKey.userId === 'number')
        return fromKey;
    const fromUser = req.user;
    if (fromUser && typeof fromUser.userId === 'number')
        return fromUser;
    return null;
}
function requireAuthIdentity(req) {
    const identity = getAuthIdentity(req);
    if (!identity) {
        throw new common_1.UnauthorizedException({
            error: 'Authentication required',
            errorAr: 'مطلوب تسجيل الدخول',
            code: 'AUTH_REQUIRED',
        });
    }
    return identity;
}
//# sourceMappingURL=jwt-payload.util.js.map