import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { isStaffRole } from '../types/auth-identity';
import { getAuthIdentity } from '../utils/jwt-payload.util';

/**
 * Staff-only BFF routes (except public login / health).
 */
@Injectable()
export class StaffOnlyGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const identity = getAuthIdentity(request);

    if (!identity) {
      throw new UnauthorizedException({
        error: 'Authentication required',
        errorAr: 'مطلوب تسجيل الدخول',
        code: 'AUTH_REQUIRED',
      });
    }

    if (!isStaffRole(identity.role)) {
      throw new ForbiddenException({
        error: 'Staff authentication required',
        errorAr: 'مطلوب تسجيل دخول الموظف',
        code: 'STAFF_AUTH_REQUIRED',
      });
    }

    return true;
  }
}
