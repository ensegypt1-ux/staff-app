import { ForbiddenException } from '@nestjs/common';
import { Request } from 'express';
import { requireAuthIdentity } from '../../common/utils/jwt-payload.util';

/**
 * Resolves the staff menu scope for order APIs.
 * Verified JWT menuId is required and authoritative.
 * Client query/body menuId must match when provided; mismatches are rejected.
 * Unscoped staff tokens are rejected (no client-menuId fallback).
 */
export function resolveStaffMenuId(
  req: Request,
  query?: Record<string, unknown>,
  body?: Record<string, unknown>,
): number {
  const identity = requireAuthIdentity(req);
  const scoped = identity.menuId;
  const clientRaw = body?.menuId ?? query?.menuId;
  const client =
    clientRaw != null && String(clientRaw).trim() !== ''
      ? Number(clientRaw)
      : 0;
  const clientValid = Number.isFinite(client) && client > 0 ? client : 0;

  if (scoped == null || scoped <= 0) {
    throw new ForbiddenException({
      error: 'Staff session is missing menu scope — please sign in again',
      errorAr: 'جلسة الموظف بدون صلاحية قائمة — يرجى تسجيل الدخول مجدداً',
      code: 'STAFF_MENU_SCOPE_REQUIRED',
    });
  }

  if (clientValid > 0 && clientValid !== scoped) {
    throw new ForbiddenException({
      error: 'Menu access denied for this staff session',
      errorAr: 'غير مسموح بالوصول إلى هذه القائمة لهذا الموظف',
      code: 'STAFF_MENU_SCOPE_MISMATCH',
    });
  }

  return scoped;
}
