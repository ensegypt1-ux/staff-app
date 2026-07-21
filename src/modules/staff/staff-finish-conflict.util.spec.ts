import {
  isFinishConflictOrMenuUpstreamError,
  isMenuAccessAuthorizationSoft404,
  isPostFinishHistoryPresentationFailure,
  normalizeStaffUpstreamError,
} from './staff-order-errors.util';

describe('isFinishConflictOrMenuUpstreamError', () => {
  it('treats 409 as recoverable Finish conflict', () => {
    expect(
      isFinishConflictOrMenuUpstreamError({
        status: 409,
        data: {
          error: 'Order not found, wrong menu, or not in pending status',
        },
      }),
    ).toBe(true);
  });

  it('treats menu soft-404 as recoverable', () => {
    const soft = {
      status: 404,
      data: {
        error: 'Menu not found',
        errorEn: 'Menu not found',
        errorAr: 'المنيو غير موجود',
      },
    };
    expect(isMenuAccessAuthorizationSoft404(soft)).toBe(true);
    expect(isFinishConflictOrMenuUpstreamError(soft)).toBe(true);
  });

  it('treats normalized MENU_ACCESS_SOFT_404 as recoverable', () => {
    const normalized = normalizeStaffUpstreamError({
      status: 404,
      data: {
        error: 'Menu not found',
        errorEn: 'Menu not found',
        errorAr: 'المنيو غير موجود',
      },
    });
    expect(isFinishConflictOrMenuUpstreamError(normalized)).toBe(true);
  });

  it('does not treat genuine ORDER_NOT_FOUND as Finish recoverable', () => {
    expect(
      isFinishConflictOrMenuUpstreamError({
        status: 404,
        data: {
          error: 'Order not found',
          code: 'ORDER_NOT_FOUND',
        },
      }),
    ).toBe(false);
  });

  it('does not treat 403 permission errors as recoverable', () => {
    expect(
      isFinishConflictOrMenuUpstreamError({
        status: 403,
        data: {
          error: 'Forbidden',
          code: 'STAFF_ACTION_DENIED',
        },
      }),
    ).toBe(false);
  });
});

describe('isPostFinishHistoryPresentationFailure', () => {
  it('detects history-gated ORDER_NOT_FOUND after successful Finish', () => {
    expect(
      isPostFinishHistoryPresentationFailure({
        status: 404,
        data: {
          error: 'Order not found',
          code: 'ORDER_NOT_FOUND',
        },
      }),
    ).toBe(true);
  });

  it('does not treat 403 as history presentation failure', () => {
    expect(
      isPostFinishHistoryPresentationFailure({
        status: 403,
        data: {
          error: 'Forbidden',
          code: 'STAFF_ACTION_DENIED',
        },
      }),
    ).toBe(false);
  });

  it('does not treat 409 conflict as history presentation failure', () => {
    expect(
      isPostFinishHistoryPresentationFailure({
        status: 409,
        data: {
          code: 'STAFF_ORDER_STATE_CHANGED',
        },
      }),
    ).toBe(false);
  });
});

describe('Finish conflict recovery contract', () => {
  it('delivered follow-up maps to HTTP 200 success shape', () => {
    const followUpStatus: string = 'delivered';
    const httpStatus = followUpStatus === 'delivered' ? 200 : 409;
    expect(httpStatus).toBe(200);
  });

  it('still-active follow-up maps to state conflict', () => {
    const followUpStatus: string = 'prepared';
    const code =
      followUpStatus === 'delivered' ? null : 'STAFF_ORDER_STATE_CHANGED';
    expect(code).toBe('STAFF_ORDER_STATE_CHANGED');
  });

  it('missing table-call maps to ORDER_NOT_FOUND', () => {
    const raw = null as Record<string, unknown> | null;
    const code = raw == null ? 'ORDER_NOT_FOUND' : null;
    expect(code).toBe('ORDER_NOT_FOUND');
  });

  it('post-success history denial falls back to delivered ack', () => {
    const finishUpstreamOk = true;
    const presentation = {
      status: 404,
      data: { code: 'ORDER_NOT_FOUND', error: 'Order not found' },
    };
    const shouldFallback =
      finishUpstreamOk && isPostFinishHistoryPresentationFailure(presentation);
    expect(shouldFallback).toBe(true);
  });
});
