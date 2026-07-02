import { Request, Response } from 'express';
import { EnsHttpService } from '../../infrastructure/ens-backend/ens-http.service';
import { AssetUrlService } from '../../infrastructure/storage/asset-url.service';
import { StaffOrdersFlowService } from './staff-orders-flow.service';
export declare class StaffController {
    private readonly ensHttp;
    private readonly assetUrlService;
    private readonly ordersFlow;
    constructor(ensHttp: EnsHttpService, assetUrlService: AssetUrlService, ordersFlow: StaffOrdersFlowService);
    health(): {
        status: string;
        service: string;
    };
    login(req: Request, res: Response, body: unknown): Promise<void>;
    me(req: Request, res: Response): Promise<void>;
    logout(req: Request, res: Response, body: unknown): Promise<void>;
    capabilities(req: Request, res: Response): Promise<void>;
    listOrders(req: Request, res: Response, query: Record<string, unknown>): Promise<void>;
    getOrder(req: Request, res: Response, id: string, query: Record<string, unknown>): Promise<void>;
    getMenuCatalog(req: Request, res: Response, query: Record<string, unknown>): Promise<void>;
    listRestaurantTables(req: Request, res: Response): Promise<void>;
    createTableOrder(req: Request, res: Response, body: Record<string, unknown>): Promise<void>;
    patchOrderItems(req: Request, res: Response, id: string, body: Record<string, unknown>): Promise<void>;
    postOrderAction(req: Request, res: Response, id: string, body: Record<string, unknown>): Promise<void>;
    private presenterHeaders;
}
