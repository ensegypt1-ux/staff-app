import {
  activityLogRowNeedsAttention,
  attentionSortRank,
  countAttentionEntries,
  countTableAttentionAcrossSources,
  entryNeedsAttention,
  isMergeableServiceTableCall,
  parseStaffRequestKind,
  resolveStaffCallIdFromListRow,
  sortTableEntriesByAttention,
} from './staff-order-attention.util';
import { StaffPresentedOrderEntry } from './staff-order-presenter.service';

function entry(
  overrides: Partial<StaffPresentedOrderEntry> = {},
): StaffPresentedOrderEntry {
  return {
    id: '1',
    staffCallId: 1,
    activityLogId: null,
    channel: 'table',
    requestKind: 'order',
    status: 'confirmed',
    statusLabel: { en: 'Accepted', ar: 'مقبول' },
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
    taxPercent: null,
    taxEnabled: null,
    serviceAmount: null,
    servicePercent: null,
    serviceEnabled: null,
    deliveryFee: null,
    items: [],
    itemCount: 0,
    totalPrice: 0,
    createdAt: '2026-07-20T10:00:00.000Z',
    actionDetails: [],
    availableActions: [],
    canEditItems: false,
    pendingGuestAddition: false,
    pendingBillRequest: false,
    createdByStaffId: null,
    waitingForCashierApproval: false,
    ...overrides,
  };
}

