import { StaffOrderPresenterService } from './staff-order-presenter.service';
import {
  cashierAuth,
  foodPreparerAuth,
  waiterAuth,
} from './staff-auth.fixtures';

describe('StaffOrderPresenterService', () => {
  const presenter = new StaffOrderPresenterService();

  it('capabilities response enables item editing from orders:edit_items', () => {
    expect(presenter.capabilitiesFor(waiterAuth()).canEditItems).toBe(true);
    expect(presenter.capabilitiesFor(cashierAuth()).canEditItems).toBe(true);
    expect(presenter.capabilitiesFor(foodPreparerAuth()).canEditItems).toBe(
      false,
    );
  });

  it('capabilities enables history from orders:view', () => {
    expect(presenter.capabilitiesFor(waiterAuth()).canViewHistory).toBe(true);
    expect(presenter.capabilitiesFor(cashierAuth()).canViewHistory).toBe(true);
  });

  it('capabilities exposes granular permission flags', () => {
    const waiter = presenter.capabilitiesFor(waiterAuth());
    expect(waiter['orders:view']).toBe(true);
    expect(waiter['orders:prepare']).toBe(false);
    expect(waiter.canViewKitchen).toBe(false);

    const preparer = presenter.capabilitiesFor(foodPreparerAuth());
    expect(preparer['orders:prepare']).toBe(true);
    // Kitchen tab disabled for Web table parity.
    expect(preparer.canViewKitchen).toBe(false);

    const cashier = presenter.capabilitiesFor(cashierAuth());
    expect(cashier['delivery:view']).toBe(true);
    expect(cashier.channels).toEqual(['table', 'delivery']);
  });

  it('canEditItems is true for pending table orders with edit permission', () => {
    const entry = presenter.presentTableCallRow(
      {
        id: 10,
        status: 'pending',
        tableNumber: '5',
        items: [{ name: 'Tea', quantity: 1, price: 5, total: 5 }],
      },
      waiterAuth(),
    );
    expect(entry!.canEditItems).toBe(true);
    expect(entry!.channel).toBe('table');
  });

  it('canEditItems is true for confirmed table orders when orders:edit_items', () => {
    const waiterEntry = presenter.presentTableCallRow(
      {
        id: 11,
        status: 'confirmed',
        tableNumber: '3',
        items: [],
      },
      waiterAuth(),
    );
    expect(waiterEntry!.canEditItems).toBe(true);

    const cashierEntry = presenter.presentTableCallRow(
      {
        id: 12,
        status: 'confirmed',
        tableNumber: '3',
        items: [],
      },
      cashierAuth(),
    );
    expect(cashierEntry!.canEditItems).toBe(true);
  });

  it('food_preparer cannot edit items', () => {
    const entry = presenter.presentTableCallRow(
      {
        id: 12,
        status: 'pending',
        tableNumber: '1',
        items: [],
      },
      foodPreparerAuth(),
    );
    expect(entry!.canEditItems).toBe(false);
  });

  it('cashier can edit table orders while pending, confirmed, or prepared', () => {
    for (const status of ['pending', 'confirmed', 'prepared'] as const) {
      const entry = presenter.presentTableCallRow(
        {
          id: 12,
          status,
          tableNumber: '1',
          items: [],
        },
        cashierAuth(),
      );
      expect(entry!.canEditItems).toBe(true);
    }
  });

  it('exposes pendingGuestAddition and Finish actions for table', () => {
    const entry = presenter.presentListRow(
      {
        id: 50,
        orderId: 12,
        status: 'confirmed',
        type: 'table',
        pendingGuestAddition: true,
        pendingBillRequest: true,
        items: [],
      },
      cashierAuth(),
      'table',
    );
    expect(entry!.pendingGuestAddition).toBe(true);
    expect(entry!.pendingBillRequest).toBe(true);
    expect(entry!.requestKind).toBe('order');
    expect(entry!.availableActions.map((a) => a.action)).toEqual([
      'TABLE_CALL_CONFIRMED',
    ]);
  });

  it('presents waiter service rows with Done only and no edit', () => {
    const entry = presenter.presentListRow(
      {
        id: 88,
        orderId: 88,
        tableNumber: '7',
        requestKind: 'waiter',
        status: 'pending',
        items: [{ name: 'ignored', quantity: 1, price: 1 }],
        at: '2026-07-20T10:00:00.000Z',
      },
      waiterAuth(),
      'table',
    );
    expect(entry!.requestKind).toBe('waiter');
    expect(entry!.items).toEqual([]);
    expect(entry!.canEditItems).toBe(false);
    expect(entry!.availableActions.map((a) => a.action)).toEqual([
      'TABLE_CALL_CONFIRMED',
    ]);
  });

  it('confirmed waiter service row has no food lifecycle actions', () => {
    const entry = presenter.presentListRow(
      {
        id: 89,
        orderId: 89,
        tableNumber: '7',
        requestKind: 'waiter',
        status: 'confirmed',
        items: [],
      },
      cashierAuth(),
      'table',
    );
    expect(entry!.availableActions).toEqual([]);
    expect(entry!.canEditItems).toBe(false);
  });

  it('canEditItems is false for delivered and cancelled table orders', () => {
    for (const status of ['delivered', 'cancelled'] as const) {
      const entry = presenter.presentTableCallRow(
        {
          id: 12,
          status,
          tableNumber: '1',
          items: [],
        },
        cashierAuth(),
      );
      expect(entry!.canEditItems).toBe(false);
    }
  });

  it('cashier can edit delivery orders while pending or confirmed only', () => {
    for (const status of ['pending', 'confirmed'] as const) {
      const entry = presenter.presentListRow(
        {
          id: 99,
          orderId: 20,
          status,
          type: 'delivery',
          items: [],
        },
        cashierAuth(),
        'delivery',
      );
      expect(entry!.canEditItems).toBe(true);
      expect(entry!.channel).toBe('delivery');
    }
  });

  it('canEditItems is false for prepared delivery orders', () => {
    const entry = presenter.presentListRow(
      {
        id: 99,
        orderId: 20,
        status: 'prepared',
        type: 'delivery',
        items: [],
      },
      cashierAuth(),
      'delivery',
    );
    expect(entry!.canEditItems).toBe(false);
  });

  it('delivery status labels use approved Staff wording', () => {
    const pending = presenter.presentListRow(
      {
        id: 1,
        orderId: 1,
        status: 'pending',
        type: 'delivery',
        items: [],
      },
      cashierAuth(),
      'delivery',
    );
    expect(pending!.statusLabel).toEqual({ en: 'New', ar: 'جديد' });

    const prepared = presenter.presentListRow(
      {
        id: 2,
        orderId: 2,
        status: 'prepared',
        type: 'delivery',
        items: [],
      },
      cashierAuth(),
      'delivery',
    );
    expect(prepared!.statusLabel).toEqual({ en: 'Ready', ar: 'جاهز' });
    expect(prepared!.availableActions[0]?.label).toEqual({
      en: 'Mark as sent out',
      ar: 'تم التسليم للمندوب',
    });

    const delivered = presenter.presentListRow(
      {
        id: 3,
        orderId: 3,
        status: 'delivered',
        type: 'delivery',
        items: [],
      },
      cashierAuth(),
      'delivery',
    );
    expect(delivered!.statusLabel).toEqual({
      en: 'Sent out',
      ar: 'تم الإرسال',
    });
  });

  it('delivery pending accept action uses Accept copy (Web parity)', () => {
    const entry = presenter.presentListRow(
      {
        id: 4,
        orderId: 4,
        status: 'pending',
        type: 'delivery',
        items: [],
      },
      cashierAuth(),
      'delivery',
    );
    expect(entry!.availableActions.map((a) => a.action)).toEqual([
      'TABLE_CALL_CONFIRMED',
      'TABLE_CALL_CANCELLED',
    ]);
    expect(entry!.availableActions[0]?.label).toEqual({
      en: 'Accept',
      ar: 'قبول',
    });
  });

  it('delivery confirmed prepare action uses Mark prepared / تم التحضير', () => {
    const entry = presenter.presentListRow(
      {
        id: 5,
        orderId: 5,
        status: 'confirmed',
        type: 'delivery',
        items: [],
      },
      cashierAuth(),
      'delivery',
    );
    expect(entry!.availableActions.map((a) => a.action)).toEqual([
      'TABLE_CALL_PREPARED',
    ]);
    expect(entry!.availableActions[0]?.label).toEqual({
      en: 'Mark prepared',
      ar: 'تم التحضير',
    });
  });

  it('canEditItems is false for delivery orders without delivery:view', () => {
    const entry = presenter.presentListRow(
      {
        id: 99,
        orderId: 20,
        status: 'pending',
        type: 'delivery',
        items: [],
      },
      waiterAuth(),
      'delivery',
    );
    expect(entry!.canEditItems).toBe(false);
    expect(entry!.channel).toBe('delivery');
  });

  it('canEditItems is false for delivered delivery orders for cashier', () => {
    const entry = presenter.presentListRow(
      {
        id: 99,
        orderId: 20,
        status: 'delivered',
        type: 'delivery',
        items: [],
      },
      cashierAuth(),
      'delivery',
    );
    expect(entry!.canEditItems).toBe(false);
    expect(entry!.channel).toBe('delivery');
  });

  it('filterByScope history keeps archived delivered and cancelled', () => {
    const old = '2020-01-01T00:00:00.000Z';
    const entries = [
      presenter.presentTableCallRow(
        {
          id: 1,
          status: 'delivered',
          tableNumber: '1',
          items: [],
          createdAt: old,
        },
        waiterAuth(),
      )!,
      presenter.presentTableCallRow(
        {
          id: 2,
          status: 'cancelled',
          tableNumber: '2',
          items: [],
          createdAt: old,
        },
        waiterAuth(),
      )!,
      presenter.presentTableCallRow(
        { id: 3, status: 'prepared', tableNumber: '3', items: [] },
        waiterAuth(),
      )!,
    ];
    const history = presenter.filterByScope(entries, 'history');
    expect(history.map((e) => e.status)).toEqual(['delivered', 'cancelled']);
  });

  it('filterByScope active keeps recent terminals within grace', () => {
    const recent = new Date().toISOString();
    const entries = [
      presenter.presentTableCallRow(
        {
          id: 1,
          status: 'delivered',
          tableNumber: '1',
          items: [],
          createdAt: recent,
          actionDetails: [
            { action: 'TABLE_CALL_DELIVERED', time: recent },
          ],
        },
        waiterAuth(),
      )!,
      presenter.presentTableCallRow(
        {
          id: 2,
          status: 'delivered',
          tableNumber: '2',
          items: [],
          createdAt: '2020-01-01T00:00:00.000Z',
          actionDetails: [
            {
              action: 'TABLE_CALL_DELIVERED',
              time: '2020-01-01T00:00:00.000Z',
            },
          ],
        },
        waiterAuth(),
      )!,
      presenter.presentTableCallRow(
        { id: 3, status: 'pending', tableNumber: '3', items: [] },
        waiterAuth(),
      )!,
    ];
    const active = presenter.filterByScope(entries, 'active');
    expect(active.map((e) => e.staffCallId).sort()).toEqual([1, 3]);
  });

  it('applyListScope clears actions and edit for history', () => {
    const entry = presenter.presentTableCallRow(
      {
        id: 10,
        status: 'pending',
        tableNumber: '5',
        items: [],
      },
      cashierAuth(),
    )!;
    const archived = presenter.applyListScope(entry, 'history');
    expect(archived.availableActions).toEqual([]);
    expect(archived.canEditItems).toBe(false);
  });

  it('mergeCallHydration preserves richer activity-log actionDetails', () => {
    const base = presenter.presentListRow(
      {
        id: 501,
        orderId: 42,
        status: 'prepared',
        tableNumber: '7',
        type: 'table',
        items: [{ name: 'Tea', quantity: 1, price: 5, total: 5 }],
        actionDetails: [
          {
            action: 'TABLE_CALL_CONFIRMED',
            status: 'confirmed',
            waiterName: 'Alice',
            time: '2026-01-01T10:00:00Z',
          },
          {
            action: 'TABLE_CALL_PREPARED',
            status: 'prepared',
            waiterName: 'Bob',
            time: '2026-01-01T10:05:00Z',
          },
        ],
      },
      cashierAuth(),
      'table',
    )!;

    const merged = presenter.mergeCallHydration(
      base,
      {
        id: 42,
        status: 'prepared',
        tableNumber: '7',
        items: [{ name: 'Tea', quantity: 1, price: 5, total: 5 }],
        at: '2026-01-01T10:05:00Z',
      },
      cashierAuth(),
    );

    expect(merged.actionDetails).toEqual(base.actionDetails);
    expect(merged.tableNumber).toBe('7');
    expect(merged.status).toBe('prepared');
  });

  it('mergeCallHydration does not regress confirmed to pending overlay', () => {
    const base = presenter.presentListRow(
      {
        id: 502,
        orderId: 99,
        // Express activity-logs often omit top-level status; history carries it.
        actionDetails: [
          {
            action: 'TABLE_CALL_CREATED',
            status: 'pending',
            waiterName: '',
            time: '2026-01-01T09:00:00Z',
          },
          {
            action: 'TABLE_CALL_CONFIRMED',
            status: 'confirmed',
            waiterName: 'Cashier',
            time: '2026-01-01T09:01:00Z',
          },
        ],
        tableNumber: '12',
        type: 'table',
        items: [{ name: 'Coffee', quantity: 1, price: 3, total: 3 }],
      },
      cashierAuth(),
      'table',
    )!;
    expect(base.status).toBe('confirmed');

    const merged = presenter.mergeCallHydration(
      base,
      {
        id: 99,
        status: 'pending',
        tableNumber: '12',
        items: [{ name: 'Coffee', quantity: 1, price: 3, total: 3 }],
        at: '2026-01-01T09:00:00Z',
      },
      cashierAuth(),
    );

    expect(merged.status).toBe('confirmed');
    expect(merged.statusLabel).toEqual({ en: 'Accepted', ar: 'مقبول' });
    expect(merged.availableActions.map((a) => a.action)).toEqual([
      'TABLE_CALL_COMPLETED',
    ]);
    expect(merged.availableActions).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'TABLE_CALL_CONFIRMED' }),
      ]),
    );
  });

  it('presentDetail and presentListRow expose action field on actionDetails', () => {
    const listEntry = presenter.presentListRow(
      {
        id: 88,
        orderId: 55,
        status: 'confirmed',
        tableNumber: '3',
        type: 'table',
        items: [],
        actionDetails: [
          {
            action: 'TABLE_CALL_CONFIRMED',
            status: 'confirmed',
            waiterName: 'Alice',
            time: '2026-01-01T10:00:00Z',
          },
        ],
      },
      cashierAuth(),
      'table',
    )!;

    const detailEntry = presenter.presentDetail(
      {
        id: 88,
        orderId: 55,
        tableNumber: '3',
        type: 'table',
        actions: [
          {
            action: 'TABLE_CALL_CONFIRMED',
            status: 'confirmed',
            waiterName: 'Alice',
            time: '2026-01-01T10:00:00Z',
          },
        ],
        order: { status: 'confirmed' },
        items: [],
      },
      cashierAuth(),
    )!;

    expect(listEntry.actionDetails[0]?.action).toBe('TABLE_CALL_CONFIRMED');
    expect(detailEntry.actionDetails).toEqual(listEntry.actionDetails);
  });

  it('enrichEntriesActionDetails fills sparse table-call rows from activity logs', () => {
    const sparse = presenter.presentTableCallRow(
      {
        id: 77,
        status: 'confirmed',
        tableNumber: '2',
        items: [],
      },
      waiterAuth(),
    )!;

    const enriched = presenter.enrichEntriesActionDetails([sparse], [
      {
        orderId: 77,
        actionDetails: [
          {
            action: 'TABLE_CALL_CONFIRMED',
            status: 'confirmed',
            waiterName: 'Alice',
            time: '2026-01-01T10:00:00Z',
          },
        ],
      },
    ]);

    expect(enriched[0]?.actionDetails[0]?.waiterName).toBe('Alice');
    expect(enriched[0]?.actionDetails[0]?.action).toBe('TABLE_CALL_CONFIRMED');
  });

  it('exposes Express delivery charge fields on list rows', () => {
    const entry = presenter.presentListRow(
      {
        id: 200,
        orderId: 55,
        type: 'delivery',
        status: 'pending',
        orderNotes: 'Ring twice',
        itemsSubtotal: 10,
        taxAmount: 1,
        taxPercent: 10,
        taxEnabled: true,
        serviceAmount: 0.5,
        servicePercent: 5,
        serviceEnabled: true,
        deliveryFee: 2,
        totalPrice: 13.5,
        items: [{ name: 'Burger', quantity: 1, price: 10, notes: 'No onion' }],
      },
      cashierAuth(),
      'delivery',
    );
    expect(entry!.orderNotes).toBe('Ring twice');
    expect(entry!.itemsSubtotal).toBe(10);
    expect(entry!.taxAmount).toBe(1);
    expect(entry!.taxPercent).toBe(10);
    expect(entry!.taxEnabled).toBe(true);
    expect(entry!.serviceAmount).toBe(0.5);
    expect(entry!.servicePercent).toBe(5);
    expect(entry!.serviceEnabled).toBe(true);
    expect(entry!.deliveryFee).toBe(2);
    expect(entry!.totalPrice).toBe(13.5);
    expect(entry!.items[0]?.notes).toBe('No onion');
    expect(entry!.availableActions.map((a) => a.action)).toEqual([
      'TABLE_CALL_CONFIRMED',
      'TABLE_CALL_CANCELLED',
    ]);
  });

  it('exposes tax/service percents on table list rows without inventing values', () => {
    const entry = presenter.presentListRow(
      {
        id: 201,
        orderId: 56,
        type: 'table',
        status: 'pending',
        customerName: 'Ali',
        itemsSubtotal: 500,
        taxAmount: 50,
        taxPercent: 10,
        taxEnabled: true,
        serviceAmount: 70,
        servicePercent: 14,
        serviceEnabled: true,
        totalPrice: 620,
        items: [],
      },
      cashierAuth(),
      'table',
    );
    expect(entry!.customerName).toBe('Ali');
    expect(entry!.taxPercent).toBe(10);
    expect(entry!.servicePercent).toBe(14);
    expect(entry!.taxEnabled).toBe(true);
    expect(entry!.serviceEnabled).toBe(true);
  });

  it('leaves tax/service percent null when Express omits them', () => {
    const entry = presenter.presentListRow(
      {
        id: 202,
        orderId: 57,
        type: 'table',
        status: 'pending',
        itemsSubtotal: 100,
        taxAmount: 10,
        totalPrice: 110,
        items: [],
      },
      cashierAuth(),
      'table',
    );
    expect(entry!.taxPercent).toBeNull();
    expect(entry!.servicePercent).toBeNull();
    expect(entry!.taxEnabled).toBeNull();
    expect(entry!.serviceEnabled).toBeNull();
  });
});
