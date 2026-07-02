import { Request } from 'express';
export type StaffJobRole = 'waiter' | 'cashier' | 'unknown';
export declare function normalizeStaffJobRole(raw: unknown): StaffJobRole;
export declare function staffJobRoleFromRequest(req: Request): StaffJobRole;
