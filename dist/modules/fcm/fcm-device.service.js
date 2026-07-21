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
var FcmDeviceService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FcmDeviceService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const pg_1 = require("pg");
const jwt_payload_util_1 = require("../../common/utils/jwt-payload.util");
const prisma_service_1 = require("../../infrastructure/prisma/prisma.service");
const staff_orders_flow_service_1 = require("../staff/staff-orders-flow.service");
const fcm_constants_1 = require("./fcm.constants");
let FcmDeviceService = FcmDeviceService_1 = class FcmDeviceService {
    constructor(prisma, ordersFlow, config) {
        this.prisma = prisma;
        this.ordersFlow = ordersFlow;
        this.config = config;
        this.logger = new common_1.Logger(FcmDeviceService_1.name);
        this.notifyPool = null;
    }
    assertDb() {
        if (!this.prisma.isConnected) {
            throw new common_1.ServiceUnavailableException({
                error: 'FCM device storage unavailable',
                errorAr: 'تخزين أجهزة الإشعارات غير متاح',
                code: 'FCM_DB_UNAVAILABLE',
            });
        }
    }
    async notifyCoverageChanged(menuId) {
        const url = this.config.get('databaseUrl');
        if (!url)
            return;
        try {
            if (!this.notifyPool) {
                this.notifyPool = new pg_1.Pool({ connectionString: url, max: 2 });
            }
            await this.notifyPool.query(`SELECT pg_notify($1, $2)`, [fcm_constants_1.FCM_COVERAGE_CHANNEL, String(menuId)]);
        }
        catch (err) {
            this.logger.debug(`NOTIFY failed: ${String(err)}`);
        }
    }
    async register(req, dto) {
        this.assertDb();
        const identity = (0, jwt_payload_util_1.requireAuthIdentity)(req);
        const staffId = identity.userId;
        const menuId = this.ordersFlow.resolveMenuId(req);
        if (!menuId) {
            throw new common_1.ForbiddenException({
                error: 'Menu scope required',
                code: 'MENU_REQUIRED',
            });
        }
        const auth = await this.ordersFlow.resolveStaffAuth(req);
        if (!auth.permissions.includes('orders:view')) {
            throw new common_1.ForbiddenException({
                error: 'orders:view required to register for push',
                code: 'FORBIDDEN',
            });
        }
        const now = new Date();
        const device = await this.prisma.staffFcmDevice.upsert({
            where: { fcmToken: dto.token },
            create: {
                staffId,
                menuId,
                staffRoleId: auth.roleId ?? identity.staffRoleId ?? null,
                fcmToken: dto.token,
                platform: dto.platform,
                deviceId: dto.deviceId?.trim() || null,
                permissionsJson: JSON.stringify(auth.permissions),
                appVersion: dto.appVersion?.trim() || null,
                locale: dto.locale?.trim() || null,
                lastSeenAt: now,
            },
            update: {
                staffId,
                menuId,
                staffRoleId: auth.roleId ?? identity.staffRoleId ?? null,
                platform: dto.platform,
                deviceId: dto.deviceId?.trim() || null,
                permissionsJson: JSON.stringify(auth.permissions),
                appVersion: dto.appVersion?.trim() || null,
                locale: dto.locale?.trim() || null,
                lastSeenAt: now,
            },
        });
        await this.notifyCoverageChanged(menuId);
        return {
            ok: true,
            id: device.id,
            menuId: device.menuId,
            platform: device.platform,
        };
    }
    async refresh(req, dto) {
        this.assertDb();
        const identity = (0, jwt_payload_util_1.requireAuthIdentity)(req);
        const staffId = identity.userId;
        const menuId = this.ordersFlow.resolveMenuId(req);
        const existing = await this.prisma.staffFcmDevice.findUnique({
            where: { fcmToken: dto.oldToken },
        });
        if (!existing || existing.staffId !== staffId) {
            throw new common_1.ForbiddenException({
                error: 'Token not owned by this staff',
                code: 'FCM_TOKEN_FORBIDDEN',
            });
        }
        const auth = await this.ordersFlow.resolveStaffAuth(req);
        const now = new Date();
        if (dto.oldToken === dto.newToken) {
            const updated = await this.prisma.staffFcmDevice.update({
                where: { fcmToken: dto.oldToken },
                data: {
                    platform: dto.platform,
                    deviceId: dto.deviceId?.trim() || existing.deviceId,
                    permissionsJson: JSON.stringify(auth.permissions),
                    staffRoleId: auth.roleId ?? existing.staffRoleId,
                    menuId: menuId || existing.menuId,
                    lastSeenAt: now,
                },
            });
            await this.notifyCoverageChanged(updated.menuId);
            return { ok: true, id: updated.id };
        }
        const device = await this.prisma.$transaction(async (tx) => {
            await tx.staffFcmDevice.delete({ where: { fcmToken: dto.oldToken } });
            return tx.staffFcmDevice.upsert({
                where: { fcmToken: dto.newToken },
                create: {
                    staffId,
                    menuId: menuId || existing.menuId,
                    staffRoleId: auth.roleId ?? existing.staffRoleId,
                    fcmToken: dto.newToken,
                    platform: dto.platform,
                    deviceId: dto.deviceId?.trim() || existing.deviceId,
                    permissionsJson: JSON.stringify(auth.permissions),
                    appVersion: existing.appVersion,
                    locale: existing.locale,
                    lastSeenAt: now,
                },
                update: {
                    staffId,
                    menuId: menuId || existing.menuId,
                    staffRoleId: auth.roleId ?? existing.staffRoleId,
                    platform: dto.platform,
                    deviceId: dto.deviceId?.trim() || existing.deviceId,
                    permissionsJson: JSON.stringify(auth.permissions),
                    lastSeenAt: now,
                },
            });
        });
        await this.notifyCoverageChanged(device.menuId);
        return { ok: true, id: device.id };
    }
    async unregister(req, dto) {
        this.assertDb();
        const identity = (0, jwt_payload_util_1.requireAuthIdentity)(req);
        const staffId = identity.userId;
        if (!dto.token && !dto.deviceId) {
            throw new common_1.BadRequestException({
                error: 'token or deviceId required',
                code: 'FCM_UNREGISTER_INVALID',
            });
        }
        const where = dto.token
            ? { fcmToken: dto.token, staffId }
            : { deviceId: dto.deviceId, staffId };
        const rows = await this.prisma.staffFcmDevice.findMany({ where });
        if (rows.length === 0) {
            return { ok: true, deleted: 0 };
        }
        await this.prisma.staffFcmDevice.deleteMany({ where });
        const menuIds = [...new Set(rows.map((r) => r.menuId))];
        for (const menuId of menuIds) {
            await this.notifyCoverageChanged(menuId);
        }
        return { ok: true, deleted: rows.length };
    }
    async listDistinctMenuIds() {
        this.assertDb();
        const rows = await this.prisma.staffFcmDevice.findMany({
            select: { menuId: true },
            distinct: ['menuId'],
        });
        return rows.map((r) => r.menuId);
    }
    async pickRelayIdentity(menuId) {
        const devices = await this.prisma.staffFcmDevice.findMany({
            where: { menuId },
            orderBy: { lastSeenAt: 'desc' },
            take: 20,
        });
        for (const d of devices) {
            if (d.staffRoleId != null && d.staffRoleId > 0) {
                return { staffId: d.staffId, staffRoleId: d.staffRoleId };
            }
        }
        return null;
    }
    async deleteByToken(fcmToken) {
        if (!this.prisma.isConnected)
            return;
        const existing = await this.prisma.staffFcmDevice.findUnique({
            where: { fcmToken },
        });
        if (!existing)
            return;
        await this.prisma.staffFcmDevice.delete({ where: { fcmToken } });
        await this.notifyCoverageChanged(existing.menuId);
    }
};
exports.FcmDeviceService = FcmDeviceService;
exports.FcmDeviceService = FcmDeviceService = FcmDeviceService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        staff_orders_flow_service_1.StaffOrdersFlowService,
        config_1.ConfigService])
], FcmDeviceService);
//# sourceMappingURL=fcm-device.service.js.map