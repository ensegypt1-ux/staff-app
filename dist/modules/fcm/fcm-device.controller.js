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
exports.FcmDeviceController = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const throttle_decorators_1 = require("../../common/decorators/throttle.decorators");
const fcm_device_dto_1 = require("./dto/fcm-device.dto");
const fcm_device_service_1 = require("./fcm-device.service");
let FcmDeviceController = class FcmDeviceController {
    constructor(devices, config) {
        this.devices = devices;
        this.config = config;
    }
    assertApiRole() {
        if (!this.config.get('isApiRole')) {
            throw new common_1.ServiceUnavailableException({
                error: 'Device APIs are only served by the API process',
                code: 'FCM_API_ROLE_REQUIRED',
            });
        }
    }
    register(req, body) {
        this.assertApiRole();
        return this.devices.register(req, body);
    }
    refresh(req, body) {
        this.assertApiRole();
        return this.devices.refresh(req, body);
    }
    unregister(req, body) {
        this.assertApiRole();
        return this.devices.unregister(req, body);
    }
};
exports.FcmDeviceController = FcmDeviceController;
__decorate([
    (0, throttle_decorators_1.AuthThrottle)(),
    (0, common_1.Put)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, fcm_device_dto_1.RegisterFcmDeviceDto]),
    __metadata("design:returntype", void 0)
], FcmDeviceController.prototype, "register", null);
__decorate([
    (0, throttle_decorators_1.AuthThrottle)(),
    (0, common_1.Put)('refresh'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, fcm_device_dto_1.RefreshFcmDeviceDto]),
    __metadata("design:returntype", void 0)
], FcmDeviceController.prototype, "refresh", null);
__decorate([
    (0, throttle_decorators_1.AuthThrottle)(),
    (0, common_1.Delete)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, fcm_device_dto_1.UnregisterFcmDeviceDto]),
    __metadata("design:returntype", void 0)
], FcmDeviceController.prototype, "unregister", null);
exports.FcmDeviceController = FcmDeviceController = __decorate([
    (0, common_1.Controller)('staff/v1/devices/fcm'),
    __metadata("design:paramtypes", [fcm_device_service_1.FcmDeviceService,
        config_1.ConfigService])
], FcmDeviceController);
//# sourceMappingURL=fcm-device.controller.js.map