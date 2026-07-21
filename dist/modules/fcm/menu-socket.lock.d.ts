import { OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
export declare class MenuSocketLockService implements OnModuleDestroy {
    private readonly config;
    private readonly logger;
    private pool;
    private readonly held;
    constructor(config: ConfigService);
    private ensurePool;
    private lockKey;
    tryAcquire(menuId: number): Promise<boolean>;
    release(menuId: number): Promise<void>;
    releaseAll(): Promise<void>;
    onModuleDestroy(): Promise<void>;
}
