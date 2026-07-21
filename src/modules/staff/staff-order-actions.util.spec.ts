import {
  availableActionsForOrder,
  canPerformOrderAction,
  canStaffViewDelivery,
} from './staff-order-actions.util';
import {
  authFromPermissions,
  cashierAuth,
  foodPreparerAuth,
  waiterAuth,
} from './staff-auth.fixtures';

describe('availableActionsForOrder (Web table parity)', () => {
  it('waiter table pending offers confirm + cancel', () => {
    const actions = availableActionsForOrder('pending', waiterAuth(), 'table');
    expect(actions.map((a) => a.action)).toEqual([
      'TABLE_CALL_CONFIRMED',
      'TABLE_CALL_CANCELLED',
    ]);
  });

  it('waiter confirmed/prepared has no finish without orders:complete', () => {
    expect(
      availableActionsForOrder('confirmed', waiterAuth(), 'table').map(
        (a) => a.action,
      ),
    ).toEqual([]);
    expect(
      availableActionsForOrder('prepared', waiterAuth(), 'table').map(
        (a) => a.action,
      ),
    ).toEqual([]);
  });

  it('cashier table pending offers accept and reject', () => {
    const actions = availableActionsForOrder('pending', cashierAuth(), 'table');
    expect(actions.map((a) => a.action)).toEqual([
      'TABLE_CALL_CONFIRMED',
      'TABLE_CALL_CANCELLED',
    ]);
  });

  it('cashier table confirmed/prepared offers Finish (COMPLETED)', () => {
    expect(
      availableActionsForOrder('confirmed', cashierAuth(), 'table').map(
        (a) => a.action,
      ),
    ).toEqual(['TABLE_CALL_COMPLETED']);
    expect(
      availableActionsForOrder('prepared', cashierAuth(), 'table').map(
        (a) => a.action,
      ),
    ).toEqual(['TABLE_CALL_COMPLETED']);
  });

  it('table channel never offers prepare or deliver', () => {
    for (const status of ['pending', 'confirmed', 'prepared'] as const) {
      const actions = availableActionsForOrder(
        status,
        cashierAuth(),
        'table',
      ).map((a) => a.action);
      expect(actions).not.toContain('TABLE_CALL_PREPARED');
      expect(actions).not.toContain('TABLE_CALL_DELIVERED');
    }
  });

  it('pendingGuestAddition on confirmed offers accept addition only', () => {
    const actions = availableActionsForOrder(
      'confirmed',
      cashierAuth(),
      'table',
      { pendingGuestAddition: true },
    );
    expect(actions.map((a) => a.action)).toEqual(['TABLE_CALL_CONFIRMED']);
    expect(actions[0]?.label.en).toBe('Accept addition');
  });

  it('delivery pending offers prepare and reject when permitted', () => {
    const actions = availableActionsForOrder(
      'pending',
      cashierAuth(),
      'delivery',
    );
    expect(actions.map((a) => a.action)).toEqual([
      'TABLE_CALL_PREPARED',
      'TABLE_CALL_CANCELLED',
    ]);
    expect(actions[0]?.label).toEqual({
      en: 'Start preparing',
      ar: 'بدء التحضير',
    });
    expect(actions[1]?.label).toEqual({ en: 'Reject', ar: 'رفض' });
  });

  it('delivery confirmed offers prepare only (no reject)', () => {
    const actions = availableActionsForOrder(
      'confirmed',
      cashierAuth(),
      'delivery',
    );
    expect(actions.map((a) => a.action)).toEqual(['TABLE_CALL_PREPARED']);
    expect(actions[0]?.label.en).toBe('Start preparing');
  });

  it('delivery prepared offers mark sent out for cashier', () => {
    const actions = availableActionsForOrder(
      'prepared',
      cashierAuth(),
      'delivery',
    );
    expect(actions.map((a) => a.action)).toEqual(['TABLE_CALL_DELIVERED']);
    expect(actions[0]?.label).toEqual({
      en: 'Mark as sent out',
      ar: 'تم التسليم للمندوب',
    });
  });

  it('food_preparer has no table prepare (Web parity)', () => {
    const auth = foodPreparerAuth();
    expect(
      availableActionsForOrder('pending', auth, 'table').map((a) => a.action),
    ).toEqual([]);
    expect(
      availableActionsForOrder('confirmed', auth, 'table').map((a) => a.action),
    ).toEqual([]);
  });

  it('canPerformOrderAction maps COMPLETED to orders:complete', () => {
    expect(canPerformOrderAction(waiterAuth(), 'TABLE_CALL_COMPLETED')).toBe(
      false,
    );
    expect(canPerformOrderAction(cashierAuth(), 'TABLE_CALL_COMPLETED')).toBe(
      true,
    );
  });

  it('service waiter pending offers Accept/Reject only', () => {
    const actions = availableActionsForOrder(
      'pending',
      cashierAuth(),
      'table',
      { requestKind: 'waiter' },
    );
    expect(actions.map((a) => a.action)).toEqual([
      'TABLE_CALL_CONFIRMED',
      'TABLE_CALL_CANCELLED',
    ]);
  });

  it('service waiter confirmed exposes no Finish/Prepare/Deliver', () => {
    expect(
      availableActionsForOrder('confirmed', cashierAuth(), 'table', {
        requestKind: 'waiter',
      }).map((a) => a.action),
    ).toEqual([]);
  });

  it('orphan bill pending offers Accept/Reject only', () => {
    expect(
      availableActionsForOrder('pending', waiterAuth(), 'table', {
        requestKind: 'bill',
      }).map((a) => a.action),
    ).toEqual(['TABLE_CALL_CONFIRMED', 'TABLE_CALL_CANCELLED']);
  });

  it('canStaffViewDelivery follows delivery:view', () => {
    expect(canStaffViewDelivery(waiterAuth())).toBe(false);
    expect(canStaffViewDelivery(cashierAuth())).toBe(true);
  });

  it('custom role with complete can finish food orders', () => {
    const auth = authFromPermissions([
      'orders:view',
      'orders:confirm',
      'orders:complete',
    ]);
    expect(
      availableActionsForOrder('confirmed', auth, 'table').map((a) => a.action),
    ).toEqual(['TABLE_CALL_COMPLETED']);
  });
});
