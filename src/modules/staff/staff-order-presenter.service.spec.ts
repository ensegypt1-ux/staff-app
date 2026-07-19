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
    expect(entry!.availableActions.map((a) => a.action)).toEqual([
      'TABLE_CALL_CONFIRMED',
    ]);
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

  it('cashier can edit delivery orders while pending, confirmed, or prepared', () => {
    for (const status of ['pending', 'confirmed', 'prepared'] as const) {
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

  it('filterByScope history keeps only delivered and cancelled', () => {
    const entries = [
      presenter.presentTableCallRow(
        { id: 1, status: 'delivered', tableNumber: '1', items: [] },
        waiterAuth(),
      )!,
      presenter.presentTableCallRow(
        { id: 2, status: 'cancelled', tableNumber: '2', items: [] },
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
});
