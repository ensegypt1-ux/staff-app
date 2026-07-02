import { Request } from 'express';
import { decode as decodeJwt } from 'jsonwebtoken';

export type StaffJobRole = 'waiter' | 'cashier' | 'unknown';

export function normalizeStaffJobRole(raw: unknown): StaffJobRole {
  const value = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (value === 'cashier' || value === 'casher') return 'cashier';
  if (value === 'waiter') return 'waiter';
  return 'unknown';
}

/** Job role from staff JWT (`staffJobRole` claim). */
export function staffJobRoleFromRequest(req: Request): StaffJobRole {
  const authorization = req.headers.authorization;
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
    return 'unknown';
  }

  const token = authorization.slice('Bearer '.length).trim();
  if (!token) return 'unknown';

  const decoded = decodeJwt(token);
  if (!decoded || typeof decoded !== 'object') return 'unknown';

  const role = normalizeStaffJobRole(
    (decoded as Record<string, unknown>).staffJobRole,
  );
  return role === 'unknown' ? 'waiter' : role;
}
