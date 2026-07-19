import { ForbiddenException } from '@nestjs/common';
import { AUTH_IDENTITY_KEY } from '../../common/types/auth-identity';
import { resolveStaffMenuId } from './staff-menu-scope.util';

function reqWithIdentity(identity: {
  userId: number;
  role: string;
  menuId?: number;
}) {
  return {
    [AUTH_IDENTITY_KEY]: Object.freeze(identity),
    headers: {},
  } as unknown as import('express').Request;
}

describe('resolveStaffMenuId', () => {
  it('uses JWT menuId when present', () => {
    const req = reqWithIdentity({ userId: 1, role: 'staff', menuId: 42 });
    expect(resolveStaffMenuId(req, { menuId: 42 })).toBe(42);
    expect(resolveStaffMenuId(req, {})).toBe(42);
  });

  it('rejects client menuId that mismatches JWT scope', () => {
    const req = reqWithIdentity({ userId: 1, role: 'staff', menuId: 42 });
    expect(() => resolveStaffMenuId(req, { menuId: 99 })).toThrow(
      ForbiddenException,
    );
  });

  it('rejects unscoped staff tokens even with client menuId', () => {
    const req = reqWithIdentity({ userId: 1, role: 'staff' });
    expect(() => resolveStaffMenuId(req, { menuId: 7 })).toThrow(
      ForbiddenException,
    );
  });

  it('rejects unscoped staff tokens without client menuId', () => {
    const req = reqWithIdentity({ userId: 1, role: 'staff' });
    expect(() => resolveStaffMenuId(req, {})).toThrow(ForbiddenException);
  });
});
