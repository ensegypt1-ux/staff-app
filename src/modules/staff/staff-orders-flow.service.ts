import { Injectable, Logger } from '@nestjs/common';
import { Request } from 'express';
import {
  EnsHttpResult,
  EnsHttpService,
} from '../../infrastructure/ens-backend/ens-http.service';
import {
  canPerformOrderAction,
  canStaffViewDelivery,
  canStaffViewHistory,
  canStaffViewOrders,
  StaffOrderActionType,
} from './staff-order-actions.util';
import {
  logUpstreamDenial,
  normalizeStaffUpstreamError,
  rejectUpstreamListResult,
  staffHistoryDeniedResult,
  staffScopeDeniedResult,
} from './staff-order-errors.util';
import {
  buildStaffResolvedAuth,
  emptyStaffResolvedAuth,
  StaffResolvedAuth,
  staffHasPermission,
} from './staff-capability.mapper';
import { resolveStaffMenuId } from './staff-menu-scope.util';
import {
  StaffOrderChannel,
  StaffOrderPresenterService,
  StaffPresentedDetailResult,
  StaffPresentedListResult,
  StaffPresentedOrderEntry,
} from './staff-order-presenter.service';
import { isDeliveryUpstreamRow } from './staff-order-channel.util';
import {
  orderStatusFromAction,
  isActiveStaffOrderStatus,
} from './staff-order-status.util';
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
import { getAuthIdentity } from '../../common/utils/jwt-payload.util';

type Scope = 'active' | 'history';

type StaffAuthRequestCache = {
  auth: StaffResolvedAuth;
  menuSlug: string | null;
};

