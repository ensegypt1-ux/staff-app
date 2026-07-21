import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
export declare class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    private readonly config;
    private readonly logger;
    private connected;
    constructor(config: ConfigService);
    get isConnected(): boolean;
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
}
