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
exports.FcmHealthController = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const public_decorator_1 = require("../../common/decorators/public.decorator");
const throttle_decorators_1 = require("../../common/decorators/throttle.decorators");
const fcm_sender_service_1 = require("./fcm-sender.service");
const menu_socket_supervisor_1 = require("./menu-socket.supervisor");
let FcmHealthController = class FcmHealthController {
    constructor(config, supervisor, sender) {
        this.config = config;
        this.supervisor = supervisor;
        this.sender = sender;
    }
    health() {
        if (!this.config.get('isWorkerRole')) {
            return {
                enabled: false,
                role: this.config.get('processRole'),
                message: 'FCM health is served by the Worker process',
            };
        }
        const enabled = this.config.get('fcmEnabled') === true;
        const uncovered = this.supervisor.uncoveredMenus;
        const uncoveredSinceLimit = this.config.get('fcmUncoveredReadyMs') ?? 180_000;
        const body = {
            enabled,
            role: this.config.get('processRole'),
            firebaseReady: this.sender.isFirebaseReady,
            dryRun: this.config.get('fcmDryRun') === true,
            desiredMenus: this.supervisor.desiredMenus,
            joinedMenus: this.supervisor.joinedMenus,
            uncoveredMenus: uncovered,
            reconnectsTotal: this.supervisor.reconnectsTotal,
            pushSentTotal: this.sender.sentTotal,
            pushDedupedTotal: this.sender.dedupedTotal,
            pushInvalidTokenTotal: this.sender.invalidTokenTotal,
        };
        if (enabled &&
            uncovered.length > 0 &&
            this.supervisor.desiredMenus > 0 &&
            this.supervisor.joinedMenus === 0) {
            throw new common_1.ServiceUnavailableException({
                ...body,
                code: 'FCM_RELAYS_UNCOVERED',
                uncoveredReadyMs: uncoveredSinceLimit,
            });
        }
        return body;
    }
};
exports.FcmHealthController = FcmHealthController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, throttle_decorators_1.HealthThrottle)(),
    (0, common_1.Get)('fcm'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], FcmHealthController.prototype, "health", null);
exports.FcmHealthController = FcmHealthController = __decorate([
    (0, common_1.Controller)('health'),
    __metadata("design:paramtypes", [config_1.ConfigService,
        menu_socket_supervisor_1.MenuSocketSupervisor,
        fcm_sender_service_1.FcmSenderService])
], FcmHealthController);
//# sourceMappingURL=fcm-health.controller.js.map