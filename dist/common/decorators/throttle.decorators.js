"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthThrottle = AuthThrottle;
exports.HealthThrottle = HealthThrottle;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
function envInt(name, fallback) {
    const raw = process.env[name];
    if (raw == null || raw === '')
        return fallback;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}
function AuthThrottle() {
    return (0, common_1.applyDecorators)((0, throttler_1.Throttle)({
        default: {
            limit: () => envInt('THROTTLE_AUTH_LIMIT', 20),
            ttl: () => envInt('THROTTLE_AUTH_TTL_MS', 60_000),
        },
    }));
}
function HealthThrottle() {
    return (0, common_1.applyDecorators)((0, throttler_1.Throttle)({
        default: {
            limit: () => envInt('THROTTLE_HEALTH_LIMIT', 60),
            ttl: () => envInt('THROTTLE_HEALTH_TTL_MS', 60_000),
        },
    }));
}
//# sourceMappingURL=throttle.decorators.js.map