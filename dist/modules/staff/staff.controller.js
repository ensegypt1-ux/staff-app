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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StaffController = void 0;
const common_1 = require("@nestjs/common");
const public_decorator_1 = require("../../common/decorators/public.decorator");
const throttle_decorators_1 = require("../../common/decorators/throttle.decorators");
const proxy_response_util_1 = require("../../common/utils/proxy-response.util");
const ens_http_service_1 = require("../../infrastructure/ens-backend/ens-http.service");
const asset_url_service_1 = require("../../infrastructure/storage/asset-url.service");
const staff_orders_flow_service_1 = require("./staff-orders-flow.service");
let StaffController = class StaffController {
    constructor(ensHttp, assetUrlService, ordersFlow) {
        this.ensHttp = ensHttp;
        this.assetUrlService = assetUrlService;
        this.ordersFlow = ordersFlow;
    }
    health() {
        return { status: 'ok', service: 'ensmenu-staff-bff' };
    }
    async login(req, res, body) {
        const result = await this.ensHttp.proxy({
            method: 'POST',
            path: 'staff-auth/login',
            req,
            body,
        });
        (0, proxy_response_util_1.sendProxyResponse)(res, result, this.assetUrlService);
    }
    async me(req, res) {
        const result = await this.ensHttp.proxy({
            method: 'GET',
            path: 'staff-auth/me',
            req,
        });
        (0, proxy_response_util_1.sendProxyResponse)(res, result, this.assetUrlService);
    }
    async logout(req, res, body) {
        const result = await this.ensHttp.proxy({
            method: 'POST',
            path: 'staff-auth/logout',
            req,
            body: body ?? {},
        });
        (0, proxy_response_util_1.sendProxyResponse)(res, result, this.assetUrlService);
    }
    async capabilities(req, res) {
        const data = await this.ordersFlow.getCapabilities(req);
        (0, proxy_response_util_1.sendProxyResponse)(res, { status: 200, data }, this.assetUrlService, this.presenterHeaders(data.staffJobRole, 'capabilities'));
    }
    async listOrders(req, res, query) {
        const result = await this.ordersFlow.listOrders(req, query);
        if (result.status >= 400) {
            (0, proxy_response_util_1.sendProxyResponse)(res, result, this.assetUrlService);
            return;
        }
        const presented = result.data;
        (0, proxy_response_util_1.sendProxyResponse)(res, { status: 200, data: presented }, this.assetUrlService, this.presenterHeaders(presented.staffJobRole, 'list'));
    }
    async getOrder(req, res, id, query) {
        const staffCallId = Number(id);
        const presented = await this.ordersFlow.getOrder(req, staffCallId, query);
        if (presented.denied) {
            res.status(presented.httpStatus).json(presented.data);
            return;
        }
        (0, proxy_response_util_1.sendProxyResponse)(res, { status: 200, data: presented.data }, this.assetUrlService, this.presenterHeaders(presented.data.staffJobRole, 'detail'));
    }
    async getMenuCatalog(req, res, query) {
        const result = await this.ordersFlow.getMenuCatalog(req, query);
        if (result.status >= 400) {
            (0, proxy_response_util_1.sendProxyResponse)(res, result, this.assetUrlService);
            return;
        }
        (0, proxy_response_util_1.sendProxyResponse)(res, result, this.assetUrlService);
    }
    async listRestaurantTables(req, res) {
        const result = await this.ordersFlow.listRestaurantTables(req);
        if (result.status >= 400) {
            (0, proxy_response_util_1.sendProxyResponse)(res, result, this.assetUrlService);
            return;
        }
        (0, proxy_response_util_1.sendProxyResponse)(res, result, this.assetUrlService);
    }
    async createTableOrder(req, res, body) {
        const result = await this.ordersFlow.createTableOrder(req, body);
        if (result.status >= 400) {
            (0, proxy_response_util_1.sendProxyResponse)(res, result, this.assetUrlService);
            return;
        }
        const data = result.data;
        (0, proxy_response_util_1.sendProxyResponse)(res, { status: 200, data }, this.assetUrlService, this.presenterHeaders(String(data.staffJobRole ?? 'waiter'), 'create'));
    }
    async patchOrderItems(req, res, id, body) {
        const staffCallId = Number(id);
        const menuId = this.ordersFlow.resolveMenuId(req, {}, body);
        const activityLogId = Number(body.activityLogId ?? 0) || undefined;
        const items = body.items;
        const result = await this.ordersFlow.patchOrderItems(req, staffCallId, menuId, items, activityLogId);
        if (result.status >= 400) {
            (0, proxy_response_util_1.sendProxyResponse)(res, result, this.assetUrlService);
            return;
        }
        const data = result.data;
        (0, proxy_response_util_1.sendProxyResponse)(res, { status: 200, data }, this.assetUrlService, this.presenterHeaders(String(data.staffJobRole ?? 'waiter'), 'items'));
    }
    async postOrderAction(req, res, id, body) {
        const staffCallId = Number(id);
        const action = String(body.action ?? '');
        const menuId = this.ordersFlow.resolveMenuId(req, {}, body);
        const activityLogId = Number(body.activityLogId ?? 0) || undefined;
        const result = await this.ordersFlow.postOrderAction(req, staffCallId, action, menuId, activityLogId);
        if (result.status >= 400) {
            (0, proxy_response_util_1.sendProxyResponse)(res, result, this.assetUrlService);
            return;
        }
        const data = result.data;
        (0, proxy_response_util_1.sendProxyResponse)(res, { status: 200, data }, this.assetUrlService, this.presenterHeaders(String(data.staffJobRole ?? 'waiter'), 'action'));
    }
    presenterHeaders(staffJobRole, enrichment) {
        return {
            [proxy_response_util_1.STAFF_ORDER_PRESENTER_HEADER]: proxy_response_util_1.STAFF_ORDER_PRESENTER_VERSION,
            [proxy_response_util_1.STAFF_ORDER_ENRICHMENT_HEADER]: enrichment,
            [proxy_response_util_1.STAFF_JOB_ROLE_HEADER]: staffJobRole,
        };
    }
};
exports.StaffController = StaffController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, throttle_decorators_1.HealthThrottle)(),
    (0, common_1.Get)('health'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], StaffController.prototype, "health", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, throttle_decorators_1.AuthThrottle)(),
    (0, common_1.Post)('auth/login'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], StaffController.prototype, "login", null);
