import { Request } from 'express';
import { EnsHttpResult, EnsHttpService } from '../../infrastructure/ens-backend/ens-http.service';
import { StaffJobRole } from './staff-job-role.util';
import { StaffOrderPresenterService, StaffPresentedDetailResult } from './staff-order-presenter.service';
import { StaffTableOrderCreatorRegistry } from './staff-table-order-creator.registry';
export declare class StaffOrdersFlowService {
    private readonly ensHttp;
    private readonly presenter;
    private readonly tableOrderCreators;
    private readonly logger;
    constructor(ensHttp: EnsHttpService, presenter: StaffOrderPresenterService, tableOrderCreators: StaffTableOrderCreatorRegistry);
    resolveMenuId(req: Request, query?: Record<string, unknown>, body?: Record<string, unknown>): number;
    resolveRole(req: Request): Promise<StaffJobRole>;
    resolveStaffId(req: Request): number;
    private enrichEntryForStaff;
    private enrichEntriesForStaff;
    listOrders(req: Request, query: Record<string, unknown>): Promise<EnsHttpResult>;
    getOrder(req: Request, staffCallId: number, query: Record<string, unknown>): Promise<{
        denied: true;
        httpStatus: number;
        data: Record<string, unknown>;
    } | {
        denied: false;
        data: StaffPresentedDetailResult;
    }>;
    postOrderAction(req: Request, staffCallId: number, action: string, menuId: number, activityLogId?: number): Promise<EnsHttpResult>;
    private autoConfirmPendingDeliveryOrder;
    getCapabilities(req: Request): Promise<{
        staffJobRole: StaffJobRole;
        capabilities: import("./staff-order-presenter.service").StaffOrderCapabilities;
    }>;
    canCreateTableOrders(role: StaffJobRole): boolean;
    listRestaurantTables(req: Request): Promise<EnsHttpResult>;
    createTableOrder(req: Request, body: Record<string, unknown>): Promise<EnsHttpResult>;
    patchOrderItems(req: Request, staffCallId: number, menuId: number, items: unknown, activityLogId?: number): Promise<EnsHttpResult>;
    resolveMenuSlug(req: Request): Promise<string | null>;
    getMenuCatalog(req: Request, query: Record<string, unknown>): Promise<EnsHttpResult>;
    private listWaiterOrders;
    private sortWaiterActiveEntries;
    private hydrateWaiterActiveListEntries;
    private resolveDetailListScope;
    private listCashierOrders;
    private listCashierTableHistory;
    private cashierListQueryParams;
    private presentOrderMutation;
    private hydrateListEntries;
    private enrichEntriesActionDetailsFromActivityLogs;
    private hydrateDeliveryListEntries;
    private deliveryEntryNeedsHydration;
    private fetchActivityLogRaw;
    private fetchPendingTableCallsIndex;
    private fetchTableCallRaw;
    private resolveActivityLogId;
    private parseChannel;
    private parseScope;
    private isRecentScopeRequest;
    private emptyList;
}
