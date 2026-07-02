import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
export declare class UpstreamClockService {
    private readonly httpService;
    private readonly configService;
    private readonly logger;
    private readonly backendBaseUrl;
    private skewSeconds;
    private lastSyncMs;
    private syncPromise;
    private static readonly SYNC_TTL_MS;
    constructor(httpService: HttpService, configService: ConfigService);
    getSkewSeconds(): number;
    ensureSynced(force?: boolean): Promise<void>;
    private syncFromHealth;
}
