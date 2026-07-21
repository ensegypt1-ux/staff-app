import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { StaffOrdersFlowService } from '../staff/staff-orders-flow.service';
import { RefreshFcmDeviceDto, RegisterFcmDeviceDto, UnregisterFcmDeviceDto } from './dto/fcm-device.dto';
export declare class FcmDeviceService {
    private readonly prisma;
    private readonly ordersFlow;
    private readonly config;
    private readonly logger;
    private notifyPool;
    constructor(prisma: PrismaService, ordersFlow: StaffOrdersFlowService, config: ConfigService);
    private assertDb;
    private notifyCoverageChanged;
    register(req: Request, dto: RegisterFcmDeviceDto): Promise<{
        ok: boolean;
        id: string;
        menuId: number;
        platform: string;
    }>;
    refresh(req: Request, dto: RefreshFcmDeviceDto): Promise<{
        ok: boolean;
        id: string;
    }>;
    unregister(req: Request, dto: UnregisterFcmDeviceDto): Promise<{
        ok: boolean;
        deleted: number;
    }>;
    listDistinctMenuIds(): Promise<number[]>;
    pickRelayIdentity(menuId: number): Promise<{
        staffId: number;
        staffRoleId: number;
    } | null>;
    deleteByToken(fcmToken: string): Promise<void>;
}
