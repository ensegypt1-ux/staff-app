import { Injectable, Logger } from '@nestjs/common';
import { Request } from 'express';
import {
  EnsHttpResult,
  EnsHttpService,
} from '../../infrastructure/ens-backend/ens-http.service';
import {
  canStaffViewDelivery,
  isCashierOnlyAction,
  StaffOrderActionType,
} from './staff-order-actions.util';
import { logUpstreamDenial, normalizeStaffUpstreamError, rejectUpstreamListResult, staffHistoryDeniedResult, staffScopeDeniedResult } from './staff-order-errors.util';
import {
  StaffJobRole,
  normalizeStaffJobRole,
} from './staff-job-role.util';
import { resolveStaffMenuId } from './staff-menu-scope.util';
import {
  StaffOrderChannel,
  StaffOrderPresenterService,
  StaffPresentedDetailResult,
  StaffPresentedListResult,
  StaffPresentedOrderEntry,
} from './staff-order-presenter.service';
import { isDeliveryUpstreamRow } from './staff-order-channel.util';
import { orderStatusFromAction, isActiveStaffOrderStatus } from './staff-order-status.util';
import {
  buildTableHistoryListResult,
  filterEntriesByDateRange,
  resolveTableHistoryDateRange,
  TABLE_HISTORY_MAX_SCAN_ROWS,
} from './staff-table-history-filters.util';
import {
  parsePublicMenuTablesPayload,
  parseStaffCallCreateId,
} from './staff-table-order.util';
import { StaffTableOrderCreatorRegistry } from './staff-table-order-creator.registry';
import {
  applyStaffOrderSelfAcceptRules,
  shouldBlockWaiterSelfAccept,
} from './staff-order-self-accept.util';
import { getAuthIdentity } from '../../common/utils/jwt-payload.util';

type Scope = 'active' | 'history';

const STAFF_JOB_ROLE_CACHE = Symbol('staffJobRoleCache');

@Injectable()
export class StaffOrdersFlowService {
  private readonly logger = new Logger(StaffOrdersFlowService.name);

  constructor(
    private readonly ensHttp: EnsHttpService,
    private readonly presenter: StaffOrderPresenterService,
    private readonly tableOrderCreators: StaffTableOrderCreatorRegistry,
  ) {}

  /**
   * Authoritative menu scope from verified JWT.
   * Optional client menuId must match; mismatches throw ForbiddenException.
   */
  resolveMenuId(
    req: Request,
    query: Record<string, unknown> = {},
    body?: Record<string, unknown>,
  ): number {
    return resolveStaffMenuId(req, query, body);
  }

  /**
   * Job role from verified upstream `/staff-auth/me` only.
   * Never inferred from unsigned JWT claims.
   */
  async resolveRole(req: Request): Promise<StaffJobRole> {
    const cached = (req as Request & { [STAFF_JOB_ROLE_CACHE]?: StaffJobRole })[
      STAFF_JOB_ROLE_CACHE
    ];
    if (cached) return cached;

    let role: StaffJobRole = 'waiter';
    try {
      const me = await this.ensHttp.proxy({
        method: 'GET',
        path: 'staff-auth/me',
        req,
      });
      const staff = (me.data as Record<string, unknown> | null)?.staff;
      if (staff && typeof staff === 'object') {
        const normalized = normalizeStaffJobRole(
          (staff as Record<string, unknown>).role,
        );
        if (normalized !== 'unknown') {
          role = normalized;
        }
      }
    } catch {
      /* fall through to waiter */
    }

    Object.defineProperty(req, STAFF_JOB_ROLE_CACHE, {
      value: role,
      writable: false,
      enumerable: false,
      configurable: true,
    });
    return role;
  }

  /** Staff id from verified JWT identity (`MenuStaff.id`). */
  resolveStaffId(req: Request): number {
    return getAuthIdentity(req)?.userId ?? 0;
  }

  private async enrichEntryForStaff(
    req: Request,
    menuId: number,
    role: StaffJobRole,
    entry: StaffPresentedOrderEntry,
  ): Promise<StaffPresentedOrderEntry> {
    const currentStaffId = await this.resolveStaffId(req);
    const createdByStaffId = this.tableOrderCreators.lookup(
      menuId,
      entry.staffCallId,
    );
    return applyStaffOrderSelfAcceptRules(entry, {
      role,
      currentStaffId,
      createdByStaffId,
    });
  }

  private async enrichEntriesForStaff(
    req: Request,
    menuId: number,
    role: StaffJobRole,
    entries: StaffPresentedOrderEntry[],
  ): Promise<StaffPresentedOrderEntry[]> {
    if (entries.length === 0 || menuId <= 0) return entries;
    const currentStaffId = await this.resolveStaffId(req);
    return entries.map((entry) =>
      applyStaffOrderSelfAcceptRules(entry, {
        role,
        currentStaffId,
        createdByStaffId: this.tableOrderCreators.lookup(
          menuId,
          entry.staffCallId,
        ),
      }),
    );
  }

