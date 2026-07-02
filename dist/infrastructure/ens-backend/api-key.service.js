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
exports.ApiKeyService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const CryptoJS = require("crypto-js");
const upstream_clock_service_1 = require("./upstream-clock.service");
let ApiKeyService = class ApiKeyService {
    constructor(configService, upstreamClock) {
        this.configService = configService;
        this.upstreamClock = upstreamClock;
        this.secretKey = this.configService.get('secretKey') ?? '';
    }
    isConfigured() {
        return this.secretKey.length > 0;
    }
    async generateHeaderValueAsync(forceClockSync = false) {
        if (!this.secretKey) {
            throw new Error('SECRET_KEY is not configured for upstream x-api-key');
        }
        await this.upstreamClock.ensureSynced(forceClockSync);
        const offsetSec = this.configService.get('apiKeyTimeOffsetSeconds') ?? 0;
        const skewSec = this.upstreamClock.getSkewSeconds();
        const utcTime = parseFloat((Date.now() / 1000 + skewSec + offsetSec).toFixed(3));
        const payload = `${this.secretKey}///${utcTime}`;
        const jsonString = JSON.stringify(payload);
        return CryptoJS.AES.encrypt(jsonString, this.secretKey).toString();
    }
    async refreshClock(force = true) {
        await this.upstreamClock.ensureSynced(force);
    }
};
exports.ApiKeyService = ApiKeyService;
exports.ApiKeyService = ApiKeyService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        upstream_clock_service_1.UpstreamClockService])
], ApiKeyService);
//# sourceMappingURL=api-key.service.js.map