const STAFF_AUTH_CACHE = Symbol('staffAuthCache');

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
   * Load Express `/staff-auth/me` once per request.
   * Authorization uses `permissions[]` only; `staffJobRole` is deprecated metadata.
   */
  async resolveStaffAuth(req: Request): Promise<StaffResolvedAuth> {
    const cached = (
      req as Request & { [STAFF_AUTH_CACHE]?: StaffAuthRequestCache }
    )[STAFF_AUTH_CACHE];
    if (cached) return cached.auth;

    let auth = emptyStaffResolvedAuth();
    let menuSlug: string | null = null;

    try {
      const me = await this.ensHttp.proxy({
        method: 'GET',
        path: 'staff-auth/me',
        req,
      });
      if (me.status < 400) {
        const payload = (me.data as Record<string, unknown> | null) ?? {};
        const staff =
          payload.staff && typeof payload.staff === 'object'
            ? (payload.staff as Record<string, unknown>)
            : null;
        const roleObj =
          payload.role && typeof payload.role === 'object'
            ? (payload.role as Record<string, unknown>)
            : null;

        const roleIdRaw = staff?.roleId ?? roleObj?.id ?? null;
        const roleIdNum = Number(roleIdRaw);
        const roleId =
          roleIdRaw != null && Number.isFinite(roleIdNum) ? roleIdNum : null;

        const roleNameRaw = staff?.roleName ?? roleObj?.name ?? null;
        const roleName =
          roleNameRaw != null && String(roleNameRaw).trim().length > 0
            ? String(roleNameRaw).trim()
            : null;

        auth = buildStaffResolvedAuth({
          permissions: payload.permissions,
          roleName,
          roleId,
          legacyRole: staff?.role,
        });

        const menu =
          payload.menu && typeof payload.menu === 'object'
            ? (payload.menu as Record<string, unknown>)
            : null;
        const slug = String(menu?.slug ?? '').trim();
        if (slug.length > 0) menuSlug = slug;
      }
    } catch {
      /* fail closed with empty permissions */
    }

    Object.defineProperty(req, STAFF_AUTH_CACHE, {
      value: { auth, menuSlug } satisfies StaffAuthRequestCache,
      writable: false,
      enumerable: false,
      configurable: true,
    });
    return auth;
  }

  /** Staff id from verified JWT identity (`MenuStaff.id`). */
  resolveStaffId(req: Request): number {
    return getAuthIdentity(req)?.userId ?? 0;
  }

  /** Self-accept removed for Web Tables parity — entries pass through unchanged. */
  private async enrichEntryForStaff(
    _req: Request,
    _menuId: number,
    _auth: StaffResolvedAuth,
    entry: StaffPresentedOrderEntry,
  ): Promise<StaffPresentedOrderEntry> {
    return {
      ...entry,
      createdByStaffId: null,
      waitingForCashierApproval: false,
    };
  }

  private async enrichEntriesForStaff(
    _req: Request,
    _menuId: number,
    _auth: StaffResolvedAuth,
    entries: StaffPresentedOrderEntry[],
  ): Promise<StaffPresentedOrderEntry[]> {
    return entries.map((entry) => ({
      ...entry,
      createdByStaffId: null,
      waitingForCashierApproval: false,
    }));
  }

  async listOrders(
    req: Request,
    query: Record<string, unknown>,
  ): Promise<EnsHttpResult> {
    const auth = await this.resolveStaffAuth(req);
    const channel = this.parseChannel(query.channel);
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 50) || 50));

    if (this.isRecentScopeRequest(query.scope)) {
      return staffScopeDeniedResult('recent');
    }

    const scope = this.parseScope(query.scope);

    if (scope === 'history' && !canStaffViewHistory(auth)) {
      return staffHistoryDeniedResult();
    }

    if (channel === 'delivery') {
      if (!canStaffViewDelivery(auth)) {
        return {
          status: 200,
          data: this.emptyList(auth, channel, scope, page, limit),
        };
      }
      return this.listDeliveryOrders(
        req,
        auth,
        channel,
        scope,
        page,
        limit,
        query,
      );
    }

    if (!canStaffViewOrders(auth)) {
      return {
        status: 200,
        data: this.emptyList(auth, channel, scope, page, limit),
      };
    }

    // Table orders: Web dashboard parity — activity-logs channel=table.
    return this.listTableOrdersViaActivityLogs(
      req,
      auth,
      channel,
      scope,
      page,
      limit,
      query,
    );
  }

  async getOrder(
    req: Request,
    staffCallId: number,
    query: Record<string, unknown>,
  ): Promise<
    | { denied: true; httpStatus: number; data: Record<string, unknown> }
    | { denied: false; data: StaffPresentedDetailResult }
  > {
    const auth = await this.resolveStaffAuth(req);
    const menuId = this.resolveMenuId(req, query);
    const activityLogId = Number(query.activityLogId ?? 0);

    if (menuId <= 0 || staffCallId <= 0) {
      return {
        denied: true,
        httpStatus: 404,
        data: { error: 'Order not found', code: 'ORDER_NOT_FOUND' },
      };
    }

    let detailRaw: Record<string, unknown> | null = null;

    // Prefer activity-log detail (Web dashboard parity) for table + delivery.
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
      const logRaw = await this.fetchActivityLogRaw(
        req,
        menuId,
        resolvedLogId,
      );
      if (logRaw) {
        if (isDeliveryUpstreamRow(logRaw) && !canStaffViewDelivery(auth)) {
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
        detailRaw = logRaw;
      }
    }

    if (!detailRaw) {
      const tableRaw = await this.fetchTableCallRaw(req, staffCallId);
      if (tableRaw) {
        if (isDeliveryUpstreamRow(tableRaw) && !canStaffViewDelivery(auth)) {
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
        if (!isDeliveryUpstreamRow(tableRaw) || canStaffViewDelivery(auth)) {
          detailRaw = tableRaw;
        }
      }
    }

    if (!detailRaw) {
      return {
        denied: true,
        httpStatus: 404,
        data: { error: 'Order not found', code: 'ORDER_NOT_FOUND' },
      };
    }

    const entry = this.presenter.presentDetail(detailRaw, auth);
    if (!entry) {
      return {
        denied: true,
        httpStatus: 404,
        data: { error: 'Order not found', code: 'ORDER_NOT_FOUND' },
      };
    }

    if (entry.channel === 'table' && !canStaffViewOrders(auth)) {
      return {
        denied: true,
        httpStatus: 403,
        data: {
          error: 'Orders are not available for your permissions',
          errorAr: 'الطلبات غير متاحة لصلاحياتك',
          code: 'STAFF_ORDERS_DENIED',
        },
      };
    }

    const listScope = this.resolveDetailListScope(auth, query);
    let scopedEntry = this.presenter.applyListScope(entry, listScope);
    scopedEntry = await this.enrichEntryForStaff(
      req,
      menuId,
      auth,
      scopedEntry,
    );

    if (
      !canStaffViewHistory(auth) &&
      !isActiveStaffOrderStatus(entry.status)
    ) {
      return {
        denied: true,
        httpStatus: 404,
        data: { error: 'Order not found', code: 'ORDER_NOT_FOUND' },
      };
    }

    if (entry.channel === 'delivery' && !canStaffViewDelivery(auth)) {
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
        staffJobRole: auth.staffJobRole,
        permissions: auth.permissions,
        roleName: auth.roleName,
        roleId: auth.roleId,
        entry: scopedEntry,
        actions,
        capabilities: this.presenter.capabilitiesFor(auth),
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
    const auth = await this.resolveStaffAuth(req);
    const normalizedAction = String(action ?? '').trim() as StaffOrderActionType;

    const resolvedMenuId =
      menuId > 0 ? menuId : this.resolveMenuId(req, {});

    if (!resolvedMenuId || staffCallId <= 0) {
      return {
        status: 400,
        data: {
          error: 'Invalid order payload',
          code: 'INVALID_ORDER',
        },
      };
    }

    if (!canPerformOrderAction(auth, normalizedAction)) {
      return {
        status: 403,
        data: {
          error: 'Action not allowed for your permissions',
          errorAr: 'هذا الإجراء غير مسموح لصلاحياتك',
          code: 'STAFF_ACTION_DENIED',
        },
      };
    }

    const tableCallRaw = await this.fetchTableCallRaw(req, staffCallId);
    const hasTableCall = tableCallRaw != null;
    const isDeliveryCall =
      tableCallRaw != null && isDeliveryUpstreamRow(tableCallRaw);

    const logId = await this.resolveActivityLogId(
      req,
      resolvedMenuId,
      staffCallId,
      activityLogId,
    );

    let upstream: EnsHttpResult;

    // Table channel (Web parity): all lifecycle actions via activity-logs.
    if (
      !isDeliveryCall &&
      logId > 0 &&
      (normalizedAction === 'TABLE_CALL_CONFIRMED' ||
        normalizedAction === 'TABLE_CALL_CANCELLED' ||
        normalizedAction === 'TABLE_CALL_COMPLETED')
    ) {
      upstream = await this.ensHttp.proxy({
        method: 'POST',
        path: `menus/${resolvedMenuId}/activity-logs/${logId}/actions`,
        req,
        body: { action: normalizedAction },
      });
    } else if (normalizedAction === 'TABLE_CALL_PREPARED' && hasTableCall) {
      // Delivery prepare — dedicated endpoint (+ auto-confirm when pending).
      if (isDeliveryCall && logId > 0) {
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

      if (!isDeliveryCall) {
        return {
          status: 403,
          data: {
            error: 'Prepare is not available for table orders',
            errorAr: 'التحضير غير متاح لطلبات الطاولات',
            code: 'STAFF_ACTION_DENIED',
          },
        };
      }

      upstream = await this.ensHttp.proxy({
        method: 'PATCH',
        path: `staff-auth/table-calls/${staffCallId}/prepare`,
        req,
        body: {},
      });
    } else if (
      isDeliveryCall &&
      logId > 0 &&
      (normalizedAction === 'TABLE_CALL_CONFIRMED' ||
        normalizedAction === 'TABLE_CALL_CANCELLED' ||
        normalizedAction === 'TABLE_CALL_PREPARED' ||
        normalizedAction === 'TABLE_CALL_DELIVERED')
    ) {
      if (normalizedAction === 'TABLE_CALL_PREPARED') {
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
      upstream = await this.ensHttp.proxy({
        method: 'POST',
        path: `menus/${resolvedMenuId}/activity-logs/${logId}/actions`,
        req,
        body: { action: normalizedAction },
      });
    } else if (
      !isDeliveryCall &&
      (normalizedAction === 'TABLE_CALL_CONFIRMED' ||
        normalizedAction === 'TABLE_CALL_CANCELLED')
    ) {
      // Fallback when activity-log id cannot be resolved yet.
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
          error: 'Action not allowed for your permissions',
          errorAr: 'هذا الإجراء غير مسموح لصلاحياتك',
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
    const auth = await this.resolveStaffAuth(req);
    return {
      permissions: auth.permissions,
      roleName: auth.roleName,
      roleId: auth.roleId,
      /** @deprecated Prefer permissions / capabilities. */
      staffJobRole: auth.staffJobRole,
      capabilities: this.presenter.capabilitiesFor(auth),
    };
  }

  canCreateTableOrders(auth: StaffResolvedAuth): boolean {
    return (
      staffHasPermission(auth, 'orders:confirm') ||
      staffHasPermission(auth, 'orders:edit_items')
    );
  }

  async listRestaurantTables(req: Request): Promise<EnsHttpResult> {
    const auth = await this.resolveStaffAuth(req);
    if (!this.canCreateTableOrders(auth)) {
      return {
        status: 403,
        data: {
          error: 'Table order creation is not available for your staff role',
          errorAr: 'إنشاء طلبات الطاولات غير متاح لدورك الوظيفي',
          code: 'STAFF_TABLE_ORDER_DENIED',
        },
      };
    }

    const menuId = this.resolveMenuId(req, {});
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
    const auth = await this.resolveStaffAuth(req);
    if (!this.canCreateTableOrders(auth)) {
      return {
        status: 403,
        data: {
          error: 'Table order creation is not available for your staff role',
          errorAr: 'إنشاء طلبات الطاولات غير متاح لدورك الوظيفي',
          code: 'STAFF_TABLE_ORDER_DENIED',
        },
      };
    }

    const menuId = this.resolveMenuId(req, {}, body);
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

    // Creator registry / self-accept intentionally not recorded (Web parity).
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

    const auth = await this.resolveStaffAuth(req);
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

    if (entry.channel === 'delivery' && !canStaffViewDelivery(auth)) {
      return {
        status: 403,
        data: {
          error: 'Delivery orders are not available for your staff role',
          errorAr: 'طلبات التوصيل غير متاحة لدورك الوظيفي',
          code: 'STAFF_DELIVERY_DENIED',
        },
      };
    }

    const logId =
      entry.activityLogId && entry.activityLogId > 0
        ? entry.activityLogId
        : await this.resolveActivityLogId(
            req,
            menuId,
            staffCallId,
            activityLogId,
          );

    // Prefer activity-logs items PATCH (Web parity) when log id is known.
    const upstream =
      logId > 0
        ? await this.ensHttp.proxy({
            method: 'PATCH',
            path: `menus/${menuId}/activity-logs/${logId}/items`,
            req,
            body: { items },
          })
        : await this.ensHttp.proxy({
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
      logId > 0 ? logId : activityLogId,
    );
  }

  async resolveMenuSlug(req: Request): Promise<string | null> {
    await this.resolveStaffAuth(req);
    const cached = (
      req as Request & { [STAFF_AUTH_CACHE]?: StaffAuthRequestCache }
    )[STAFF_AUTH_CACHE];
    return cached?.menuSlug ?? null;
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

  /**
   * Table channel — Web dashboard parity:
   * `GET /menus/:menuId/activity-logs?channel=table` with status/date/search filters.
   * Does not use staff-auth/table-calls as the primary list source.
   */
  private async listTableOrdersViaActivityLogs(
    req: Request,
    auth: StaffResolvedAuth,
    channel: StaffOrderChannel,
    scope: Scope,
    page: number,
    limit: number,
    query: Record<string, unknown>,
  ): Promise<EnsHttpResult> {
    const menuId = this.resolveMenuId(req, query);

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

    const upstreamQuery: Record<string, unknown> = {
      page,
      limit,
      channel: 'table',
      ...this.deliveryListQueryParams(query),
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
        'listTableOrdersViaActivityLogs menus/activity-logs',
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
          auth,
          channel,
        ),
      )
      .filter((entry): entry is StaffPresentedOrderEntry => entry != null);

    presented = await this.hydrateListEntries(
      req,
      menuId,
      auth,
      channel,
      presented,
    );

    presented = await this.enrichEntriesActionDetailsFromActivityLogs(
      req,
      menuId,
      presented,
    );

    // Web uses status/date/search on one list (status=all by default).
    // Only apply legacy scope=history narrowing when no explicit status filter.
    const hasStatusFilter =
      query.status !== undefined &&
      query.status !== null &&
      String(query.status).trim() !== '' &&
      String(query.status).trim().toLowerCase() !== 'all';

    let entries = presented;
    if (!hasStatusFilter && scope === 'history') {
      entries = this.presenter.filterByScope(presented, 'history');
    }

    entries = await this.enrichEntriesForStaff(req, menuId, auth, entries);

    const total = Number(payload.total ?? entries.length) || entries.length;
    const totalPages =
      Number(payload.totalPages ?? Math.ceil(total / limit)) ||
      Math.max(1, Math.ceil(total / limit));

    return {
      status: 200,
      data: {
        staffJobRole: auth.staffJobRole,
        permissions: auth.permissions,
        roleName: auth.roleName,
        roleId: auth.roleId,
        channel,
        scope,
        entries,
        total,
        page,
        limit,
        totalPages,
        capabilities: this.presenter.capabilitiesFor(auth),
      },
    };
  }

  private sortActiveTableEntries(
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

  private async hydrateTableActiveListEntries(
    req: Request,
    auth: StaffResolvedAuth,
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
      return this.presenter.mergeCallHydration(entry, raw, auth);
    });
  }

  private resolveDetailListScope(
    auth: StaffResolvedAuth,
    query: Record<string, unknown>,
  ): Scope {
    if (!canStaffViewHistory(auth)) {
      return 'active';
    }
    return this.parseScope(query.scope);
  }

  /** Delivery channel: activity-logs when `delivery:view` is present. */
  private async listDeliveryOrders(
    req: Request,
    auth: StaffResolvedAuth,
    channel: StaffOrderChannel,
    scope: Scope,
    page: number,
    limit: number,
    query: Record<string, unknown>,
  ): Promise<EnsHttpResult> {
    const menuId = this.resolveMenuId(req, query);

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

    const upstreamQuery: Record<string, unknown> = {
      page,
      limit,
      channel,
      ...this.deliveryListQueryParams(query),
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
        'listDeliveryOrders menus/activity-logs',
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
          auth,
          channel,
        ),
      )
      .filter((entry): entry is StaffPresentedOrderEntry => entry != null);

    presented = await this.hydrateListEntries(
      req,
      menuId,
      auth,
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
      auth,
      scoped,
    );
    const total = Number(payload.total ?? enriched.length) || enriched.length;
    const totalPages =
      Number(payload.totalPages ?? Math.ceil(total / limit)) ||
      Math.max(1, Math.ceil(total / limit));

    return {
      status: 200,
      data: {
        staffJobRole: auth.staffJobRole,
        permissions: auth.permissions,
        roleName: auth.roleName,
        roleId: auth.roleId,
        channel,
        scope,
        entries: enriched,
        total,
        page,
        limit,
        totalPages,
        capabilities: this.presenter.capabilitiesFor(auth),
      },
    };
  }

  private async listTableHistory(
    req: Request,
    auth: StaffResolvedAuth,
    channel: StaffOrderChannel,
    page: number,
    limit: number,
    query: Record<string, unknown>,
  ): Promise<EnsHttpResult> {
    const dateRange = resolveTableHistoryDateRange(query, 'history', channel)!;
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
        path: 'staff-auth/table-calls/history',
        req,
        query: {
          page: upstreamPage,
          limit: scanLimit,
        },
      });

      if (upstream.status >= 400) {
        return rejectUpstreamListResult(
          this.logger,
          'listTableHistory staff-auth/table-calls/history',
          upstream,
        );
      }

      const payload = (upstream.data ?? {}) as Record<string, unknown>;
      const rows = Array.isArray(payload.calls) ? payload.calls : [];
      if (rows.length === 0) break;

      scannedRows += rows.length;

      let presented = rows
        .filter(
          (row) =>
            row != null &&
            typeof row === 'object' &&
            !isDeliveryUpstreamRow(row as Record<string, unknown>),
        )
        .map((row) =>
          this.presenter.presentTableCallRow(
            row as Record<string, unknown>,
            auth,
          ),
        )
        .filter((entry): entry is StaffPresentedOrderEntry => entry != null);

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
        auth,
        channel,
        scope: 'history',
        entries: this.presenter.applyListScopeToEntries(collected, 'history'),
        page,
        limit,
        dateRange,
        capabilities: this.presenter.capabilitiesFor(auth),
      }),
    };
  }

  private deliveryListQueryParams(
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
    auth: StaffResolvedAuth,
    channel: StaffOrderChannel,
    entries: StaffPresentedOrderEntry[],
  ): Promise<StaffPresentedOrderEntry[]> {
    if (entries.length === 0) return entries;

    if (channel === 'delivery') {
      return this.hydrateDeliveryListEntries(req, menuId, auth, entries);
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
        return this.presenter.mergeCallHydration(entry, pending, auth);
      }
      const detail = detailIndex.get(entry.staffCallId);
      if (detail) {
        return this.presenter.mergeCallHydration(entry, detail, auth);
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
    auth: StaffResolvedAuth,
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
      const hydrated = this.presenter.presentListRow(raw, auth, 'delivery');
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
    auth: StaffResolvedAuth,
    channel: StaffOrderChannel,
    scope: Scope,
    page: number,
    limit: number,
  ): StaffPresentedListResult {
    return {
      staffJobRole: auth.staffJobRole,
      permissions: auth.permissions,
      roleName: auth.roleName,
      roleId: auth.roleId,
      channel,
      scope,
      entries: [],
      total: 0,
      page,
      limit,
      totalPages: 0,
      capabilities: this.presenter.capabilitiesFor(auth),
    };
  }
}
