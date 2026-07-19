import { resolveCanEditItems } from './staff-order-edit-permissions.util';
import {
  authFromPermissions,
  cashierAuth,
  foodPreparerAuth,
  waiterAuth,
} from './staff-auth.fixtures';

describe('resolveCanEditItems', () => {
  it('waiter with orders:edit_items can edit pending and confirmed table orders', () => {
    const auth = waiterAuth();
    expect(resolveCanEditItems('table', auth, 'pending')).toBe(true);
    expect(resolveCanEditItems('table', auth, 'confirmed')).toBe(true);
    expect(resolveCanEditItems('table', auth, 'prepared')).toBe(false);
    expect(resolveCanEditItems('delivery', auth, 'pending')).toBe(false);
  });

  it('cashier can edit table and delivery while pending or confirmed', () => {
    const auth = cashierAuth();
    for (const channel of ['table', 'delivery'] as const) {
      expect(resolveCanEditItems(channel, auth, 'pending')).toBe(true);
      expect(resolveCanEditItems(channel, auth, 'confirmed')).toBe(true);
      expect(resolveCanEditItems(channel, auth, 'prepared')).toBe(false);
    }
  });

  it('food_preparer without orders:edit_items cannot edit', () => {
    const auth = foodPreparerAuth();
    expect(resolveCanEditItems('table', auth, 'pending')).toBe(false);
    expect(resolveCanEditItems('table', auth, 'confirmed')).toBe(false);
  });

  it('custom role without edit_items cannot edit even with view', () => {
    const auth = authFromPermissions(['orders:view', 'orders:confirm']);
    expect(resolveCanEditItems('table', auth, 'pending')).toBe(false);
  });

  it('no auth can edit delivered or cancelled orders', () => {
    for (const auth of [waiterAuth(), cashierAuth()] as const) {
      for (const channel of ['table', 'delivery'] as const) {
        expect(resolveCanEditItems(channel, auth, 'delivered')).toBe(false);
        expect(resolveCanEditItems(channel, auth, 'cancelled')).toBe(false);
      }
    }
  });
});
