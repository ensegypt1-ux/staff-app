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
exports.UnregisterFcmDeviceDto = exports.RefreshFcmDeviceDto = exports.RegisterFcmDeviceDto = void 0;
const class_validator_1 = require("class-validator");
class RegisterFcmDeviceDto {
}
exports.RegisterFcmDeviceDto = RegisterFcmDeviceDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(10),
    __metadata("design:type", String)
], RegisterFcmDeviceDto.prototype, "token", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsIn)(['android', 'ios']),
    __metadata("design:type", String)
], RegisterFcmDeviceDto.prototype, "platform", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RegisterFcmDeviceDto.prototype, "deviceId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RegisterFcmDeviceDto.prototype, "appVersion", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RegisterFcmDeviceDto.prototype, "locale", void 0);
class RefreshFcmDeviceDto {
}
exports.RefreshFcmDeviceDto = RefreshFcmDeviceDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(10),
    __metadata("design:type", String)
], RefreshFcmDeviceDto.prototype, "oldToken", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(10),
    __metadata("design:type", String)
], RefreshFcmDeviceDto.prototype, "newToken", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsIn)(['android', 'ios']),
    __metadata("design:type", String)
], RefreshFcmDeviceDto.prototype, "platform", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RefreshFcmDeviceDto.prototype, "deviceId", void 0);
class UnregisterFcmDeviceDto {
}
exports.UnregisterFcmDeviceDto = UnregisterFcmDeviceDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UnregisterFcmDeviceDto.prototype, "token", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UnregisterFcmDeviceDto.prototype, "deviceId", void 0);
//# sourceMappingURL=fcm-device.dto.js.map