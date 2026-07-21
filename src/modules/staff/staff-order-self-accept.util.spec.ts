import {
  applyStaffOrderSelfAcceptRules,
  shouldBlockStaffSelfAccept,
} from './staff-order-self-accept.util';
import { StaffPresentedOrderEntry } from './staff-order-presenter.service';
import {
  authFromPermissions,
  cashierAuth,
  waiterAuth,
} from './staff-auth.fixtures';

function baseEntry(
  overrides: Partial<StaffPresentedOrderEntry> = {},
): StaffPresentedOrderEntry {
  return {
    id: '1',
    staffCallId: 10,
    activityLogId: null,
    channel: 'table',
    requestKind: 'order',
    status: 'pending',
    statusLabel: { en: 'Pending', ar: 'قيد الانتظار' },
    tableNumber: '1',
    customerName: null,
    customerPhone: null,
    customerAddress: null,
    orderNotes: null,
    governorateId: null,
    governorateNameAr: null,
    governorateNameEn: null,
    itemsSubtotal: null,
    taxAmount: null,
    serviceAmount: null,
    deliveryFee: null,
    items: [],
    itemCount: 0,
    totalPrice: 0,
    createdAt: null,
    actionDetails: [],
    availableActions: [
      {
        action: 'TABLE_CALL_CONFIRMED',
        label: { en: 'Accept', ar: 'قبول' },
      },
      {
        action: 'TABLE_CALL_CANCELLED',
        label: { en: 'Reject', ar: 'رفض' },
      },
    ],
    canEditItems: true,
    pendingGuestAddition: false,
    pendingBillRequest: false,
    createdByStaffId: null,
    waitingForCashierApproval: false,
    ...overrides,
  };
}

describe('shouldBlockStaffSelfAccept', () => {
  it('blocks confirm-without-deliver on own staff-created pending table order', () => {
    expect(
      shouldBlockStaffSelfAccept({
        channel: 'table',
        status: 'pending',
        createdByStaffId: 77,
        auth: waiterAuth(),
        currentStaffId: 77,
      }),
    ).toBe(true);
  });

  it('does not block when orders:deliver is present (cashier shape)', () => {
    expect(
      shouldBlockStaffSelfAccept({
        channel: 'table',
        status: 'pending',
        createdByStaffId: 77,
        auth: cashierAuth(),
        currentStaffId: 77,
      }),
    ).toBe(false);
  });

  it('does not block guest orders without creator id', () => {
    expect(
      shouldBlockStaffSelfAccept({
        channel: 'table',
        status: 'pending',
        createdByStaffId: null,
        auth: waiterAuth(),
        currentStaffId: 77,
      }),
    ).toBe(false);
  });

  it('custom confirm+deliver is not blocked', () => {
    const auth = authFromPermissions([
      'orders:view',
      'orders:confirm',
      'orders:deliver',
    ]);
    expect(
      shouldBlockStaffSelfAccept({
        channel: 'table',
        status: 'pending',
        createdByStaffId: 5,
        auth,
        currentStaffId: 5,
      }),
    ).toBe(false);
  });
});

describe('applyStaffOrderSelfAcceptRules', () => {
  it('removes accept action and sets waiting flag for creator without deliver', () => {
    const result = applyStaffOrderSelfAcceptRules(baseEntry(), {
      auth: waiterAuth(),
      currentStaffId: 77,
      createdByStaffId: 77,
    });

    expect(result.waitingForCashierApproval).toBe(true);
    expect(result.createdByStaffId).toBe(77);
    expect(result.availableActions.map((a) => a.action)).toEqual([
      'TABLE_CALL_CANCELLED',
    ]);
    expect(result.canEditItems).toBe(true);
  });

  it('leaves accept for other staff on staff-created orders', () => {
    const result = applyStaffOrderSelfAcceptRules(baseEntry(), {
      auth: waiterAuth(),
      currentStaffId: 99,
      createdByStaffId: 77,
    });

    expect(result.waitingForCashierApproval).toBe(false);
    expect(result.availableActions.map((a) => a.action)).toContain(
      'TABLE_CALL_CONFIRMED',
    );
  });
});
