import { Logger } from '@nestjs/common';
import { EnsHttpResult } from '../../infrastructure/ens-backend/ens-http.service';
type NormalizedStaffError = {
    status: number;
    data: {
        error: string;
        errorAr?: string;
        code: string;
    };
};
export declare function normalizeStaffUpstreamError(result: EnsHttpResult): EnsHttpResult;
export declare function deniedOrderResult(httpStatus: number, payload: NormalizedStaffError['data']): NormalizedStaffError;
export declare function staffHistoryDeniedResult(): EnsHttpResult;
export declare function staffScopeDeniedResult(scope: string): EnsHttpResult;
export declare function logUpstreamDenial(logger: Logger, context: string, upstream: EnsHttpResult): void;
export declare function rejectUpstreamListResult(logger: Logger, context: string, upstream: EnsHttpResult): EnsHttpResult;
export {};