  async listOrders(
    req: Request,
    query: Record<string, unknown>,
  ): Promise<EnsHttpResult> {
    const role = await this.resolveRole(req);
    const channel = this.parseChannel(query.channel);
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 50) || 50));

    if (this.isRecentScopeRequest(query.scope)) {
      return staffScopeDeniedResult('recent');
    }

    const scope = this.parseScope(query.scope);

    if (role === 'waiter' && scope === 'history') {
      return staffHistoryDeniedResult();
    }

    if (channel === 'delivery' && !canStaffViewDelivery(role)) {
      return {
        status: 200,
        data: this.emptyList(role, channel, scope, page, limit),
      };
    }

    if (role === 'waiter') {
      return this.listWaiterOrders(req, role, channel, scope, page, limit);
    }

    return this.listCashierOrders(req, role, channel, scope, page, limit, query);
  }

  async getOrder(
    req: Request,
    staffCallId: number,
    query: Record<string, unknown>,
  ): Promise<
    | { denied: true; httpStatus: number; data: Record<string, unknown> }
    | { denied: false; data: StaffPresentedDetailResult }
  > {
    const role = await this.resolveRole(req);
    const menuId =
      this.resolveMenuId(req, query);
    const activityLogId = Number(query.activityLogId ?? 0);

    if (menuId <= 0 || staffCallId <= 0) {
      return {
        denied: true,
        httpStatus: 404,
        data: { error: 'Order not found', code: 'ORDER_NOT_FOUND' },
      };
    }

    let detailRaw: Record<string, unknown> | null = null;

    if (role === 'cashier') {
      const resolvedLogId =
        Number.isFinite(activityLogId) && activityLogId > 0
          ? activityLogId
          : await this.resolveActivityLogId(
              req,
              menuId,
              staffCallId,
              activityLogId,
            );

      if (resolvedLogId > 0) {
        detailRaw = await this.fetchActivityLogRaw(req, menuId, resolvedLogId);
      }
    }

    if (!detailRaw) {
      const tableRaw = await this.fetchTableCallRaw(req, staffCallId);
      if (tableRaw && !isDeliveryUpstreamRow(tableRaw)) {
        detailRaw = tableRaw;
      }
    }

    if (!detailRaw) {
      return {
        denied: true,
        httpStatus: 404,
        data: { error: 'Order not found', code: 'ORDER_NOT_FOUND' },
      };
    }

    const entry = this.presenter.presentDetail(detailRaw, role);
    if (!entry) {
      return {
        denied: true,
        httpStatus: 404,
        data: { error: 'Order not found', code: 'ORDER_NOT_FOUND' },
      };
    }

    const listScope = this.resolveDetailListScope(role, query);
    let scopedEntry = this.presenter.applyListScope(entry, listScope);
    scopedEntry = await this.enrichEntryForStaff(
      req,
      menuId,
      role,
      scopedEntry,
    );

    if (role === 'waiter' && !isActiveStaffOrderStatus(entry.status)) {
      return {
        denied: true,
        httpStatus: 404,
        data: { error: 'Order not found', code: 'ORDER_NOT_FOUND' },
      };
    }

    if (entry.channel === 'delivery' && !canStaffViewDelivery(role)) {
      return {
        denied: true,
        httpStatus: 403,
        data: {
          error: 'Delivery orders are not available for your staff role',
          errorAr: 'طلبات التوصيل غير متاحة لدورك الوظيفي',
          code: 'STAFF_DELIVERY_DENIED',
        },
      };
    }

    const actions = Array.isArray(detailRaw.actions)
      ? (detailRaw.actions as Array<Record<string, unknown>>)
      : [];

    return {
      denied: false,
      data: {
        staffJobRole: role,
        entry: scopedEntry,
        actions,
        capabilities: this.presenter.capabilitiesFor(role),
      },
    };
  }

  async postOrderAction(
    req: Request,
    staffCallId: number,
    action: string,
    menuId: number,
    activityLogId?: number,
  ): Promise<EnsHttpResult> {
    const role = await this.resolveRole(req);
    const normalizedAction = String(action ?? '').trim() as StaffOrderActionType;

    const resolvedMenuId =
      menuId > 0 ? menuId : await this.resolveMenuId(req, {});

    if (!resolvedMenuId || staffCallId <= 0) {
      return {
        status: 400,
        data: {
          error: 'Invalid order payload',
          code: 'INVALID_ORDER',
        },
      };
    }

    if (isCashierOnlyAction(normalizedAction) && role !== 'cashier') {
      return {
        status: 403,
        data: {
          error: 'Order processing is available for cashier only',
          errorAr: 'معالجة الطلبات متاحة للكاشير فقط',
          code: 'STAFF_ACTION_DENIED',
        },
      };
    }

    if (normalizedAction === 'TABLE_CALL_CONFIRMED' && role === 'waiter') {
      const staffId = await this.resolveStaffId(req);
      const createdByStaffId = this.tableOrderCreators.lookup(
        resolvedMenuId,
        staffCallId,
      );
      if (
        shouldBlockWaiterSelfAccept({
          channel: 'table',
          status: 'pending',
          createdByStaffId,
          role,
          currentStaffId: staffId,
        })
      ) {
        return {
          status: 403,
          data: {
            error: 'You cannot accept an order you created',
            errorAr: 'لا يمكنك قبول طلب أنشأته بنفسك',
            code: 'STAFF_SELF_ACCEPT_DENIED',
          },
        };
      }
    }

    const logId = await this.resolveActivityLogId(
      req,
      resolvedMenuId,
      staffCallId,
      activityLogId,
    );

    if (
      role === 'cashier' &&
      logId > 0 &&
      normalizedAction === 'TABLE_CALL_PREPARED'
    ) {
      const autoConfirm = await this.autoConfirmPendingDeliveryOrder(
        req,
        resolvedMenuId,
        staffCallId,
        logId,
      );
      if (autoConfirm) {
        return autoConfirm;
      }
    }

    let upstream: EnsHttpResult;

    if (
      role === 'cashier' &&
      logId > 0 &&
      (normalizedAction === 'TABLE_CALL_CONFIRMED' ||
        normalizedAction === 'TABLE_CALL_CANCELLED' ||
        normalizedAction === 'TABLE_CALL_PREPARED' ||
        normalizedAction === 'TABLE_CALL_DELIVERED')
    ) {
      upstream = await this.ensHttp.proxy({
        method: 'POST',
        path: `menus/${resolvedMenuId}/activity-logs/${logId}/actions`,
        req,
        body: { action: normalizedAction },
      });
    } else if (
      normalizedAction === 'TABLE_CALL_CONFIRMED' ||
      normalizedAction === 'TABLE_CALL_CANCELLED'
    ) {
      const status = orderStatusFromAction(normalizedAction);
      upstream = await this.ensHttp.proxy({
        method: 'PATCH',
        path: `staff-auth/table-calls/${staffCallId}/status`,
        req,
        body: { status },
      });
    } else {
      return {
        status: 403,
        data: {
          error: 'Action not allowed for your staff role',
          errorAr: 'هذا الإجراء غير مسموح لدورك الوظيفي',
          code: 'STAFF_ACTION_DENIED',
        },
      };
    }

    if (upstream.status >= 400) {
      return normalizeStaffUpstreamError(upstream);
    }

    return this.presentOrderMutation(
      req,
      staffCallId,
      resolvedMenuId,
      activityLogId,
    );
  }

  /** Delivery orders skip explicit accept in staff app — confirm before prepare. */
  private async autoConfirmPendingDeliveryOrder(
    req: Request,
    menuId: number,
    staffCallId: number,
    logId: number,
  ): Promise<EnsHttpResult | null> {
    const presented = await this.getOrder(req, staffCallId, {
      menuId,
      activityLogId: logId,
    });
    if (presented.denied) {
      return null;
    }

    const entry = presented.data.entry;
    if (entry.channel !== 'delivery' || entry.status !== 'pending') {
      return null;
    }

    const confirmUpstream = await this.ensHttp.proxy({
      method: 'POST',
      path: `menus/${menuId}/activity-logs/${logId}/actions`,
      req,
      body: { action: 'TABLE_CALL_CONFIRMED' },
    });

    if (confirmUpstream.status >= 400) {
      return normalizeStaffUpstreamError(confirmUpstream);
    }

    return null;
  }

  async getCapabilities(req: Request) {
    const role = await this.resolveRole(req);
    return {
      staffJobRole: role,
      capabilities: this.presenter.capabilitiesFor(role),
    };
  }

  canCreateTableOrders(role: StaffJobRole): boolean {
    return role === 'waiter' || role === 'cashier';
  }

  async listRestaurantTables(req: Request): Promise<EnsHttpResult> {
    const role = await this.resolveRole(req);
    if (!this.canCreateTableOrders(role)) {
      return {
        status: 403,
        data: {
          error: 'Table order creation is not available for your staff role',
          errorAr: 'إنشاء طلبات الطاولات غير متاح لدورك الوظيفي',
          code: 'STAFF_TABLE_ORDER_DENIED',
        },
      };
    }

    const menuId = await this.resolveMenuId(req, {});
    const slug = await this.resolveMenuSlug(req);
    if (menuId <= 0 || !slug) {
      return {
        status: 404,
        data: {
          error: 'Menu not found',
          errorAr: 'القائمة غير موجودة',
          code: 'MENU_NOT_FOUND',
        },
      };
    }

    const upstream = await this.ensHttp.proxy({
      method: 'GET',
      path: `public/menu/${encodeURIComponent(slug)}`,
      req,
    });

    if (upstream.status >= 400) {
      return normalizeStaffUpstreamError(upstream);
    }

    const tables = parsePublicMenuTablesPayload(upstream.data);
    return {
      status: 200,
      data: {
        menuId,
        tables,
      },
    };
  }

  async createTableOrder(
    req: Request,
    body: Record<string, unknown>,
  ): Promise<EnsHttpResult> {
    const role = await this.resolveRole(req);
    if (!this.canCreateTableOrders(role)) {
      return {
        status: 403,
        data: {
          error: 'Table order creation is not available for your staff role',
          errorAr: 'إنشاء طلبات الطاولات غير متاح لدورك الوظيفي',
          code: 'STAFF_TABLE_ORDER_DENIED',
        },
      };
    }

    const menuId =
      this.resolveMenuId(req, {}, body);
    const tableNumber = String(body.tableNumber ?? '').trim();
    const items = body.items;

    if (menuId <= 0) {
      return {
        status: 400,
        data: {
          error: 'Invalid order payload',
          code: 'INVALID_ORDER',
        },
      };
    }

    if (!tableNumber) {
      return {
        status: 400,
        data: {
          error: 'Table selection is required',
          errorAr: 'يجب اختيار الطاولة',
          code: 'TABLE_REQUIRED',
        },
      };
    }

    if (!Array.isArray(items) || items.length === 0) {
      return {
        status: 400,
        data: {
          error: 'Add at least one item to the order',
          errorAr: 'أضف صنفاً واحداً على الأقل للطلب',
          code: 'ORDER_ITEMS_REQUIRED',
        },
      };
    }

    const upstream = await this.ensHttp.proxy({
      method: 'POST',
      path: 'public/staff-call',
      req,
      body: {
        menuId,
        tableNumber,
        type: 'table',
        status: 'pending',
        items,
        customerName: body.customerName,
        orderNotes: body.orderNotes,
      },
    });

    if (upstream.status >= 400) {
      return normalizeStaffUpstreamError(upstream);
    }

    const staffCallId = parseStaffCallCreateId(upstream.data);
    if (staffCallId <= 0) {
      return {
        status: 502,
        data: {
          error: 'Failed to create table order',
          errorAr: 'فشل إنشاء طلب الطاولة',
          code: 'TABLE_ORDER_CREATE_FAILED',
        },
      };
    }

    const creatorStaffId = await this.resolveStaffId(req);
    if (creatorStaffId > 0) {
      this.tableOrderCreators.record(menuId, staffCallId, creatorStaffId);
    }

    return this.presentOrderMutation(req, staffCallId, menuId);
  }

  async patchOrderItems(
    req: Request,
    staffCallId: number,
    menuId: number,
    items: unknown,
    activityLogId?: number,
  ): Promise<EnsHttpResult> {
    if (menuId <= 0 || staffCallId <= 0) {
      return {
        status: 400,
        data: {
          error: 'Invalid order payload',
          code: 'INVALID_ORDER',
        },
      };
    }

    const role = await this.resolveRole(req);
    const presented = await this.getOrder(req, staffCallId, {
      menuId,
      activityLogId: activityLogId ?? 0,
    });

    if (presented.denied) {
      return {
        status: presented.httpStatus,
        data: presented.data,
      };
    }

    const entry = presented.data.entry;
    if (!entry.canEditItems) {
      return {
        status: 403,
        data: {
          error: 'Order items cannot be edited in the current state',
          errorAr: 'لا يمكن تعديل أصناف الطلب في هذه الحالة',
          code: 'STAFF_EDIT_DENIED',
        },
      };
    }

    if (entry.channel === 'delivery' && !canStaffViewDelivery(role)) {
      return {
        status: 403,
        data: {
          error: 'Delivery orders are not available for your staff role',
          errorAr: 'طلبات التوصيل غير متاحة لدورك الوظيفي',
          code: 'STAFF_DELIVERY_DENIED',
        },
      };
    }

    const upstream = await this.ensHttp.proxy({
      method: 'PATCH',
      path: `staff-auth/table-calls/${staffCallId}/items`,
      req,
      body: { items },
    });

    if (upstream.status >= 400) {
      return normalizeStaffUpstreamError(upstream);
    }

    return this.presentOrderMutation(
      req,
      staffCallId,
      menuId,
      activityLogId,
    );
  }

  async resolveMenuSlug(req: Request): Promise<string | null> {
    try {
      const me = await this.ensHttp.proxy({
        method: 'GET',
        path: 'staff-auth/me',
        req,
      });
      if (me.status >= 400) return null;
      const payload = me.data as Record<string, unknown> | null;
      const menu = payload?.menu;
      if (menu && typeof menu === 'object') {
        const slug = String((menu as Record<string, unknown>).slug ?? '').trim();
        if (slug.length > 0) return slug;
      }
    } catch {
      /* fall through */
    }
    return null;
  }

  async getMenuCatalog(
    req: Request,
    query: Record<string, unknown>,
  ): Promise<EnsHttpResult> {
    const slug = await this.resolveMenuSlug(req);
    if (!slug) {
      return {
        status: 404,
        data: {
          error: 'Menu not found',
          errorAr: 'القائمة غير موجودة',
          code: 'MENU_NOT_FOUND',
        },
      };
    }

    const upstreamQuery: Record<string, unknown> = {};
    for (const key of ['locale', 'page', 'limit', 'pageSize', 'categoryId'] as const) {
      const value = query[key];
      if (value === undefined || value === null || value === '') continue;
      upstreamQuery[key] = value;
    }

    const upstream = await this.ensHttp.proxy({
      method: 'GET',
      path: `public/menu/${encodeURIComponent(slug)}/catalog`,
      req,
      query: upstreamQuery,
    });

    if (upstream.status >= 400) {
      return normalizeStaffUpstreamError(upstream);
    }

    const body = upstream.data as Record<string, unknown> | null;
    const data =
      body?.data && typeof body.data === 'object'
        ? (body.data as Record<string, unknown>)
        : body;

    return {
      status: 200,
      data: data ?? {},
    };
  }

  private async listWaiterOrders(
    req: Request,
    role: StaffJobRole,
    channel: StaffOrderChannel,
    scope: Scope,
    page: number,
    limit: number,
  ): Promise<EnsHttpResult> {
    if (channel === 'delivery') {
      return {
        status: 200,
        data: this.emptyList(role, channel, scope, page, limit),
      };
    }

    const pendingUpstream = await this.ensHttp.proxy({
      method: 'GET',
      path: 'staff-auth/table-calls',
      req,
      query: { limit: Math.min(limit, 100) },
    });

    if (pendingUpstream.status >= 400) {
      return rejectUpstreamListResult(
        this.logger,
        'listWaiterOrders staff-auth/table-calls',
        pendingUpstream,
      );
    }

    const pendingPayload = (pendingUpstream.data ?? {}) as Record<
      string,
      unknown
    >;
    const pendingRows = Array.isArray(pendingPayload.calls)
      ? pendingPayload.calls
      : [];

    const historyUpstream = await this.ensHttp.proxy({
      method: 'GET',
      path: 'staff-auth/table-calls/history',
      req,
      query: { page: 1, limit: 100 },
    });

    if (historyUpstream.status >= 400) {
      return rejectUpstreamListResult(
        this.logger,
        'listWaiterOrders staff-auth/table-calls/history',
        historyUpstream,
      );
    }

    const historyPayload = (historyUpstream.data ?? {}) as Record<
      string,
      unknown
    >;
    const historyRows = Array.isArray(historyPayload.calls)
      ? historyPayload.calls
      : [];

    const mergedRows: Record<string, unknown>[] = [];
    const seenIds = new Set<number>();

    for (const row of pendingRows) {
      if (!row || typeof row !== 'object') continue;
      const map = row as Record<string, unknown>;
      if (isDeliveryUpstreamRow(map)) continue;
      const id = Number(map.id ?? 0);
      if (!Number.isFinite(id) || id <= 0 || seenIds.has(id)) continue;
      seenIds.add(id);
      mergedRows.push(map);
    }

    for (const row of historyRows) {
      if (!row || typeof row !== 'object') continue;
      const map = row as Record<string, unknown>;
      if (isDeliveryUpstreamRow(map)) continue;
      const status = String(map.status ?? '')
        .trim()
        .toLowerCase();
      if (status !== 'confirmed' && status !== 'prepared') continue;
      const id = Number(map.id ?? 0);
      if (!Number.isFinite(id) || id <= 0 || seenIds.has(id)) continue;
      seenIds.add(id);
      mergedRows.push({
        ...map,
        at: map.requestedAt ?? map.at,
        items: map.items ?? [],
      });
    }

    let presented = mergedRows
      .map((row) =>
        this.presenter.presentTableCallRow(
          row as Record<string, unknown>,
          role,
        ),
      )
      .filter((entry): entry is StaffPresentedOrderEntry => entry != null)
      .filter((entry) => entry.channel === channel);

    presented = await this.hydrateWaiterActiveListEntries(req, presented);

    presented = this.sortWaiterActiveEntries(presented);
    presented = this.presenter.filterByScope(presented, scope);
    presented = this.presenter.applyListScopeToEntries(presented, scope);

    const menuId = await this.resolveMenuId(req, {});
    presented = await this.enrichEntriesForStaff(req, menuId, role, presented);

    const total = presented.length;
    const start = (page - 1) * limit;
    const paged = presented.slice(start, start + limit);
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      status: 200,
      data: {
        staffJobRole: role,
        channel,
        scope,
        entries: paged,
        total,
        page,
        limit,
        totalPages,
        capabilities: this.presenter.capabilitiesFor(role),
      },
    };
  }

  private sortWaiterActiveEntries(
    entries: StaffPresentedOrderEntry[],
  ): StaffPresentedOrderEntry[] {
    return [...entries].sort((a, b) => {
      const aPending = a.status === 'pending' ? 0 : 1;
      const bPending = b.status === 'pending' ? 0 : 1;
      if (aPending !== bPending) return aPending - bPending;
      const aTime = Date.parse(a.createdAt ?? '') || 0;
      const bTime = Date.parse(b.createdAt ?? '') || 0;
      return bTime - aTime;
    });
  }

  private async hydrateWaiterActiveListEntries(
    req: Request,
    entries: StaffPresentedOrderEntry[],
  ): Promise<StaffPresentedOrderEntry[]> {
    const sparse = entries.filter((entry) => entry.items.length === 0);
    if (sparse.length === 0) return entries;

    const fetches = sparse.slice(0, 20).map(async (entry) => {
      const raw = await this.fetchTableCallRaw(req, entry.staffCallId);
      return { staffCallId: entry.staffCallId, raw };
    });
    const results = await Promise.all(fetches);
    const index = new Map<number, Record<string, unknown>>();
    for (const row of results) {
      if (row.raw && !isDeliveryUpstreamRow(row.raw)) {
        index.set(row.staffCallId, row.raw);
      }
    }

    return entries.map((entry) => {
      const raw = index.get(entry.staffCallId);
      if (!raw) return entry;
      return this.presenter.mergeCallHydration(entry, raw, 'waiter');
    });
  }

  private resolveDetailListScope(
    role: StaffJobRole,
    query: Record<string, unknown>,
  ): Scope {
    if (role === 'waiter') {
      return 'active';
    }
    return this.parseScope(query.scope);
  }

  private async listCashierOrders(
    req: Request,
    role: StaffJobRole,
    channel: StaffOrderChannel,
    scope: Scope,
    page: number,
    limit: number,
    query: Record<string, unknown>,
  ): Promise<EnsHttpResult> {
    const menuId = await this.resolveMenuId(req, query);

    if (menuId <= 0) {
      return {
        status: 404,
        data: {
          error: 'Menu not found',
          errorAr: 'القائمة غير موجودة',
          code: 'MENU_NOT_FOUND',
        },
      };
    }

    if (scope === 'history' && channel === 'table') {
      return this.listCashierTableHistory(
        req,
        role,
        channel,
        menuId,
        page,
        limit,
        query,
      );
    }

    const upstreamQuery: Record<string, unknown> = {
      page,
      limit,
      channel,
      ...this.cashierListQueryParams(query),
    };

    const upstream = await this.ensHttp.proxy({
      method: 'GET',
      path: `menus/${menuId}/activity-logs`,
      req,
      query: upstreamQuery,
    });

    if (upstream.status >= 400) {
      return rejectUpstreamListResult(
        this.logger,
        'listCashierOrders menus/activity-logs',
        upstream,
      );
    }

    const payload = (upstream.data ?? {}) as Record<string, unknown>;
    const rows = Array.isArray(payload.entries)
      ? payload.entries
      : Array.isArray(payload.calls)
        ? payload.calls
        : [];

    let presented = rows
      .map((row) =>
        this.presenter.presentListRow(
          row as Record<string, unknown>,
          role,
          channel,
        ),
      )
      .filter((entry): entry is StaffPresentedOrderEntry => entry != null);

    presented = await this.hydrateListEntries(
      req,
      menuId,
      role,
      channel,
      presented,
    );

    presented = await this.enrichEntriesActionDetailsFromActivityLogs(
      req,
      menuId,
      presented,
    );

    const scoped = this.presenter.applyListScopeToEntries(
      this.presenter.filterByScope(presented, scope),
      scope,
    );
    const enriched = await this.enrichEntriesForStaff(
      req,
      menuId,
      role,
      scoped,
    );
    const total = Number(payload.total ?? enriched.length) || enriched.length;
    const totalPages =
      Number(payload.totalPages ?? Math.ceil(total / limit)) ||
      Math.max(1, Math.ceil(total / limit));

    return {
      status: 200,
      data: {
        staffJobRole: role,
        channel,
        scope,
        entries: enriched,
        total,
        page,
        limit,
        totalPages,
        capabilities: this.presenter.capabilitiesFor(role),
      },
    };
  }

  private async listCashierTableHistory(
    req: Request,
    role: StaffJobRole,
    channel: StaffOrderChannel,
    menuId: number,
    page: number,
    limit: number,
    query: Record<string, unknown>,
  ): Promise<EnsHttpResult> {
    const dateRange = resolveTableHistoryDateRange(query, 'history', channel)!;
    const historyQuery: Record<string, unknown> = {
      ...query,
      dateFrom: dateRange.dateFrom,
      dateTo: dateRange.dateTo,
    };

    const needed = page * limit;
    const scanLimit = 50;
    let upstreamPage = 1;
    let scannedRows = 0;
    const collected: StaffPresentedOrderEntry[] = [];

    while (
      collected.length < needed &&
      scannedRows < TABLE_HISTORY_MAX_SCAN_ROWS
    ) {
      const upstream = await this.ensHttp.proxy({
        method: 'GET',
        path: `menus/${menuId}/activity-logs`,
        req,
        query: {
          page: upstreamPage,
          limit: scanLimit,
          channel,
          dateFrom: dateRange.dateFrom,
          dateTo: dateRange.dateTo,
          ...this.cashierListQueryParams(historyQuery, { skipDates: true }),
        },
      });

      if (upstream.status >= 400) {
        return rejectUpstreamListResult(
          this.logger,
          'listCashierTableHistory menus/activity-logs',
          upstream,
        );
      }

      const payload = (upstream.data ?? {}) as Record<string, unknown>;
      const rows = Array.isArray(payload.entries)
        ? payload.entries
        : Array.isArray(payload.calls)
          ? payload.calls
          : [];
      if (rows.length === 0) break;

      scannedRows += rows.length;

      let presented = rows
        .map((row) =>
          this.presenter.presentListRow(
            row as Record<string, unknown>,
            role,
            channel,
          ),
        )
        .filter((entry): entry is StaffPresentedOrderEntry => entry != null);

      presented = await this.hydrateListEntries(
        req,
        menuId,
        role,
        channel,
        presented,
      );

      presented = this.presenter.filterByScope(presented, 'history');
      presented = filterEntriesByDateRange(presented, dateRange);
      collected.push(...presented);

      const totalUpstream = Number(payload.total ?? 0);
      const totalPagesUpstream =
        Number(payload.totalPages ?? 0) ||
        (totalUpstream > 0 ? Math.ceil(totalUpstream / scanLimit) : 0);

      if (upstreamPage >= totalPagesUpstream && rows.length < scanLimit) {
        break;
      }

      upstreamPage += 1;
    }

    return {
      status: 200,
      data: buildTableHistoryListResult({
        role,
        channel,
        scope: 'history',
        entries: this.presenter.applyListScopeToEntries(collected, 'history'),
        page,
        limit,
        dateRange,
        capabilities: this.presenter.capabilitiesFor(role),
      }),
    };
  }

  private cashierListQueryParams(
    query: Record<string, unknown>,
    options?: { skipDates?: boolean },
  ): Record<string, unknown> {
    const params: Record<string, unknown> = {};
    const keys = options?.skipDates
      ? (['q', 'status'] as const)
      : (['q', 'dateFrom', 'dateTo', 'status'] as const);
    for (const key of keys) {
      const value = query[key];
      if (value === undefined || value === null || value === '') {
        continue;
      }
      params[key] = value;
    }
    return params;
  }

  private async presentOrderMutation(
    req: Request,
    staffCallId: number,
    menuId: number,
    activityLogId?: number,
  ): Promise<EnsHttpResult> {
    const presented = await this.getOrder(req, staffCallId, {
      menuId,
      activityLogId: activityLogId ?? 0,
    });

    if (presented.denied) {
      return {
        status: presented.httpStatus,
        data: presented.data,
      };
    }

    return {
      status: 200,
      data: presented.data,
    };
  }

  private async hydrateListEntries(
    req: Request,
    menuId: number,
    role: StaffJobRole,
    channel: StaffOrderChannel,
    entries: StaffPresentedOrderEntry[],
  ): Promise<StaffPresentedOrderEntry[]> {
    if (entries.length === 0) return entries;

    if (channel === 'delivery') {
      return this.hydrateDeliveryListEntries(req, menuId, role, entries);
    }

    const pendingIndex = await this.fetchPendingTableCallsIndex(req);

    const sparse = entries.filter((entry) => entry.items.length === 0);
    const detailFetches = sparse
      .filter((entry) => !pendingIndex.has(entry.staffCallId))
      .slice(0, 20)
      .map(async (entry) => {
        const raw = await this.fetchTableCallRaw(req, entry.staffCallId);
        return { staffCallId: entry.staffCallId, raw };
      });

    const fetched = await Promise.all(detailFetches);
    const detailIndex = new Map<number, Record<string, unknown>>();
    for (const row of fetched) {
      if (row.raw && !isDeliveryUpstreamRow(row.raw)) {
        detailIndex.set(row.staffCallId, row.raw);
      }
    }

    return entries.map((entry) => {
      if (entry.channel === 'delivery') {
        return entry;
      }
      const pending = pendingIndex.get(entry.staffCallId);
      if (pending) {
        return this.presenter.mergeCallHydration(entry, pending, role);
      }
      const detail = detailIndex.get(entry.staffCallId);
      if (detail) {
        return this.presenter.mergeCallHydration(entry, detail, role);
      }
      return entry;
    });
  }

  private async enrichEntriesActionDetailsFromActivityLogs(
    req: Request,
    menuId: number,
    entries: StaffPresentedOrderEntry[],
  ): Promise<StaffPresentedOrderEntry[]> {
    if (entries.length === 0 || menuId <= 0) return entries;

    const upstream = await this.ensHttp.proxy({
      method: 'GET',
      path: `menus/${menuId}/activity-logs`,
      req,
      query: { page: 1, limit: 100, channel: 'table' },
    });
    if (upstream.status >= 400) {
      logUpstreamDenial(
        this.logger,
        'enrichEntriesActionDetailsFromActivityLogs menus/activity-logs',
        upstream,
      );
      return entries;
    }

    const payload = (upstream.data ?? {}) as Record<string, unknown>;
    const rows = Array.isArray(payload.entries)
      ? payload.entries
      : Array.isArray(payload.calls)
        ? payload.calls
        : [];

    const logRows = rows.filter(
      (row): row is Record<string, unknown> =>
        row != null && typeof row === 'object',
    );

    return this.presenter.enrichEntriesActionDetails(entries, logRows);
  }

  private async hydrateDeliveryListEntries(
    req: Request,
    menuId: number,
    role: StaffJobRole,
    entries: StaffPresentedOrderEntry[],
  ): Promise<StaffPresentedOrderEntry[]> {
    const sparse = entries.filter(
      (entry) =>
        entry.channel === 'delivery' &&
        entry.activityLogId != null &&
        entry.activityLogId! > 0 &&
        this.deliveryEntryNeedsHydration(entry),
    );
    if (sparse.length === 0) return entries;

    const fetches = sparse.slice(0, 20).map(async (entry) => {
      const raw = await this.fetchActivityLogRaw(
        req,
        menuId,
        entry.activityLogId!,
      );
      return { activityLogId: entry.activityLogId!, raw };
    });
    const results = await Promise.all(fetches);
    const index = new Map<number, Record<string, unknown>>();
    for (const row of results) {
      if (row.raw) index.set(row.activityLogId, row.raw);
    }

    return entries.map((entry) => {
      const logId = entry.activityLogId;
      if (logId == null) return entry;
      const raw = index.get(logId);
      if (!raw) return entry;
      const hydrated = this.presenter.presentListRow(raw, role, 'delivery');
      if (!hydrated) return entry;
      return {
        ...hydrated,
        id: entry.id,
        activityLogId: entry.activityLogId,
      };
    });
  }

  private deliveryEntryNeedsHydration(
    entry: StaffPresentedOrderEntry,
  ): boolean {
    return (
      entry.items.length === 0 ||
      !entry.customerName ||
      !entry.customerPhone ||
      entry.customerAddress == null ||
      entry.deliveryFee == null
    );
  }

  private async fetchActivityLogRaw(
    req: Request,
    menuId: number,
    activityLogId: number,
  ): Promise<Record<string, unknown> | null> {
    const activity = await this.ensHttp.proxy({
      method: 'GET',
      path: `menus/${menuId}/activity-logs/${activityLogId}`,
      req,
    });
    if (activity.status >= 400) return null;

    const payload = activity.data as Record<string, unknown> | null;
    const entry = payload?.entry;
    if (!entry || typeof entry !== 'object') return null;

    const map = entry as Record<string, unknown>;
    const order =
      map.order && typeof map.order === 'object'
        ? (map.order as Record<string, unknown>)
        : {};

    return {
      ...order,
      ...map,
      order: map.order,
      actions: map.actions,
      items: map.items ?? order.items,
      type: map.type ?? order.type,
      orderType: map.orderType ?? order.orderType,
      customerPhone: map.customerPhone ?? order.customerPhone,
      customerAddress: map.customerAddress ?? order.customerAddress,
      orderNotes: map.orderNotes ?? order.orderNotes,
      deliveryFee: map.deliveryFee ?? order.deliveryFee,
      governorateId: map.governorateId ?? order.governorateId,
      governorateNameAr: map.governorateNameAr ?? order.governorateNameAr,
      governorateNameEn: map.governorateNameEn ?? order.governorateNameEn,
    };
  }

  private async fetchPendingTableCallsIndex(
    req: Request,
  ): Promise<Map<number, Record<string, unknown>>> {
    const upstream = await this.ensHttp.proxy({
      method: 'GET',
      path: 'staff-auth/table-calls',
      req,
    });
    const payload = (upstream.data ?? {}) as Record<string, unknown>;
    const calls = Array.isArray(payload.calls) ? payload.calls : [];
    const index = new Map<number, Record<string, unknown>>();
    for (const call of calls) {
      if (!call || typeof call !== 'object') continue;
      const map = call as Record<string, unknown>;
      if (isDeliveryUpstreamRow(map)) continue;
      const id = Number(map.id ?? 0);
      if (Number.isFinite(id) && id > 0) {
        index.set(id, map);
      }
    }
    return index;
  }

  private async fetchTableCallRaw(
    req: Request,
    staffCallId: number,
  ): Promise<Record<string, unknown> | null> {
    const call = await this.ensHttp.proxy({
      method: 'GET',
      path: `staff-auth/table-calls/${staffCallId}`,
      req,
    });
    if (call.status >= 400) return null;

    const callBody = call.data as Record<string, unknown> | null;
    const callData =
      callBody?.call && typeof callBody.call === 'object'
        ? (callBody.call as Record<string, unknown>)
        : callBody;
    if (!callData || typeof callData !== 'object') return null;

    return {
      ...callData,
      orderId: callData.id ?? staffCallId,
      totalPrice: callData.orderTotal,
      items: callData.items,
      status: callData.status,
    };
  }

  private async resolveActivityLogId(
    req: Request,
    menuId: number,
    staffCallId: number,
    activityLogId?: number,
  ): Promise<number> {
    if (activityLogId && activityLogId > 0) return activityLogId;

    const upstream = await this.ensHttp.proxy({
      method: 'GET',
      path: `menus/${menuId}/activity-logs`,
      req,
      query: { page: 1, limit: 100 },
    });
    const payload = (upstream.data ?? {}) as Record<string, unknown>;
    const rows = Array.isArray(payload.entries)
      ? payload.entries
      : Array.isArray(payload.calls)
        ? payload.calls
        : [];

    for (const row of rows) {
      const map = row as Record<string, unknown>;
      if (Number(map.orderId) === staffCallId) {
        const id = Number(map.id);
        if (Number.isFinite(id) && id > 0) return id;
      }
    }

    return 0;
  }

  private parseChannel(raw: unknown): StaffOrderChannel {
    return String(raw ?? 'table').trim().toLowerCase() === 'delivery'
      ? 'delivery'
      : 'table';
  }

  private parseScope(raw: unknown): Scope {
    const value = String(raw ?? 'active').trim().toLowerCase();
    if (value === 'history') return 'history';
    return 'active';
  }

  private isRecentScopeRequest(raw: unknown): boolean {
    return String(raw ?? '').trim().toLowerCase() === 'recent';
  }

  private emptyList(
    role: StaffJobRole,
    channel: StaffOrderChannel,
    scope: Scope,
    page: number,
    limit: number,
  ): StaffPresentedListResult {
    return {
      staffJobRole: role,
      channel,
      scope,
      entries: [],
      total: 0,
      page,
      limit,
      totalPages: 0,
      capabilities: this.presenter.capabilitiesFor(role),
    };
  }
}
