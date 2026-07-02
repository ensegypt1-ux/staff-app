import { ConfigService } from '@nestjs/config';
import { UpstreamClockService } from './upstream-clock.service';
export declare class ApiKeyService {
    private readonly configService;
    private readonly upstreamClock;
    private readonly secretKey;
    constructor(configService: ConfigService, upstreamClock: UpstreamClockService);
    isConfigured(): boolean;
    generateHeaderValueAsync(forceClockSync?: boolean): Promise<string>;
    refreshClock(force?: boolean): Promise<void>;
}
