import {
  availableActionsForOrder,
} from './staff-order-actions.util';

describe('availableActionsForOrder', () => {
  it('delivery pending offers mark prepared only for cashier', () => {
    const actions = availableActionsForOrder('pending', 'cashier', 'delivery');
    expect(actions.map((a) => a.action)).toEqual(['TABLE_CALL_PREPARED']);
  });

  it('delivery confirmed offers mark prepared for cashier', () => {
    const actions = availableActionsForOrder(
      'confirmed',
      'cashier',
      'delivery',
    );
    expect(actions.map((a) => a.action)).toEqual(['TABLE_CALL_PREPARED']);
  });

  it('delivery prepared offers mark delivered for cashier', () => {
    const actions = availableActionsForOrder('prepared', 'cashier', 'delivery');
    expect(actions.map((a) => a.action)).toEqual(['TABLE_CALL_DELIVERED']);
  });

  it('table pending still offers accept and reject for cashier', () => {
    const actions = availableActionsForOrder('pending', 'cashier', 'table');
    expect(actions.map((a) => a.action)).toEqual([
      'TABLE_CALL_CONFIRMED',
      'TABLE_CALL_CANCELLED',
    ]);
  });
});
