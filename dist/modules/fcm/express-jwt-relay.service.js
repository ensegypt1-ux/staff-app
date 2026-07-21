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
exports.ExpressJwtRelayService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const jwt = require("jsonwebtoken");
let ExpressJwtRelayService = class ExpressJwtRelayService {
    constructor(config) {
        this.config = config;
    }
    mintStaffJoinToken(claims) {
        const secret = this.config.get('jwtAccessSecret')?.trim();
        if (!secret || secret.length < 32) {
            throw new Error('JWT_ACCESS_SECRET missing or too short for relay mint');
        }
        const payload = {
            id: claims.staffId,
            userId: claims.staffId,
            email: `relay+menu${claims.menuId}@staff-bff.internal`,
            role: 'staff',
            menuId: claims.menuId,
            staffRoleId: claims.staffRoleId,
        };
        return jwt.sign(payload, secret, { algorithm: 'HS256' });
    }
};
exports.ExpressJwtRelayService = ExpressJwtRelayService;
exports.ExpressJwtRelayService = ExpressJwtRelayService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], ExpressJwtRelayService);
//# sourceMappingURL=express-jwt-relay.service.js.map