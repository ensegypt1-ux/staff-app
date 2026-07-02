"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StaffModule = void 0;
const common_1 = require("@nestjs/common");
const staff_controller_1 = require("./staff.controller");
const staff_order_presenter_service_1 = require("./staff-order-presenter.service");
const staff_orders_flow_service_1 = require("./staff-orders-flow.service");
const staff_table_order_creator_registry_1 = require("./staff-table-order-creator.registry");
let StaffModule = class StaffModule {
};
exports.StaffModule = StaffModule;
exports.StaffModule = StaffModule = __decorate([
    (0, common_1.Module)({
        controllers: [staff_controller_1.StaffController],
        providers: [
            staff_order_presenter_service_1.StaffOrderPresenterService,
            staff_orders_flow_service_1.StaffOrdersFlowService,
            staff_table_order_creator_registry_1.StaffTableOrderCreatorRegistry,
        ],
    })
], StaffModule);
//# sourceMappingURL=staff.module.js.map