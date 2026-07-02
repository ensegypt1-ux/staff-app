import { StaffOrderPresenterService } from './staff-order-presenter.service';

describe('StaffOrderPresenterService', () => {
  const presenter = new StaffOrderPresenterService();

  it('capabilitiesFor enables item editing for waiter and cashier', () => {
    expect(presenter.capabilitiesFor('waiter').canEditItems).toBe(true);
    expect(presenter.capabilitiesFor('cashier').canEditItems).toBe(true);
  });

  it('capabilitiesFor enables history only for cashier', () => {
    expect(presenter.capabilitiesFor('waiter').canViewHistory).toBe(false);
    expect(presenter.capabilitiesFor('cashier').canViewHistory).toBe(true);
  });

  it('canEditItems is true for pending table orders', () => {
    const entry = presenter.presentTableCallRow(
      {
        id: 10,
        status: 'pending',
        tableNumber: '5',
        items: [{ name: 'Tea', quantity: 1, price: 5, total: 5 }],
      },
      'waiter',
    );
    expect(entry!.canEditItems).toBe(true);
    expect(entry!.channel).toBe('table');
  });

  it('canEditItems is true for confirmed table orders for cashier only', () => {
    const waiterEntry = presenter.presentTableCallRow(
      {
        id: 11,
        status: 'confirmed',
        tableNumber: '3',
        items: [],
      },
      'waiter',
    );
    expect(waiterEntry!.canEditItems).toBe(false);

    const cashierEntry = presenter.presentTableCallRow(
      {
        id: 12,
        status: 'confirmed',
        tableNumber: '3',
        items: [],
      },
      'cashier',
    );
    expect(cashierEntry!.canEditItems).toBe(true);
  });

  it('waiter cannot edit after accept on table orders', () => {
    for (const status of ['confirmed', 'prepared'] as const) {
      const entry = presenter.presentTableCallRow(
        {
          id: 12,
          status,
          tableNumber: '1',
          items: [],
        },
        'waiter',
      );
      expect(entry!.canEditItems).toBe(false);
    }
  });

  it('cashier can edit table orders while pending or confirmed', () => {
    for (const status of ['pending', 'confirmed'] as const) {
      const entry = presenter.presentTableCallRow(
        {
          id: 12,
          status,
          tableNumber: '1',
          items: [],
        },
        'cashier',
      );
      expect(entry!.canEditItems).toBe(true);
    }

    const prepared = presenter.presentTableCallRow(
      {
        id: 12,
        status: 'prepared',
        tableNumber: '1',
        items: [],
      },
      'cashier',
    );
    expect(prepared!.canEditItems).toBe(false);
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
        'waiter',
      );
      expect(entry!.canEditItems).toBe(false);
    }
  });

  it('cashier can edit delivery orders while pending or confirmed', () => {
    for (const status of ['pending', 'confirmed'] as const) {
      const entry = presenter.presentListRow(
        {
          id: 99,
          orderId: 20,
          status,
          type: 'delivery',
          items: [],
        },
        'cashier',
        'delivery',
      );
      expect(entry!.canEditItems).toBe(true);
      expect(entry!.channel).toBe('delivery');
    }

    const prepared = presenter.presentListRow(
      {
        id: 99,
        orderId: 20,
        status: 'prepared',
        type: 'delivery',
        items: [],
      },
      'cashier',
      'delivery',
    );
    expect(prepared!.canEditItems).toBe(false);
  });

  it('canEditItems is false for delivery orders for waiter', () => {
    const entry = presenter.presentListRow(
      {
        id: 99,
        orderId: 20,
        status: 'pending',
        type: 'delivery',
        items: [],
      },
      'waiter',
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
      'cashier',
      'delivery',
    );
    expect(entry!.canEditItems).toBe(false);
    expect(entry!.channel).toBe('delivery');
  });

  it('filterByScope history keeps only delivered and cancelled', () => {
    const entries = [
      presenter.presentTableCallRow(
        { id: 1, status: 'delivered', tableNumber: '1', items: [] },
        'waiter',
      )!,
      presenter.presentTableCallRow(
        { id: 2, status: 'cancelled', tableNumber: '2', items: [] },
        'waiter',
      )!,
      presenter.presentTableCallRow(
        { id: 3, status: 'prepared', tableNumber: '3', items: [] },
        'waiter',
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
      'cashier',
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
      'cashier',
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
      'cashier',
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
      'cashier',
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
      'cashier',
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
      'waiter',
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
