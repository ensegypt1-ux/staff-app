"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var UpstreamExceptionFilter_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpstreamExceptionFilter = void 0;
const common_1 = require("@nestjs/common");
let UpstreamExceptionFilter = UpstreamExceptionFilter_1 = class UpstreamExceptionFilter {
    constructor() {
        this.logger = new common_1.Logger(UpstreamExceptionFilter_1.name);
    }
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        const request = ctx.getRequest();
        if (exception instanceof common_1.HttpException) {
            const status = exception.getStatus();
            const payload = exception.getResponse();
            response.status(status).json(this.normalize(payload, status, request));
            return;
        }
        this.logger.error('Unhandled gateway error', exception);
        response.status(common_1.HttpStatus.INTERNAL_SERVER_ERROR).json({
            statusCode: common_1.HttpStatus.INTERNAL_SERVER_ERROR,
            error: 'Internal gateway error',
            errorAr: 'خطأ داخلي في البوابة',
            code: 'GATEWAY_ERROR',
            requestId: request.headers['x-request-id'],
        });
    }
    normalize(payload, statusCode, request) {
        const requestId = request.headers['x-request-id'];
        if (typeof payload === 'string') {
            return {
                statusCode,
                error: payload,
                requestId,
            };
        }
        const record = payload;
        return {
            statusCode: record.statusCode ?? statusCode,
            error: record.error ?? record.message,
            errorAr: record.errorAr,
            code: record.code,
            requestId,
            ...record,
        };
    }
};
exports.UpstreamExceptionFilter = UpstreamExceptionFilter;
exports.UpstreamExceptionFilter = UpstreamExceptionFilter = UpstreamExceptionFilter_1 = __decorate([
    (0, common_1.Catch)()
], UpstreamExceptionFilter);
//# sourceMappingURL=upstream-exception.filter.js.map