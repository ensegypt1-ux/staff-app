import { parsePublicMenuTablesPayload, parseStaffCallCreateId } from './staff-table-order.util';

describe('staff-table-order.util', () => {
  it('parses active tables from public menu payload', () => {
    const tables = parsePublicMenuTablesPayload({
      success: true,
      data: {
        menu: {
          tables: [
            { id: 2, tableNumber: '10', isActive: true, seats: 4 },
            { id: 1, tableNumber: '2', isActive: true },
            { id: 3, tableNumber: '99', isActive: false },
            { tableNumber: '' },
          ],
        },
      },
    });

    expect(tables.map((t) => t.tableNumber)).toEqual(['2', '10']);
    expect(tables[1]?.seats).toBe(4);
  });

  it('parseStaffCallCreateId reads created call id', () => {
    expect(parseStaffCallCreateId({ ok: true, id: 501 })).toBe(501);
    expect(parseStaffCallCreateId({ ok: true })).toBe(0);
  });
});
