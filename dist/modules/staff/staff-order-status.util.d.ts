export type StaffOrderStatus = 'pending' | 'confirmed' | 'cancelled' | 'prepared' | 'delivered';
export declare function normalizeStaffOrderStatus(raw: unknown): StaffOrderStatus;
export declare function resolveLatestOrderStatus(actions?: Array<{
    status?: string;
}> | null, order?: {
    status?: string;
} | null): StaffOrderStatus;
export declare function resolveListEntryStatus(entry: {
    actionDetails?: Array<{
        status?: string;
    }> | null;
    status?: string | null;
}): StaffOrderStatus;
export declare function orderStatusFromAction(action: string): StaffOrderStatus;
export declare function isActiveStaffOrderStatus(status: StaffOrderStatus): boolean;
export declare function isHistoryStaffOrderStatus(status: StaffOrderStatus): boolean;
export declare function staffOrderStatusLifecycleRank(status: StaffOrderStatus): number;
export declare function preferAuthoritativeLifecycleStatus(primary: StaffOrderStatus, secondary: StaffOrderStatus): StaffOrderStatus;
export declare const STAFF_ORDER_STATUS_LABELS: Record<StaffOrderStatus, {
    en: string;
    ar: string;
}>;
export declare const STAFF_DELIVERY_ORDER_STATUS_LABELS: Record<StaffOrderStatus, {
    en: string;
    ar: string;
}>;
