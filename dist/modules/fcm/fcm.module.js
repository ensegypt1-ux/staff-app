"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var FcmModule_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FcmModule = void 0;
const common_1 = require("@nestjs/common");
const staff_core_module_1 = require("../staff/staff-core.module");
const express_jwt_relay_service_1 = require("./express-jwt-relay.service");
const fcm_device_controller_1 = require("./fcm-device.controller");
const fcm_device_service_1 = require("./fcm-device.service");
const fcm_health_controller_1 = require("./fcm-health.controller");
const fcm_sender_service_1 = require("./fcm-sender.service");
const menu_socket_lock_1 = require("./menu-socket.lock");
const menu_socket_supervisor_1 = require("./menu-socket.supervisor");
let FcmModule = FcmModule_1 = class FcmModule {
    static forRoot(options) {
        const controllers = [
            ...(options.enableApi ? [fcm_device_controller_1.FcmDeviceController] : []),
            ...(options.enableWorker ? [fcm_health_controller_1.FcmHealthController] : []),
        ];
        const providers = [
            fcm_device_service_1.FcmDeviceService,
            express_jwt_relay_service_1.ExpressJwtRelayService,
            ...(options.enableWorker
                ? [
                    menu_socket_lock_1.MenuSocketLockService,
                    fcm_sender_service_1.FcmSenderService,
                    menu_socket_supervisor_1.MenuSocketSupervisor,
                ]
                : []),
        ];
        return {
            module: FcmModule_1,
            imports: [staff_core_module_1.StaffCoreModule],
            controllers,
            providers,
            exports: [fcm_device_service_1.FcmDeviceService],
        };
    }
};
exports.FcmModule = FcmModule;
exports.FcmModule = FcmModule = FcmModule_1 = __decorate([
    (0, common_1.Module)({})
], FcmModule);
//# sourceMappingURL=fcm.module.js.map