import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { FcmDeviceService } from './fcm-device.service';
import { MappedFcmEvent } from './fcm-event.mapper';
export declare class FcmSenderService implements OnModuleInit {
    private readonly config;
    private readonly prisma;
    private readonly devices;
    private readonly logger;
    private messaging;
    private firebaseReady;
    sentTotal: number;
    dedupedTotal: number;
    invalidTokenTotal: number;
    private readonly menuWindow;
    constructor(config: ConfigService, prisma: PrismaService, devices: FcmDeviceService);
    get isFirebaseReady(): boolean;
    onModuleInit(): void;
    private initFirebase;
    private allowMenuRate;
    processMappedEvent(event: MappedFcmEvent): Promise<void>;
    private sendToTokens;
}
