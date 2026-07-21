import { ConfigService } from '@nestjs/config';
import { FcmSenderService } from './fcm-sender.service';
import { MenuSocketSupervisor } from './menu-socket.supervisor';
export declare class FcmHealthController {
    private readonly config;
    private readonly supervisor;
    private readonly sender;
    constructor(config: ConfigService, supervisor: MenuSocketSupervisor, sender: FcmSenderService);
    health(): {
        enabled: boolean;
        role: string | undefined;
        firebaseReady: boolean;
        dryRun: boolean;
        desiredMenus: number;
        joinedMenus: number;
        uncoveredMenus: number[];
        reconnectsTotal: number;
        pushSentTotal: number;
        pushDedupedTotal: number;
        pushInvalidTokenTotal: number;
    } | {
        enabled: boolean;
        role: string | undefined;
        message: string;
    };
}
