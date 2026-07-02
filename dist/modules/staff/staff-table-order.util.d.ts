export type StaffRestaurantTable = {
    id: number;
    tableNumber: string;
    seats: number | null;
    isActive: boolean;
};
export declare function parsePublicMenuTablesPayload(data: unknown): StaffRestaurantTable[];
export declare function parseStaffCallCreateId(data: unknown): number;
