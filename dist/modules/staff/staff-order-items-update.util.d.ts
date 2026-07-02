import { EnsHttpResult } from '../../infrastructure/ens-backend/ens-http.service';
import { StaffOrderStatus } from './staff-order-status.util';
export declare function isUpstreamItemsNotEditable(result: EnsHttpResult): boolean;
export declare function shouldRetryPreparedItemsWithPut(status: StaffOrderStatus, patchResult: EnsHttpResult): boolean;
