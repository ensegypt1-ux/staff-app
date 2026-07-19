import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { Request } from 'express';
import {
  AUTH_IDENTITY_KEY,
  VerifiedAuthIdentity,
} from '../types/auth-identity';

export function coerceUserId(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function accessSecret(configService: ConfigService): string | null {
  const secret = configService.get<string>('jwtAccessSecret')?.trim();
  if (!secret || secret.length < 32) return null;
  return secret;
}

function payloadToIdentity(
  payload: jwt.JwtPayload,
): VerifiedAuthIdentity | null {
  const userId = coerceUserId(payload.id ?? payload.userId ?? payload.sub);
  if (userId == null || userId <= 0) return null;

  const roleRaw = payload.role ?? payload.userRole;
  const role =
    typeof roleRaw === 'string' && roleRaw.trim()
      ? roleRaw.trim()
      : 'user';

  const menuId = coerceUserId(payload.menuId) ?? undefined;
  const staffRoleId = coerceUserId(payload.staffRoleId) ?? undefined;

  return Object.freeze({
    userId,
    role,
    ...(menuId != null && menuId > 0 ? { menuId } : {}),
    ...(staffRoleId != null && staffRoleId > 0 ? { staffRoleId } : {}),
  });
}

/**
 * Cryptographically verifies a staff access token using JWT_ACCESS_SECRET.
 * Pins HS256 to match Express jsonwebtoken defaults.
 */
export function verifyAccessToken(
  token: string,
  configService: ConfigService,
): VerifiedAuthIdentity {
  const secret = accessSecret(configService);
  if (!secret) {
    throw new UnauthorizedException({
      error: 'Authentication service misconfigured',
      errorAr: 'خدمة المصادقة غير مهيأة',
      code: 'AUTH_MISCONFIGURED',
    });
  }

  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, secret, {
      algorithms: ['HS256'],
    }) as jwt.JwtPayload;
  } catch (err) {
    const name =
      err && typeof err === 'object' && 'name' in err
        ? String((err as { name: string }).name)
        : '';

    if (name === 'TokenExpiredError') {
      throw new UnauthorizedException({
        error: 'Token expired',
        errorAr: 'انتهت صلاحية الرمز',
        code: 'TOKEN_EXPIRED',
      });
    }

    throw new UnauthorizedException({
      error: 'Invalid or expired token',
      errorAr: 'رمز الدخول غير صالح أو منتهي الصلاحية',
      code: 'AUTH_INVALID_TOKEN',
    });
  }

  const identity = payloadToIdentity(payload);
  if (!identity) {
    throw new UnauthorizedException({
      error: 'Invalid or expired token',
      errorAr: 'رمز الدخول غير صالح أو منتهي الصلاحية',
      code: 'AUTH_INVALID_TOKEN',
    });
  }
  return identity;
}

export function extractBearerToken(req: Request): string | null {
  const authorization = req.headers.authorization;
  if (
    typeof authorization !== 'string' ||
    !authorization.startsWith('Bearer ')
  ) {
    return null;
  }
  const token = authorization.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

export function attachAuthIdentity(
  req: Request,
  identity: VerifiedAuthIdentity,
): void {
  const existingAuth = Object.getOwnPropertyDescriptor(req, AUTH_IDENTITY_KEY);
  if (!existingAuth) {
    Object.defineProperty(req, AUTH_IDENTITY_KEY, {
      value: identity,
      writable: false,
      enumerable: true,
      configurable: false,
    });
  }

  const existingUser = Object.getOwnPropertyDescriptor(req, 'user');
  if (!existingUser) {
    Object.defineProperty(req, 'user', {
      value: identity,
      writable: false,
      enumerable: true,
      configurable: false,
    });
  }
}

export function getAuthIdentity(req: Request): VerifiedAuthIdentity | null {
  const fromKey = (req as Request & { authIdentity?: VerifiedAuthIdentity })
    .authIdentity;
  if (fromKey && typeof fromKey.userId === 'number') return fromKey;
  const fromUser = (req as Request & { user?: VerifiedAuthIdentity }).user;
  if (fromUser && typeof fromUser.userId === 'number') return fromUser;
  return null;
}

export function requireAuthIdentity(req: Request): VerifiedAuthIdentity {
  const identity = getAuthIdentity(req);
  if (!identity) {
    throw new UnauthorizedException({
      error: 'Authentication required',
      errorAr: 'مطلوب تسجيل الدخول',
      code: 'AUTH_REQUIRED',
    });
  }
  return identity;
}
