import {
  entryCreatedAtIsoDate,
  filterEntriesByDateRange,
  inclusiveHistoryDayCount,
  isUnifiedHistoryDateRangeAllowed,
  paginatePresentedEntries,
  parseIsoDateParam,
  resolveChannelHistoryDateRange,
  resolveTableHistoryDateRange,
  resolveUnifiedHistoryDateRange,
  resolveUnifiedHistoryMaxRangeDays,
  todayIsoDateInTimeZone,
  UNIFIED_HISTORY_MAX_RANGE_DAYS_DEFAULT,
  unifiedHistoryPeriodTooLargeMessage,
  venueTodayIsoDate,
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
    requestKind: 'order',
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
    createdAt: '2026-07-02T10:00:00.000Z',
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

describe('staff-table-history-filters.util', () => {
  const prevEnv = process.env.STAFF_HISTORY_MAX_RANGE_DAYS;

  afterEach(() => {
    if (prevEnv === undefined) {
      delete process.env.STAFF_HISTORY_MAX_RANGE_DAYS;
    } else {
      process.env.STAFF_HISTORY_MAX_RANGE_DAYS = prevEnv;
    }
  });

  it('parseIsoDateParam accepts YYYY-MM-DD', () => {
    expect(parseIsoDateParam('2026-07-02')).toBe('2026-07-02');
    expect(parseIsoDateParam('bad')).toBeNull();
  });

  it('resolveTableHistoryDateRange defaults to today for table history', () => {
    const range = resolveTableHistoryDateRange({}, 'history', 'table');
    expect(range).not.toBeNull();
    expect(range!.dateFrom).toBe(range!.dateTo);
  });

  it('resolveTableHistoryDateRange returns null for active', () => {
    expect(resolveTableHistoryDateRange({}, 'active', 'table')).toBeNull();
  });

  it('resolveChannelHistoryDateRange defaults for delivery history', () => {
    const range = resolveChannelHistoryDateRange({}, 'history', 'delivery');
    expect(range).not.toBeNull();
    expect(range!.dateFrom).toBe(range!.dateTo);
    expect(range!.dateFrom).toBe(venueTodayIsoDate());
  });

  it('resolveChannelHistoryDateRange returns null for active', () => {
    expect(
      resolveChannelHistoryDateRange({}, 'active', 'table'),
    ).toBeNull();
  });

  it('resolveUnifiedHistoryDateRange defaults to venue today', () => {
    const range = resolveUnifiedHistoryDateRange({});
    expect(range.dateFrom).toBe(range.dateTo);
    expect(range.dateFrom).toBe(venueTodayIsoDate());
  });

  it('resolveUnifiedHistoryDateRange honors explicit range', () => {
    expect(
      resolveUnifiedHistoryDateRange({
        dateFrom: '2026-07-01',
        dateTo: '2026-07-07',
      }),
    ).toEqual({ dateFrom: '2026-07-01', dateTo: '2026-07-07' });
  });

  it('resolveUnifiedHistoryDateRange swaps inverted range', () => {
    expect(
      resolveUnifiedHistoryDateRange({
        dateFrom: '2026-07-10',
        dateTo: '2026-07-01',
      }),
    ).toEqual({ dateFrom: '2026-07-01', dateTo: '2026-07-10' });
  });

  it('todayIsoDateInTimeZone returns YYYY-MM-DD for Asia/Riyadh', () => {
    expect(todayIsoDateInTimeZone('Asia/Riyadh')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('inclusiveHistoryDayCount counts inclusive days', () => {
    expect(inclusiveHistoryDayCount('2026-07-18', '2026-07-24')).toBe(7);
    expect(inclusiveHistoryDayCount('2026-07-24', '2026-07-24')).toBe(1);
  });

  it('resolveUnifiedHistoryMaxRangeDays defaults to 30 and respects env', () => {
    delete process.env.STAFF_HISTORY_MAX_RANGE_DAYS;
    expect(resolveUnifiedHistoryMaxRangeDays()).toBe(
      UNIFIED_HISTORY_MAX_RANGE_DAYS_DEFAULT,
    );
    process.env.STAFF_HISTORY_MAX_RANGE_DAYS = '7';
    expect(resolveUnifiedHistoryMaxRangeDays()).toBe(7);
  });

  it('isUnifiedHistoryDateRangeAllowed enforces max days', () => {
    expect(
      isUnifiedHistoryDateRangeAllowed(
        { dateFrom: '2026-06-25', dateTo: '2026-07-24' },
        30,
      ),
    ).toBe(true);
    expect(
      isUnifiedHistoryDateRangeAllowed(
        { dateFrom: '2026-06-24', dateTo: '2026-07-24' },
        30,
      ),
    ).toBe(false);
  });

  it('unifiedHistoryPeriodTooLargeMessage is staff-friendly', () => {
    expect(unifiedHistoryPeriodTooLargeMessage('en')).toContain(
      'shorter date range',
    );
    expect(unifiedHistoryPeriodTooLargeMessage('ar')).toContain('نطاقاً');
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
    expect(filtered.map((e) => e.staffCallId)).toEqual([2]);
  });

  it('paginatePresentedEntries slices correctly', () => {
    const entries = Array.from({ length: 5 }, (_, i) =>
      mockEntry({ staffCallId: i + 1 }),
    );
    const page = paginatePresentedEntries(entries, 2, 2);
    expect(page.total).toBe(5);
    expect(page.totalPages).toBe(3);
    expect(page.entries.map((e) => e.staffCallId)).toEqual([3, 4]);
  });

  it('entryCreatedAtIsoDate parses ISO timestamps', () => {
    expect(entryCreatedAtIsoDate(mockEntry())).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
