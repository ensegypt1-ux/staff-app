import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { Pool } from 'pg';
import { requireAuthIdentity } from '../../common/utils/jwt-payload.util';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { StaffOrdersFlowService } from '../staff/staff-orders-flow.service';
import { FCM_COVERAGE_CHANNEL } from './fcm.constants';
import {
  RefreshFcmDeviceDto,
  RegisterFcmDeviceDto,
  UnregisterFcmDeviceDto,
} from './dto/fcm-device.dto';

@Injectable()
export class FcmDeviceService {
  private readonly logger = new Logger(FcmDeviceService.name);
  private notifyPool: Pool | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersFlow: StaffOrdersFlowService,
    private readonly config: ConfigService,
  ) {}

  private assertDb(): void {
    if (!this.prisma.isConnected) {
      throw new ServiceUnavailableException({
        error: 'FCM device storage unavailable',
        errorAr: 'تخزين أجهزة الإشعارات غير متاح',
        code: 'FCM_DB_UNAVAILABLE',
      });
    }
  }

  private async notifyCoverageChanged(menuId: number): Promise<void> {
    const url = this.config.get<string>('databaseUrl');
    if (!url) return;
    try {
      if (!this.notifyPool) {
        this.notifyPool = new Pool({ connectionString: url, max: 2 });
      }
      await this.notifyPool.query(
        `SELECT pg_notify($1, $2)`,
        [FCM_COVERAGE_CHANNEL, String(menuId)],
      );
    } catch (err) {
      this.logger.debug(`NOTIFY failed: ${String(err)}`);
    }
  }

  async register(req: Request, dto: RegisterFcmDeviceDto) {
    this.assertDb();
    const identity = requireAuthIdentity(req);
    const staffId = identity.userId;
    const menuId = this.ordersFlow.resolveMenuId(req);
    if (!menuId) {
      throw new ForbiddenException({
        error: 'Menu scope required',
        code: 'MENU_REQUIRED',
      });
    }

    const auth = await this.ordersFlow.resolveStaffAuth(req);
    if (!auth.permissions.includes('orders:view')) {
      throw new ForbiddenException({
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

  async refresh(req: Request, dto: RefreshFcmDeviceDto) {
    this.assertDb();
    const identity = requireAuthIdentity(req);
    const staffId = identity.userId;
    const menuId = this.ordersFlow.resolveMenuId(req);

    const existing = await this.prisma.staffFcmDevice.findUnique({
      where: { fcmToken: dto.oldToken },
    });
    if (!existing || existing.staffId !== staffId) {
      throw new ForbiddenException({
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

  async unregister(req: Request, dto: UnregisterFcmDeviceDto) {
    this.assertDb();
    const identity = requireAuthIdentity(req);
    const staffId = identity.userId;

    if (!dto.token && !dto.deviceId) {
      throw new BadRequestException({
        error: 'token or deviceId required',
        code: 'FCM_UNREGISTER_INVALID',
      });
    }

    const where = dto.token
      ? { fcmToken: dto.token, staffId }
      : { deviceId: dto.deviceId!, staffId };

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

  async listDistinctMenuIds(): Promise<number[]> {
    this.assertDb();
    const rows = await this.prisma.staffFcmDevice.findMany({
      select: { menuId: true },
      distinct: ['menuId'],
    });
    return rows.map((r) => r.menuId);
  }

  async pickRelayIdentity(menuId: number): Promise<{
    staffId: number;
    staffRoleId: number;
  } | null> {
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

  async deleteByToken(fcmToken: string): Promise<void> {
    if (!this.prisma.isConnected) return;
    const existing = await this.prisma.staffFcmDevice.findUnique({
      where: { fcmToken },
    });
    if (!existing) return;
    await this.prisma.staffFcmDevice.delete({ where: { fcmToken } });
    await this.notifyCoverageChanged(existing.menuId);
  }
}
