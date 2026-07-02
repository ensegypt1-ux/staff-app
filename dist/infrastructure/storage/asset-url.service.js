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
exports.AssetUrlService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
let AssetUrlService = class AssetUrlService {
    constructor(configService) {
        this.configService = configService;
        this.publicBase =
            this.configService.get('assetPublicBaseUrl') ?? '';
        this.backendBase = this.configService.get('ensBackendUrl') ?? '';
    }
    rewriteUrl(value) {
        if (!value || value.startsWith('data:')) {
            return value;
        }
        if (value.startsWith('/uploads/') || value.startsWith('/api/uploads/')) {
            const path = value.startsWith('/api/uploads/')
                ? value.replace('/api/uploads/', '/uploads/')
                : value;
            return `${this.publicBase}${path}`;
        }
        if (/^https?:\/\//i.test(value)) {
            try {
                const url = new URL(value);
                if (url.pathname.includes('/uploads/') &&
                    (url.hostname === 'localhost' ||
                        url.hostname === '127.0.0.1' ||
                        url.origin === this.backendBase ||
                        url.href.startsWith(this.backendBase))) {
                    const uploadPath = url.pathname.includes('/api/uploads/')
                        ? url.pathname.replace('/api/uploads/', '/uploads/')
                        : url.pathname;
                    return `${this.publicBase}${uploadPath}${url.search}`;
                }
            }
            catch {
                return value;
            }
        }
        return value;
    }
    rewriteDeep(input) {
        if (input === null || input === undefined) {
            return input;
        }
        if (typeof input === 'string') {
            if (input.includes('/uploads/') ||
                input.startsWith('http://') ||
                input.startsWith('https://')) {
                return this.rewriteUrl(input);
            }
            return input;
        }
        if (Array.isArray(input)) {
            return input.map((item) => this.rewriteDeep(item));
        }
        if (typeof input === 'object') {
            const record = input;
            const next = {};
            for (const [key, value] of Object.entries(record)) {
                next[key] = this.rewriteDeep(value);
            }
            return next;
        }
        return input;
    }
};
exports.AssetUrlService = AssetUrlService;
exports.AssetUrlService = AssetUrlService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], AssetUrlService);
//# sourceMappingURL=asset-url.service.js.map