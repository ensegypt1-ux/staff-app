export type StaffRestaurantTable = {
  id: number;
  tableNumber: string;
  seats: number | null;
  isActive: boolean;
};

export function parsePublicMenuTablesPayload(
  data: unknown,
): StaffRestaurantTable[] {
  if (!data || typeof data !== 'object') return [];

  const root = data as Record<string, unknown>;
  const payload =
    root.data && typeof root.data === 'object'
      ? (root.data as Record<string, unknown>)
      : root;

  const menu =
    payload.menu && typeof payload.menu === 'object'
      ? (payload.menu as Record<string, unknown>)
      : null;
  if (!menu) return [];

  const rawTables = menu.tables;
  if (!Array.isArray(rawTables)) return [];

  const tables: StaffRestaurantTable[] = [];
  for (const row of rawTables) {
    if (!row || typeof row !== 'object') continue;
    const map = row as Record<string, unknown>;
    const tableNumber = String(map.tableNumber ?? map.TableNumber ?? '')
      .trim();
    if (!tableNumber) continue;

    const id = Number(map.id ?? map.Id ?? 0);
    const seatsRaw = map.seats ?? map.Seats;
    const seats =
      seatsRaw === undefined || seatsRaw === null
        ? null
        : Number.isFinite(Number(seatsRaw))
          ? Number(seatsRaw)
          : null;

    const activeRaw = map.isActive ?? map.IsActive ?? map.active ?? map.Active;
    let isActive = true;
    if (typeof activeRaw === 'boolean') {
      isActive = activeRaw;
    } else if (typeof activeRaw === 'number') {
      isActive = activeRaw !== 0;
    }

    tables.push({
      id: Number.isFinite(id) && id > 0 ? id : tables.length + 1,
      tableNumber,
      seats,
      isActive,
    });
  }

  return tables
    .filter((table) => table.isActive)
    .sort((a, b) =>
      a.tableNumber.localeCompare(b.tableNumber, undefined, {
        numeric: true,
        sensitivity: 'base',
      }),
    );
}

export function parseStaffCallCreateId(data: unknown): number {
  if (!data || typeof data !== 'object') return 0;
  const body = data as Record<string, unknown>;
  const id = Number(body.id ?? 0);
  return Number.isFinite(id) && id > 0 ? id : 0;
}
