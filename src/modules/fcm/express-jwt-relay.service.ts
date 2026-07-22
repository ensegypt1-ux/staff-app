import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

export type RelayJwtClaims = {
  staffId: number;
  menuId: number;
  staffRoleId: number;
};

/**
 * Mints Express-compatible staff JWTs for Worker Socket.IO `staff:join` only.
 * Never returned to clients.
 */
@Injectable()
export class ExpressJwtRelayService {
  constructor(private readonly config: ConfigService) {}

  mintStaffJoinToken(claims: RelayJwtClaims): string {
    const secret = this.config.get<string>('jwtAccessSecret')?.trim();
    if (!secret || secret.length < 32) {
      throw new Error('JWT_ACCESS_SECRET missing or too short for relay mint');
    }

    const payload = {
      id: claims.staffId,
      userId: claims.staffId,
      email: `relay+menu${claims.menuId}@staff-bff.internal`,
      role: 'staff',
      menuId: claims.menuId,
      staffRoleId: claims.staffRoleId,
    };

    // Match Express generateStaffAccessToken (no exp).
    // Security note: short-lived exp requires coordinated Express change — do not
    // add expiresIn here until Express staff JWT verification accepts it.
    return jwt.sign(payload, secret, { algorithm: 'HS256' });
  }
}
