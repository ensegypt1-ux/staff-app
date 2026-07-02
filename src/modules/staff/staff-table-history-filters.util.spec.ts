import {
  entryCreatedAtIsoDate,
  filterEntriesByDateRange,
  paginatePresentedEntries,
  parseIsoDateParam,
  resolveTableHistoryDateRange,
} from './staff-table-history-filters.util';
import { StaffPresentedOrderEntry } from './staff-order-presenter.service';

function mockEntry(
  overrides: Partial<StaffPresentedOrderEntry> = {},
): StaffPresentedOrderEntry {
  return {
    id: '1',
    staffCallId: 1,
    activityLogId: null,
    channel: 'table',
    status: 'delivered',
    statusLabel: { en: 'Delivered', ar: 'تم التسليم' },
    tableNumber: '5',
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
    createdAt: '2026-07-02T10:00:00.000Z',
    actionDetails: [],
    availableActions: [],
    canEditItems: false,
    createdByStaffId: null,
    waitingForCashierApproval: false,
    ...overrides,
  };
}

describe('staff-table-history-filters.util', () => {
  it('parseIsoDateParam accepts YYYY-MM-DD', () => {
    expect(parseIsoDateParam('2026-07-02')).toBe('2026-07-02');
    expect(parseIsoDateParam('bad')).toBeNull();
  });

  it('resolveTableHistoryDateRange defaults to today for table history', () => {
    const range = resolveTableHistoryDateRange(
      {},
      'history',
      'table',
    );
    expect(range).not.toBeNull();
    expect(range!.dateFrom).toBe(range!.dateTo);
  });

  it('resolveTableHistoryDateRange returns null for active', () => {
    expect(
      resolveTableHistoryDateRange({}, 'active', 'table'),
    ).toBeNull();
  });

  it('filterEntriesByDateRange keeps entries in range', () => {
    const entries = [
      mockEntry({ createdAt: '2026-07-01T12:00:00.000Z' }),
      mockEntry({ staffCallId: 2, createdAt: '2026-07-02T12:00:00.000Z' }),
      mockEntry({ staffCallId: 3, createdAt: '2026-07-03T12:00:00.000Z' }),
    ];
    const filtered = filterEntriesByDateRange(entries, {
      dateFrom: '2026-07-02',
      dateTo: '2026-07-02',
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.staffCallId).toBe(2);
  });

  it('entryCreatedAtIsoDate parses ISO timestamps', () => {
    expect(entryCreatedAtIsoDate(mockEntry())).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('paginatePresentedEntries slices correctly', () => {
    const entries = [1, 2, 3, 4, 5].map((id) =>
      mockEntry({ staffCallId: id }),
    );
    const page = paginatePresentedEntries(entries, 2, 2);
    expect(page.entries).toHaveLength(2);
    expect(page.total).toBe(5);
    expect(page.totalPages).toBe(3);
    expect(page.entries[0]!.staffCallId).toBe(3);
  });
});
