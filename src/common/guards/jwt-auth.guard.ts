import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import {
  attachAuthIdentity,
  extractBearerToken,
  verifyAccessToken,
} from '../utils/jwt-payload.util';

/**
 * Cryptographically verifies Bearer access tokens for every non-public route.
 * Attaches an immutable VerifiedAuthIdentity to the request.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException({
        error: 'Authentication required',
        errorAr: 'مطلوب تسجيل الدخول',
        code: 'AUTH_REQUIRED',
      });
    }

    const identity = verifyAccessToken(token, this.configService);
    attachAuthIdentity(request, identity);
    return true;
  }
}
