import {
  isMenuAccessAuthorizationSoft404,
  normalizeStaffUpstreamError,
  rejectUpstreamListResult,
} from './staff-order-errors.util';
import { Logger } from '@nestjs/common';

describe('isMenuAccessAuthorizationSoft404', () => {
  it('detects Express menuNotFound soft-404 (en)', () => {
    expect(
      isMenuAccessAuthorizationSoft404({
        status: 404,
        data: {
          error: 'Menu not found',
          errorEn: 'Menu not found',
          errorAr: 'المنيو غير موجود',
        },
      }),
    ).toBe(true);
  });

  it('detects Express menuNotFound soft-404 (ar primary)', () => {
    expect(
      isMenuAccessAuthorizationSoft404({
        status: 404,
        data: {
          error: 'المنيو غير موجود',
          errorAr: 'المنيو غير موجود',
          errorEn: 'Menu not found',
        },
      }),
    ).toBe(true);
  });

  it('does not treat genuine order 404 as menu soft-404', () => {
    expect(
      isMenuAccessAuthorizationSoft404({
        status: 404,
        data: {
          error: 'Order not found',
          code: 'ORDER_NOT_FOUND',
        },
      }),
    ).toBe(false);
  });

  it('does not treat activity-log not found as menu soft-404', () => {
    expect(
      isMenuAccessAuthorizationSoft404({
        status: 404,
        data: {
          error: 'Activity log entry not found',
          errorEn: 'Activity log entry not found',
        },
      }),
    ).toBe(false);
  });

  it('ignores non-404 responses', () => {
    expect(
      isMenuAccessAuthorizationSoft404({
        status: 403,
        data: { error: 'Menu not found' },
      }),
    ).toBe(false);
  });
});

describe('normalizeStaffUpstreamError menu soft-404', () => {
  it('does not remap menu soft-404 to ORDER_NOT_FOUND', () => {
    const normalized = normalizeStaffUpstreamError({
      status: 404,
      data: {
        error: 'Menu not found',
        errorEn: 'Menu not found',
        errorAr: 'المنيو غير موجود',
      },
    });

    expect(normalized.status).toBe(404);
    expect((normalized.data as Record<string, unknown>).code).toBe(
      'MENU_ACCESS_SOFT_404',
    );
    expect((normalized.data as Record<string, unknown>).code).not.toBe(
      'ORDER_NOT_FOUND',
    );
  });

  it('still maps generic 404 to ORDER_NOT_FOUND', () => {
    const normalized = normalizeStaffUpstreamError({
      status: 404,
      data: { error: 'Something missing' },
    });
    expect((normalized.data as Record<string, unknown>).code).toBe(
      'ORDER_NOT_FOUND',
    );
  });
});

describe('rejectUpstreamListResult', () => {
  it('preserves MENU_ACCESS_SOFT_404 instead of ORDER_NOT_FOUND', () => {
    const logger = { warn: jest.fn() } as unknown as Logger;
    const result = rejectUpstreamListResult(logger, 'test', {
      status: 404,
      data: {
        error: 'Menu not found',
        errorEn: 'Menu not found',
        errorAr: 'المنيو غير موجود',
      },
    });
    expect((result.data as Record<string, unknown>).code).toBe(
      'MENU_ACCESS_SOFT_404',
    );
  });
});
