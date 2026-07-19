import { StaffMappedCapabilities, StaffResolvedAuth } from './staff-capability.mapper';
import { StaffOrderChannel } from './staff-order-channel.util';
import { StaffOrderStatus } from './staff-order-status.util';
type AuthCaps = StaffResolvedAuth | StaffMappedCapabilities;
export declare function resolveCanEditItems(channel: StaffOrderChannel, auth: AuthCaps, status: StaffOrderStatus): boolean;
export {};
