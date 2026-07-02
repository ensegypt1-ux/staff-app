"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const core_1 = require("@nestjs/core");
const configuration_1 = require("./config/configuration");
const env_validation_1 = require("./config/env.validation");
const upstream_exception_filter_1 = require("./common/filters/upstream-exception.filter");
const jwt_auth_guard_1 = require("./common/guards/jwt-auth.guard");
const ens_backend_module_1 = require("./infrastructure/ens-backend/ens-backend.module");
const health_module_1 = require("./modules/health/health.module");
const staff_module_1 = require("./modules/staff/staff.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                load: [configuration_1.default],
                validate: env_validation_1.validateEnv,
            }),
            ens_backend_module_1.EnsBackendModule,
            health_module_1.HealthModule,
            staff_module_1.StaffModule,
        ],
        providers: [
            {
                provide: core_1.APP_GUARD,
                useClass: jwt_auth_guard_1.JwtAuthGuard,
            },
            {
                provide: core_1.APP_FILTER,
                useClass: upstream_exception_filter_1.UpstreamExceptionFilter,
            },
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map