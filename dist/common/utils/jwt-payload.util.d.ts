import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { VerifiedAuthIdentity } from '../types/auth-identity';
export declare function coerceUserId(raw: unknown): number | null;
export declare function verifyAccessToken(token: string, configService: ConfigService): VerifiedAuthIdentity;
export declare function extractBearerToken(req: Request): string | null;
export declare function attachAuthIdentity(req: Request, identity: VerifiedAuthIdentity): void;
export declare function getAuthIdentity(req: Request): VerifiedAuthIdentity | null;
export declare function requireAuthIdentity(req: Request): VerifiedAuthIdentity;
