import { ConfigService } from '@nestjs/config';
export declare class AssetUrlService {
    private readonly configService;
    private readonly publicBase;
    private readonly backendBase;
    constructor(configService: ConfigService);
    rewriteUrl(value: string): string;
    rewriteDeep<T>(input: T): T;
}
