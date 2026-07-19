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

describe('availableActionsForOrder (permission matrix)', () => {
  it('waiter table pending offers confirm + cancel', () => {
    const actions = availableActionsForOrder('pending', waiterAuth(), 'table');
    expect(actions.map((a) => a.action)).toEqual([
      'TABLE_CALL_CONFIRMED',
      'TABLE_CALL_CANCELLED',
    ]);
  });

  it('waiter cannot prepare or deliver', () => {
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

  it('cashier table confirmed offers prepare', () => {
    expect(
      availableActionsForOrder('confirmed', cashierAuth(), 'table').map(
        (a) => a.action,
      ),
    ).toEqual(['TABLE_CALL_PREPARED']);
  });

  it('cashier table prepared offers deliver', () => {
    expect(
      availableActionsForOrder('prepared', cashierAuth(), 'table').map(
        (a) => a.action,
      ),
    ).toEqual(['TABLE_CALL_DELIVERED']);
  });

  it('delivery pending offers mark prepared when orders:prepare', () => {
    const actions = availableActionsForOrder(
      'pending',
      cashierAuth(),
      'delivery',
    );
    expect(actions.map((a) => a.action)).toEqual(['TABLE_CALL_PREPARED']);
  });

  it('delivery confirmed offers mark prepared for cashier', () => {
    const actions = availableActionsForOrder(
      'confirmed',
      cashierAuth(),
      'delivery',
    );
    expect(actions.map((a) => a.action)).toEqual(['TABLE_CALL_PREPARED']);
  });

  it('delivery prepared offers mark delivered for cashier', () => {
    const actions = availableActionsForOrder(
      'prepared',
      cashierAuth(),
      'delivery',
    );
    expect(actions.map((a) => a.action)).toEqual(['TABLE_CALL_DELIVERED']);
  });

  it('food_preparer only offers prepare on confirmed table orders', () => {
    const auth = foodPreparerAuth();
    expect(
      availableActionsForOrder('pending', auth, 'table').map((a) => a.action),
    ).toEqual([]);
    expect(
      availableActionsForOrder('confirmed', auth, 'table').map((a) => a.action),
    ).toEqual(['TABLE_CALL_PREPARED']);
    expect(
      availableActionsForOrder('prepared', auth, 'table').map((a) => a.action),
    ).toEqual([]);
  });

  it('custom role confirm-only cannot prepare', () => {
    const auth = authFromPermissions(['orders:view', 'orders:confirm']);
    expect(
      availableActionsForOrder('confirmed', auth, 'table').map((a) => a.action),
    ).toEqual([]);
    expect(canPerformOrderAction(auth, 'TABLE_CALL_PREPARED')).toBe(false);
    expect(canPerformOrderAction(auth, 'TABLE_CALL_CONFIRMED')).toBe(true);
  });

  it('canStaffViewDelivery follows delivery:view', () => {
    expect(canStaffViewDelivery(waiterAuth())).toBe(false);
    expect(canStaffViewDelivery(cashierAuth())).toBe(true);
  });
});
