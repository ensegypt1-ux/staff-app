import {
  buildStaffResolvedAuth,
  mapStaffCapabilities,
} from './staff-capability.mapper';
import {
  CASHIER_PERMISSIONS,
  FOOD_PREPARER_PERMISSIONS,
  WAITER_PERMISSIONS,
  authFromPermissions,
  cashierAuth,
  foodPreparerAuth,
  waiterAuth,
} from './staff-auth.fixtures';

describe('mapStaffCapabilities', () => {
  it('maps waiter permissions', () => {
    const caps = mapStaffCapabilities({
      permissions: [...WAITER_PERMISSIONS],
      roleName: 'Waiter',
      roleId: 1,
      legacyRole: 'waiter',
    });

    expect(caps['orders:view']).toBe(true);
    expect(caps['orders:confirm']).toBe(true);
    expect(caps['orders:cancel']).toBe(true);
    expect(caps['orders:edit_items']).toBe(true);
    expect(caps['orders:prepare']).toBe(false);
    expect(caps['orders:deliver']).toBe(false);
    expect(caps['delivery:view']).toBe(false);
    expect(caps.canViewKitchen).toBe(false);
    expect(caps.canViewHistory).toBe(true);
    expect(caps.canViewDelivery).toBe(false);
    expect(caps.canEditItems).toBe(true);
    expect(caps.canProcessOrders).toBe(false);
    expect(caps.channels).toEqual(['table']);
    expect(caps.staffJobRole).toBe('waiter');
  });

  it('maps cashier permissions', () => {
    const caps = mapStaffCapabilities({
      permissions: [...CASHIER_PERMISSIONS],
      roleName: 'Cashier',
      roleId: 2,
      legacyRole: 'cashier',
    });

    expect(caps['orders:prepare']).toBe(true);
    expect(caps['orders:deliver']).toBe(true);
    expect(caps['orders:complete']).toBe(true);
    expect(caps['delivery:view']).toBe(true);
    expect(caps['menu:view']).toBe(true);
    expect(caps['menu:tables']).toBe(true);
    expect(caps.canViewKitchen).toBe(true);
    expect(caps.canViewDelivery).toBe(true);
    expect(caps.canProcessOrders).toBe(true);
    expect(caps.channels).toEqual(['table', 'delivery']);
    expect(caps.staffJobRole).toBe('cashier');
  });

  it('maps food_preparer permissions', () => {
    const caps = mapStaffCapabilities({
      permissions: [...FOOD_PREPARER_PERMISSIONS],
      roleName: 'Food preparer',
      roleId: 3,
    });

    expect(caps['orders:view']).toBe(true);
    expect(caps['orders:prepare']).toBe(true);
    expect(caps['orders:confirm']).toBe(false);
    expect(caps['orders:edit_items']).toBe(false);
    expect(caps.canViewKitchen).toBe(true);
    expect(caps.canEditItems).toBe(false);
    expect(caps.channels).toEqual(['table']);
  });

  it('maps custom role permissions', () => {
    const caps = mapStaffCapabilities({
      permissions: [
        'orders:view',
        'orders:confirm',
        'analytics:view',
        'staff:manage',
        'settings:manage',
      ],
      roleName: 'Floor lead',
      roleId: 99,
    });

    expect(caps['orders:confirm']).toBe(true);
    expect(caps['analytics:view']).toBe(true);
    expect(caps['staff:manage']).toBe(true);
    expect(caps['settings:manage']).toBe(true);
    expect(caps['orders:prepare']).toBe(false);
    expect(caps.canViewKitchen).toBe(false);
  });

  it('buildStaffResolvedAuth preserves permissions role metadata', () => {
    const auth = buildStaffResolvedAuth({
      permissions: [...WAITER_PERMISSIONS],
      roleName: 'Waiter',
      roleId: 11,
      legacyRole: 'waiter',
    });

    expect(auth.permissions).toEqual([...WAITER_PERMISSIONS]);
    expect(auth.roleName).toBe('Waiter');
    expect(auth.roleId).toBe(11);
    expect(auth.staffJobRole).toBe('waiter');
    expect(auth.capabilities['orders:view']).toBe(true);
  });

  it('fixtures produce expected role shapes', () => {
    expect(waiterAuth().capabilities['orders:deliver']).toBe(false);
    expect(cashierAuth().capabilities['delivery:view']).toBe(true);
    expect(foodPreparerAuth().capabilities.canViewKitchen).toBe(true);
    expect(
      authFromPermissions(['orders:view', 'orders:complete']).capabilities[
        'orders:complete'
      ],
    ).toBe(true);
  });
});