__decorate([
    (0, common_1.Get)('auth/me'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], StaffController.prototype, "me", null);
__decorate([
    (0, common_1.Post)('auth/logout'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], StaffController.prototype, "logout", null);
__decorate([
    (0, common_1.Get)('capabilities'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], StaffController.prototype, "capabilities", null);
__decorate([
    (0, common_1.Get)('orders'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __param(2, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], StaffController.prototype, "listOrders", null);
__decorate([
    (0, common_1.Get)('orders/:id'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __param(2, (0, common_1.Param)('id')),
    __param(3, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, Object]),
    __metadata("design:returntype", Promise)
], StaffController.prototype, "getOrder", null);
__decorate([
    (0, common_1.Get)('menu/catalog'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __param(2, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], StaffController.prototype, "getMenuCatalog", null);
__decorate([
    (0, common_1.Get)('tables'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], StaffController.prototype, "listRestaurantTables", null);
__decorate([
    (0, common_1.Post)('table-orders'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], StaffController.prototype, "createTableOrder", null);
__decorate([
    (0, common_1.Patch)('orders/:id/items'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __param(2, (0, common_1.Param)('id')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, Object]),
    __metadata("design:returntype", Promise)
], StaffController.prototype, "patchOrderItems", null);
__decorate([
    (0, common_1.Post)('orders/:id/actions'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __param(2, (0, common_1.Param)('id')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, Object]),
    __metadata("design:returntype", Promise)
], StaffController.prototype, "postOrderAction", null);
exports.StaffController = StaffController = __decorate([
    (0, common_1.Controller)('staff/v1'),
    __metadata("design:paramtypes", [ens_http_service_1.EnsHttpService,
        asset_url_service_1.AssetUrlService,
        staff_orders_flow_service_1.StaffOrdersFlowService])
], StaffController);
//# sourceMappingURL=staff.controller.js.map