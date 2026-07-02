import { Response } from 'express';
import { AssetUrlService } from '../../infrastructure/storage/asset-url.service';
import { EnsHttpResult } from '../../infrastructure/ens-backend/ens-http.service';
export declare const STAFF_ORDER_PRESENTER_HEADER = "X-Staff-Order-Presenter";
export declare const STAFF_ORDER_PRESENTER_VERSION = "v1";
export declare const STAFF_ORDER_ENRICHMENT_HEADER = "X-Staff-Order-Enrichment";
export declare const STAFF_JOB_ROLE_HEADER = "X-Staff-Job-Role";
export declare function sendProxyResponse(res: Response, result: EnsHttpResult, assetUrlService: AssetUrlService, extraHeaders?: Record<string, string>): void;
