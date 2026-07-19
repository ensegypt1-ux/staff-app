"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StaffOnlyGuard = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const public_decorator_1 = require("../decorators/public.decorator");
const auth_identity_1 = require("../types/auth-identity");
const jwt_payload_util_1 = require("../utils/jwt-payload.util");
let StaffOnlyGuard = class StaffOnlyGuard {
    constructor(reflector) {
        this.reflector = reflector;
    }
    canActivate(context) {
        const isPublic = this.reflector.getAllAndOverride(public_decorator_1.IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (isPublic)
            return true;
        const request = context.switchToHttp().getRequest();
        const identity = (0, jwt_payload_util_1.getAuthIdentity)(request);
        if (!identity) {
            throw new common_1.UnauthorizedException({
                error: 'Authentication required',
                errorAr: 'مطلوب تسجيل الدخول',
                code: 'AUTH_REQUIRED',
            });
        }
        if (!(0, auth_identity_1.isStaffRole)(identity.role)) {
            throw new common_1.ForbiddenException({
                error: 'Staff authentication required',
                errorAr: 'مطلوب تسجيل دخول الموظف',
                code: 'STAFF_AUTH_REQUIRED',
            });
        }
        return true;
    }
};
exports.StaffOnlyGuard = StaffOnlyGuard;
exports.StaffOnlyGuard = StaffOnlyGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector])
], StaffOnlyGuard);
//# sourceMappingURL=staff-only.guard.js.map