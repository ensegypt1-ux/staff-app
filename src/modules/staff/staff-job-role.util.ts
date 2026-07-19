export type StaffJobRole = 'waiter' | 'cashier' | 'unknown';

export function normalizeStaffJobRole(raw: unknown): StaffJobRole {
  const value = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (value === 'cashier' || value === 'casher') return 'cashier';
  if (value === 'waiter') return 'waiter';
  return 'unknown';
}
