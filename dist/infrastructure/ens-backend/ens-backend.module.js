"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnsBackendModule = void 0;
const axios_1 = require("@nestjs/axios");
const common_1 = require("@nestjs/common");
const api_key_service_1 = require("./api-key.service");
const ens_http_service_1 = require("./ens-http.service");
const upstream_clock_service_1 = require("./upstream-clock.service");
const asset_url_service_1 = require("../storage/asset-url.service");
let EnsBackendModule = class EnsBackendModule {
};
exports.EnsBackendModule = EnsBackendModule;
exports.EnsBackendModule = EnsBackendModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [axios_1.HttpModule.register({ maxRedirects: 0 })],
        providers: [
            upstream_clock_service_1.UpstreamClockService,
            ens_http_service_1.EnsHttpService,
            api_key_service_1.ApiKeyService,
            asset_url_service_1.AssetUrlService,
        ],
        exports: [ens_http_service_1.EnsHttpService, api_key_service_1.ApiKeyService, asset_url_service_1.AssetUrlService, upstream_clock_service_1.UpstreamClockService],
    })
], EnsBackendModule);
//# sourceMappingURL=ens-backend.module.js.map