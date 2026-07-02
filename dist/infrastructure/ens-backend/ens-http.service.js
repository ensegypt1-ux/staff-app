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
var EnsHttpService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnsHttpService = void 0;
const axios_1 = require("@nestjs/axios");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_2 = require("axios");
const rxjs_1 = require("rxjs");
const forward_headers_util_1 = require("../../common/utils/forward-headers.util");
const api_key_service_1 = require("./api-key.service");
function isUpstreamTokenExpired(data) {
    if (!data || typeof data !== 'object')
        return false;
    const body = data;
    const en = String(body.error ?? body.errorEn ?? '').toLowerCase();
    const ar = String(body.errorAr ?? '');
    return (body.code === 'TOKEN_EXPIRED' ||
        en.includes('token expired') ||
        ar.includes('انتهت صلاحية الرمز'));
}
let EnsHttpService = EnsHttpService_1 = class EnsHttpService {
    constructor(httpService, configService, apiKeyService) {
        this.httpService = httpService;
        this.configService = configService;
        this.apiKeyService = apiKeyService;
        this.logger = new common_1.Logger(EnsHttpService_1.name);
        const backendUrl = this.configService.get('ensBackendUrl');
        this.apiBaseUrl = `${backendUrl}/api`;
        this.defaultTimeoutMs =
            this.configService.get('upstreamTimeoutMs') ?? 30000;
        this.upstreamDebugLog =
            this.configService.get('upstreamDebugLog') ?? false;
    }
    async onModuleInit() {
        if (this.apiKeyService.isConfigured()) {
            await this.apiKeyService.refreshClock(true);
        }
    }
    buildUrl(path, query) {
        const normalizedPath = path.replace(/^\/+/, '');
        const url = new URL(`${this.apiBaseUrl}/${normalizedPath}`);
        if (query) {
            for (const [key, value] of Object.entries(query)) {
                if (value === undefined || value === null)
                    continue;
                if (Array.isArray(value)) {
                    value.forEach((item) => url.searchParams.append(key, String(item)));
                }
                else {
                    url.searchParams.set(key, String(value));
                }
            }
        }
        return url.toString();
    }
    summarizeUpstreamBody(data) {
        if (!data || typeof data !== 'object') {
            return typeof data === 'string' ? data.slice(0, 200) : '';
        }
        const body = data;
        const parts = [];
        if (body.code != null)
            parts.push(`code=${String(body.code)}`);
        if (body.error != null)
            parts.push(`error=${String(body.error)}`);
        if (body.errorAr != null)
            parts.push(`errorAr=${String(body.errorAr)}`);
        if (parts.length > 0)
            return parts.join(' ');
        try {
            const json = JSON.stringify(data);
            return json.length > 300 ? `${json.slice(0, 300)}...` : json;
        }
        catch {
            return '';
        }
    }
    logUpstream(method, url, status, data, durationMs) {
        if (!this.upstreamDebugLog && status < 400)
            return;
        const summary = this.summarizeUpstreamBody(data);
        const level = status >= 400 ? 'warn' : 'debug';
        const line = `[upstream] ${method} ${url} -> ${status} ${durationMs}ms` +
            (summary ? ` | ${summary}` : '');
        if (level === 'warn') {
            this.logger.warn(line);
        }
        else {
            this.logger.debug(line);
        }
    }
    async attachApiKey(headers, forceClockSync = false) {
        if (!headers['x-api-key'] && this.apiKeyService.isConfigured()) {
            headers['x-api-key'] =
                await this.apiKeyService.generateHeaderValueAsync(forceClockSync);
        }
    }
    async executeRequest(options, headers) {
        const url = this.buildUrl(options.path, options.query);
        const started = Date.now();
        const config = {
            method: options.method,
            url,
            headers,
            timeout: options.timeoutMs ?? this.defaultTimeoutMs,
            validateStatus: () => true,
        };
        if (options.body !== undefined && options.method !== 'GET') {
            config.data = options.body;
            if (!config.headers?.['content-type']) {
                config.headers = {
                    ...config.headers,
                    'content-type': 'application/json',
                };
            }
        }
        try {
            const response = await (0, rxjs_1.firstValueFrom)(this.httpService.request(config));
            const result = {
                status: response.status,
                data: response.data,
            };
            this.logUpstream(String(options.method), url, result.status, result.data, Date.now() - started);
            return result;
        }
        catch (error) {
            if (error instanceof axios_2.AxiosError) {
                if (error.response) {
                    const result = {
                        status: error.response.status,
                        data: error.response.data,
                    };
                    this.logUpstream(String(options.method), url, result.status, result.data, Date.now() - started);
                    return result;
                }
                if (error.code === 'ECONNABORTED') {
                    this.logger.warn(`[upstream] ${options.method} ${url} -> timeout after ${Date.now() - started}ms`);
                    return {
                        status: 504,
                        data: {
                            error: 'Upstream request timed out',
                            errorAr: 'انتهت مهلة الطلب',
                            code: 'UPSTREAM_TIMEOUT',
                        },
                    };
                }
            }
            this.logger.error(`[upstream] ${options.method} ${url} -> unavailable (${error instanceof Error ? error.message : String(error)})`);
            throw new common_1.ServiceUnavailableException({
                error: 'Upstream service unavailable',
                errorAr: 'الخدمة غير متاحة',
                code: 'UPSTREAM_UNAVAILABLE',
            });
        }
    }
    async proxy(options) {
        const headers = {
            ...(options.req ? (0, forward_headers_util_1.pickForwardHeaders)(options.req) : {}),
            ...(options.headers ?? {}),
        };
        await this.attachApiKey(headers);
        let result = await this.executeRequest(options, headers);
        if (result.status === 405 &&
            isUpstreamTokenExpired(result.data) &&
            this.apiKeyService.isConfigured()) {
            this.logger.warn('[upstream] x-api-key rejected as expired — re-syncing clock and retrying once');
            await this.attachApiKey(headers, true);
            result = await this.executeRequest(options, headers);
        }
        return result;
    }
};
exports.EnsHttpService = EnsHttpService;
exports.EnsHttpService = EnsHttpService = EnsHttpService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [axios_1.HttpService,
        config_1.ConfigService,
        api_key_service_1.ApiKeyService])
], EnsHttpService);
//# sourceMappingURL=ens-http.service.js.map