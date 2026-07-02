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
var UpstreamClockService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpstreamClockService = void 0;
const axios_1 = require("@nestjs/axios");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const rxjs_1 = require("rxjs");
let UpstreamClockService = UpstreamClockService_1 = class UpstreamClockService {
    constructor(httpService, configService) {
        this.httpService = httpService;
        this.configService = configService;
        this.logger = new common_1.Logger(UpstreamClockService_1.name);
        this.skewSeconds = 0;
        this.lastSyncMs = 0;
        this.syncPromise = null;
        this.backendBaseUrl =
            this.configService.get('ensBackendUrl')?.replace(/\/$/, '') ?? '';
    }
    getSkewSeconds() {
        return this.skewSeconds;
    }
    async ensureSynced(force = false) {
        if (!this.backendBaseUrl)
            return;
        const stale = force ||
            this.lastSyncMs === 0 ||
            Date.now() - this.lastSyncMs > UpstreamClockService_1.SYNC_TTL_MS;
        if (!stale)
            return;
        if (this.syncPromise) {
            await this.syncPromise;
            return;
        }
        this.syncPromise = this.syncFromHealth().finally(() => {
            this.syncPromise = null;
        });
        await this.syncPromise;
    }
    async syncFromHealth() {
        const url = `${this.backendBaseUrl}/health`;
        try {
            const response = await (0, rxjs_1.firstValueFrom)(this.httpService.get(url, {
                timeout: 8000,
                validateStatus: () => true,
            }));
            if (response.status >= 400) {
                this.logger.warn(`[clock] health sync failed HTTP ${response.status} from ${url}`);
                return;
            }
            const body = response.data ?? {};
            const fromJson = typeof body.timestamp === 'string'
                ? Date.parse(body.timestamp)
                : Number.NaN;
            const fromHeader = response.headers?.date
                ? Date.parse(String(response.headers.date))
                : Number.NaN;
            const serverMs = Number.isFinite(fromJson)
                ? fromJson
                : Number.isFinite(fromHeader)
                    ? fromHeader
                    : Number.NaN;
            if (!Number.isFinite(serverMs)) {
                this.logger.warn('[clock] health response has no usable timestamp');
                return;
            }
            const localMs = Date.now();
            this.skewSeconds = (serverMs - localMs) / 1000;
            this.lastSyncMs = localMs;
            this.logger.log(`[clock] synced skew=${this.skewSeconds.toFixed(1)}s from ${url}`);
        }
        catch (error) {
            this.logger.warn(`[clock] sync error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
};
exports.UpstreamClockService = UpstreamClockService;
UpstreamClockService.SYNC_TTL_MS = 5 * 60 * 1000;
exports.UpstreamClockService = UpstreamClockService = UpstreamClockService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [axios_1.HttpService,
        config_1.ConfigService])
], UpstreamClockService);
//# sourceMappingURL=upstream-clock.service.js.map