import { ConfigService } from '@nestjs/config';
export type RelayJwtClaims = {
    staffId: number;
    menuId: number;
    staffRoleId: number;
};
export declare class ExpressJwtRelayService {
    private readonly config;
    constructor(config: ConfigService);
    mintStaffJoinToken(claims: RelayJwtClaims): string;
}
