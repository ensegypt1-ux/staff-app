export type StaffOrderChannel = 'table' | 'delivery';
export declare function resolveStaffOrderChannel(raw: Record<string, unknown>, listChannelHint?: StaffOrderChannel): StaffOrderChannel;
export declare function isDeliveryUpstreamRow(raw: Record<string, unknown>): boolean;
