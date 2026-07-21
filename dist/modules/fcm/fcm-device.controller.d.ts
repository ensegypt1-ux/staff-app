import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { RefreshFcmDeviceDto, RegisterFcmDeviceDto, UnregisterFcmDeviceDto } from './dto/fcm-device.dto';
import { FcmDeviceService } from './fcm-device.service';
export declare class FcmDeviceController {
    private readonly devices;
    private readonly config;
    constructor(devices: FcmDeviceService, config: ConfigService);
    private assertApiRole;
    register(req: Request, body: RegisterFcmDeviceDto): Promise<{
        ok: boolean;
        id: string;
        menuId: number;
        platform: string;
    }>;
    refresh(req: Request, body: RefreshFcmDeviceDto): Promise<{
        ok: boolean;
        id: string;
    }>;
    unregister(req: Request, body: UnregisterFcmDeviceDto): Promise<{
        ok: boolean;
        deleted: number;
    }>;
}
