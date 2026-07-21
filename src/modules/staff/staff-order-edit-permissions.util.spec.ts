import { resolveCanEditItems } from './staff-order-edit-permissions.util';
import {
  authFromPermissions,
  cashierAuth,
  foodPreparerAuth,
  waiterAuth,
} from './staff-auth.fixtures';

describe('resolveCanEditItems (Web parity)', () => {
  it('waiter with orders:edit_items can edit pending, confirmed, prepared table orders', () => {
    const auth = waiterAuth();
    expect(resolveCanEditItems('table', auth, 'pending')).toBe(true);
    expect(resolveCanEditItems('table', auth, 'confirmed')).toBe(true);
    expect(resolveCanEditItems('table', auth, 'prepared')).toBe(true);
    expect(resolveCanEditItems('delivery', auth, 'pending')).toBe(false);
  });

  it('cashier can edit delivery orders while pending or confirmed only', () => {
    const auth = cashierAuth();
    expect(resolveCanEditItems('delivery', auth, 'pending')).toBe(true);
    expect(resolveCanEditItems('delivery', auth, 'confirmed')).toBe(true);
    expect(resolveCanEditItems('delivery', auth, 'prepared')).toBe(false);
  });

  it('cashier can edit table through prepared', () => {
    const auth = cashierAuth();
    expect(resolveCanEditItems('table', auth, 'pending')).toBe(true);
    expect(resolveCanEditItems('table', auth, 'confirmed')).toBe(true);
    expect(resolveCanEditItems('table', auth, 'prepared')).toBe(true);
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
