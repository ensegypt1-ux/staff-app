import { Response } from 'express';
import { AssetUrlService } from '../../infrastructure/storage/asset-url.service';
import { EnsHttpResult } from '../../infrastructure/ens-backend/ens-http.service';

export const STAFF_ORDER_PRESENTER_HEADER = 'X-Staff-Order-Presenter';
export const STAFF_ORDER_PRESENTER_VERSION = 'v1';
export const STAFF_ORDER_ENRICHMENT_HEADER = 'X-Staff-Order-Enrichment';
export const STAFF_JOB_ROLE_HEADER = 'X-Staff-Job-Role';

export function sendProxyResponse(
  res: Response,
  result: EnsHttpResult,
  assetUrlService: AssetUrlService,
  extraHeaders?: Record<string, string>,
): void {
  if (extraHeaders) {
    for (const [key, value] of Object.entries(extraHeaders)) {
      res.setHeader(key, value);
    }
  }
  const body = assetUrlService.rewriteDeep(result.data);
  res.status(result.status).json(body);
}