describe('staff-order-attention.util', () => {
  it('parseStaffRequestKind defaults to order', () => {
    expect(parseStaffRequestKind(undefined)).toBe('order');
    expect(parseStaffRequestKind('WAITER')).toBe('waiter');
    expect(parseStaffRequestKind('bill')).toBe('bill');
  });

  it('isMergeableServiceTableCall only pending waiter/bill', () => {
    expect(isMergeableServiceTableCall({ requestKind: 'waiter' })).toBe(true);
    expect(
      isMergeableServiceTableCall({
        requestKind: 'waiter',
        status: 'pending',
      }),
    ).toBe(true);
    expect(
      isMergeableServiceTableCall({
        requestKind: 'waiter',
        status: 'confirmed',
      }),
    ).toBe(false);
    expect(isMergeableServiceTableCall({ requestKind: 'bill' })).toBe(true);
    expect(isMergeableServiceTableCall({ requestKind: 'order' })).toBe(false);
    expect(isMergeableServiceTableCall({})).toBe(false);
  });

  it('entryNeedsAttention matches Web + pending service rows only', () => {
    expect(entryNeedsAttention(entry({ status: 'pending' }))).toBe(true);
    expect(
      entryNeedsAttention(
        entry({ status: 'confirmed', pendingGuestAddition: true }),
      ),
    ).toBe(true);
    expect(
      entryNeedsAttention(
        entry({ status: 'confirmed', pendingBillRequest: true }),
      ),
    ).toBe(true);
    expect(
      entryNeedsAttention(
        entry({ status: 'pending', requestKind: 'waiter' }),
      ),
    ).toBe(true);
    expect(
      entryNeedsAttention(
        entry({ status: 'confirmed', requestKind: 'waiter' }),
      ),
    ).toBe(false);
    expect(
      entryNeedsAttention(
        entry({ status: 'confirmed', requestKind: 'bill' }),
      ),
    ).toBe(false);
    expect(
      entryNeedsAttention(entry({ status: 'confirmed', requestKind: 'order' })),
    ).toBe(false);
  });

  it('sorts bill → guest → waiter → pending → rest, then createdAt desc', () => {
    const sorted = sortTableEntriesByAttention([
      entry({
        id: 'rest',
        staffCallId: 5,
        status: 'confirmed',
        createdAt: '2026-07-20T12:00:00.000Z',
      }),
      entry({
        id: 'pending',
        staffCallId: 4,
        status: 'pending',
        createdAt: '2026-07-20T11:00:00.000Z',
      }),
      entry({
        id: 'waiter',
        staffCallId: 3,
        requestKind: 'waiter',
        status: 'pending',
        createdAt: '2026-07-20T10:00:00.000Z',
      }),
      entry({
        id: 'guest',
        staffCallId: 2,
        status: 'confirmed',
        pendingGuestAddition: true,
        createdAt: '2026-07-20T09:00:00.000Z',
      }),
      entry({
        id: 'bill',
        staffCallId: 1,
        status: 'confirmed',
        pendingBillRequest: true,
        createdAt: '2026-07-20T08:00:00.000Z',
      }),
    ]);

    expect(sorted.map((e) => e.id)).toEqual([
      'bill',
      'guest',
      'waiter',
      'pending',
      'rest',
    ]);
    expect(attentionSortRank(sorted[0]!)).toBe(0);
    expect(countAttentionEntries(sorted)).toBe(4);
  });

  it('activityLogRowNeedsAttention covers pending/guest/bill/waiter', () => {
    expect(
      activityLogRowNeedsAttention({ status: 'pending', orderId: 1 }),
    ).toBe(true);
    expect(
      activityLogRowNeedsAttention({
        status: 'confirmed',
        pendingGuestAddition: true,
        orderId: 2,
      }),
    ).toBe(true);
    expect(
      activityLogRowNeedsAttention({
        status: 'confirmed',
        pendingBillRequest: true,
        orderId: 3,
      }),
    ).toBe(true);
    expect(
      activityLogRowNeedsAttention({
        status: 'pending',
        requestKind: 'waiter',
        id: 4,
      }),
    ).toBe(true);
    expect(
      activityLogRowNeedsAttention({
        status: 'confirmed',
        requestKind: 'waiter',
        id: 41,
      }),
    ).toBe(false);
    expect(
      activityLogRowNeedsAttention({
        status: 'confirmed',
        requestKind: 'order',
        orderId: 5,
      }),
    ).toBe(false);
  });

  it('resolves status from actionDetails when top-level status is missing', () => {
    // Regression: finished/completed activity-log rows often omit top-level status.
    expect(
      activityLogRowNeedsAttention({
        orderId: 10,
        actionDetails: [
          { status: 'pending' },
          { status: 'confirmed' },
          { status: 'prepared' },
          { action: 'TABLE_CALL_COMPLETED', status: 'delivered' },
        ],
      }),
    ).toBe(false);

    expect(
      activityLogRowNeedsAttention({
        orderId: 11,
        actionDetails: [
          { status: 'pending' },
          { status: 'confirmed' },
          { status: 'prepared' },
        ],
      }),
    ).toBe(false);

    expect(
      activityLogRowNeedsAttention({
        orderId: 12,
        actionDetails: [{ status: 'cancelled' }],
      }),
    ).toBe(false);

    expect(
      activityLogRowNeedsAttention({
        orderId: 13,
        actionDetails: [{ status: 'pending' }],
      }),
    ).toBe(true);

    // Confirmed via timeline still counts when guest/bill attention remains.
    expect(
      activityLogRowNeedsAttention({
        orderId: 14,
        pendingGuestAddition: true,
        actionDetails: [
          { status: 'pending' },
          { status: 'confirmed' },
        ],
      }),
    ).toBe(true);
  });

  it('never treats missing top-level status as pending when timeline is closed', () => {
    const count = countTableAttentionAcrossSources({
      activityLogRows: [
        {
          id: 1,
          orderId: 1,
          // no top-level status — previously incorrectly counted as pending
          actionDetails: [
            { status: 'pending' },
            { status: 'confirmed' },
            { status: 'prepared' },
            { action: 'TABLE_CALL_COMPLETED', status: 'delivered' },
          ],
        },
        {
          id: 2,
          orderId: 2,
          actionDetails: [{ status: 'pending' }],
        },
      ],
      serviceTableCallRows: [],
    });
    expect(count).toBe(1);
  });

  it('resolveStaffCallIdFromListRow prefers orderId', () => {
    expect(resolveStaffCallIdFromListRow({ id: 99, orderId: 42 })).toBe(42);
    expect(resolveStaffCallIdFromListRow({ id: 7 })).toBe(7);
  });

  it('countTableAttentionAcrossSources includes waiter/bill/guest/order attention', () => {
    const count = countTableAttentionAcrossSources({
      activityLogRows: [
        { id: 101, orderId: 1, status: 'pending' },
        {
          id: 102,
          orderId: 2,
          status: 'confirmed',
          pendingGuestAddition: true,
        },
        {
          id: 103,
          orderId: 3,
          status: 'confirmed',
          pendingBillRequest: true,
        },
        { id: 104, orderId: 4, status: 'confirmed' },
        { id: 105, orderId: 5, status: 'prepared' },
      ],
      serviceTableCallRows: [
        { id: 6, requestKind: 'waiter', status: 'pending' },
        { id: 7, requestKind: 'bill', status: 'pending' },
        { id: 8, requestKind: 'order', status: 'pending' },
      ],
    });

    // pending order + guest + bill flag + waiter + orphan bill = 5
    // confirmed/prepared food rows and non-mergeable order service row excluded
    expect(count).toBe(5);
  });

  it('pendingCount is independent of page slicing', () => {
    const allAttentionRows = [
      { id: 1, orderId: 1, status: 'pending' },
      { id: 2, orderId: 2, status: 'pending' },
      { id: 3, orderId: 3, status: 'pending' },
      {
        id: 4,
        orderId: 4,
        status: 'confirmed',
        pendingGuestAddition: true,
      },
      {
        id: 5,
        orderId: 5,
        status: 'confirmed',
        pendingBillRequest: true,
      },
    ];
    const page1 = allAttentionRows.slice(0, 2);
    const page2 = allAttentionRows.slice(2, 4);

    const full = countTableAttentionAcrossSources({
      activityLogRows: allAttentionRows,
      serviceTableCallRows: [{ id: 90, requestKind: 'waiter' }],
    });
    const fromPage1 = countTableAttentionAcrossSources({
      activityLogRows: page1,
      serviceTableCallRows: [{ id: 90, requestKind: 'waiter' }],
    });
    const fromPage2 = countTableAttentionAcrossSources({
      activityLogRows: page2,
      serviceTableCallRows: [{ id: 90, requestKind: 'waiter' }],
    });

    expect(full).toBe(6);
    // Page-scoped counts differ — proving why the flow must scan all rows.
    expect(fromPage1).toBe(3);
    expect(fromPage2).toBe(3);
    expect(fromPage1).not.toBe(full);
    expect(fromPage2).not.toBe(full);
  });

  it('does not double-count service rows already present in activity-logs', () => {
    const count = countTableAttentionAcrossSources({
      activityLogRows: [
        { id: 200, orderId: 10, status: 'pending', requestKind: 'waiter' },
      ],
      serviceTableCallRows: [
        { id: 10, requestKind: 'waiter', status: 'pending' },
      ],
    });
    expect(count).toBe(1);
  });

  it('browse filters are not applied by the attention counter itself', () => {
    // Rows that would be excluded by date/q filters still count when passed in.
    const count = countTableAttentionAcrossSources({
      activityLogRows: [
        {
          id: 1,
          orderId: 1,
          status: 'pending',
          tableNumber: 'A1',
          createdAt: '2020-01-01T00:00:00.000Z',
        },
        {
          id: 2,
          orderId: 2,
          status: 'confirmed',
          pendingGuestAddition: true,
          tableNumber: 'Z9',
          createdAt: '2019-06-01T00:00:00.000Z',
        },
      ],
      serviceTableCallRows: [],
    });
    expect(count).toBe(2);
  });

  it('does not count undedupable activity-log rows with missing ids', () => {
    const count = countTableAttentionAcrossSources({
      activityLogRows: [
        { status: 'pending' },
        { id: 0, orderId: 0, status: 'pending' },
        { id: 11, orderId: 11, status: 'pending' },
      ],
      serviceTableCallRows: [{ requestKind: 'waiter', status: 'pending' }],
    });
    // Only the row with a real staffCallId counts; service row without id skipped.
    expect(count).toBe(1);
  });
});
