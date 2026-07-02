import { applyStaffOrderSelfAcceptRules, shouldBlockWaiterSelfAccept } from './staff-order-self-accept.util';
import { StaffPresentedOrderEntry } from './staff-order-presenter.service';

function baseEntry(
  overrides: Partial<StaffPresentedOrderEntry> = {},
): StaffPresentedOrderEntry {
  return {
    id: '1',
    staffCallId: 10,
    activityLogId: null,
    channel: 'table',
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
    createdByStaffId: null,
    waitingForCashierApproval: false,
    ...overrides,
  };
}

describe('shouldBlockWaiterSelfAccept', () => {
  it('blocks waiter accepting own staff-created pending table order', () => {
    expect(
      shouldBlockWaiterSelfAccept({
        channel: 'table',
        status: 'pending',
        createdByStaffId: 77,
        role: 'waiter',
        currentStaffId: 77,
      }),
    ).toBe(true);
  });

  it('does not block cashier on same order', () => {
    expect(
      shouldBlockWaiterSelfAccept({
        channel: 'table',
        status: 'pending',
        createdByStaffId: 77,
        role: 'cashier',
        currentStaffId: 78,
      }),
    ).toBe(false);
  });

  it('does not block guest orders without creator id', () => {
    expect(
      shouldBlockWaiterSelfAccept({
        channel: 'table',
        status: 'pending',
        createdByStaffId: null,
        role: 'waiter',
        currentStaffId: 77,
      }),
    ).toBe(false);
  });
});

describe('applyStaffOrderSelfAcceptRules', () => {
  it('removes accept action and sets waiting flag for creator waiter', () => {
    const result = applyStaffOrderSelfAcceptRules(baseEntry(), {
      role: 'waiter',
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

  it('leaves accept for other waiters on staff-created orders', () => {
    const result = applyStaffOrderSelfAcceptRules(baseEntry(), {
      role: 'waiter',
      currentStaffId: 99,
      createdByStaffId: 77,
    });

    expect(result.waitingForCashierApproval).toBe(false);
    expect(result.availableActions.map((a) => a.action)).toContain(
      'TABLE_CALL_CONFIRMED',
    );
  });
});
