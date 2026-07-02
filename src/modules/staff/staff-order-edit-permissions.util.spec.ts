import { resolveCanEditItems } from './staff-order-edit-permissions.util';

describe('resolveCanEditItems', () => {
  it('waiter can edit pending table orders only', () => {
    expect(resolveCanEditItems('table', 'waiter', 'pending')).toBe(true);
    expect(resolveCanEditItems('table', 'waiter', 'confirmed')).toBe(false);
    expect(resolveCanEditItems('table', 'waiter', 'prepared')).toBe(false);
    expect(resolveCanEditItems('delivery', 'waiter', 'pending')).toBe(false);
  });

  it('cashier can edit table and delivery while pending or confirmed', () => {
    for (const channel of ['table', 'delivery'] as const) {
      expect(resolveCanEditItems(channel, 'cashier', 'pending')).toBe(true);
      expect(resolveCanEditItems(channel, 'cashier', 'confirmed')).toBe(true);
      expect(resolveCanEditItems(channel, 'cashier', 'prepared')).toBe(false);
    }
  });

  it('no role can edit delivered or cancelled orders', () => {
    for (const role of ['waiter', 'cashier'] as const) {
      for (const channel of ['table', 'delivery'] as const) {
        expect(resolveCanEditItems(channel, role, 'delivered')).toBe(false);
        expect(resolveCanEditItems(channel, role, 'cancelled')).toBe(false);
      }
    }
  });
});
