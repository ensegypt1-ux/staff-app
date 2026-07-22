import { Injectable, Logger } from '@nestjs/common';
import { Request } from 'express';
import {
  EnsHttpResult,
  EnsHttpService,
} from '../../infrastructure/ens-backend/ens-http.service';
import {
  isFinishConflictOrMenuUpstreamError,
  isMenuAccessAuthorizationSoft404,
  isPostFinishHistoryPresentationFailure,
  logUpstreamDenial,
  normalizeStaffUpstreamError,
  rejectUpstreamListResult,
  staffHistoryDeniedResult,
  staffInvalidChannelScopeResult,
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
  StaffOrderListChannel,
  StaffOrderPresenterService,
  StaffPresentedDetailResult,
  StaffPresentedListResult,
  StaffPresentedOrderEntry,
} from './staff-order-presenter.service';
import {
  isDeliveryUpstreamRow,
  parseStaffOrderListChannel,
} from './staff-order-channel.util';
import {
  countAttentionEntries,
  countTableAttentionAcrossSources,
  isMergeableServiceTableCall,
  isServiceRequestKind,
  parseStaffRequestKind,
  sortTableEntriesByAttention,
  TABLE_ATTENTION_COUNT_MAX_SCAN_ROWS,
} from './staff-order-attention.util';
import {
  orderStatusFromAction,
  isActiveStaffOrderStatus,
  isHistoryStaffOrderStatus,
  normalizeStaffOrderStatus,
  resolveListEntryStatus,
} from './staff-order-status.util';
import { parseActionDetailsList } from './staff-order-action-details.util';
import {
  canPerformOrderAction,
  canStaffViewDelivery,
  canStaffViewHistory,
  canStaffViewOrders,
  StaffOrderActionType,
  statusLabelFor,
} from './staff-order-actions.util';
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
import { getAuthIdentity } from '../../common/utils/jwt-payload.util';
import { terminalAtSortMs } from './staff-order-terminal-at.util';

type Scope = 'active' | 'history';

/** Max upstream pages to scan when age-filtering post-fetch. */
const ARCHIVE_SCOPE_MAX_SCAN_PAGES = 15;
/** Pages of delivered/cancelled to scan for operational grace (page 1). */
const OPERATIONAL_GRACE_SCAN_PAGES = 3;

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
    const listChannel = parseStaffOrderListChannel(query.channel);
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 50) || 50));

    if (this.isRecentScopeRequest(query.scope)) {
      return staffScopeDeniedResult('recent');
    }

    const scope = this.parseScope(query.scope);

    if (listChannel === 'all') {
      if (scope !== 'history') {
        return staffInvalidChannelScopeResult();
      }
      if (!canStaffViewHistory(auth)) {
        return staffHistoryDeniedResult();
      }
      return this.listUnifiedArchiveOrders(req, auth, page, limit, query);
    }

    const channel = listChannel;

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
    const serviceKind = tableCallRaw
      ? parseStaffRequestKind(tableCallRaw.requestKind)
      : 'order';
    const isServiceCall = isServiceRequestKind(serviceKind);

    // Standalone waiter / orphan bill: Accept/Reject via table-call status only.
    if (isServiceCall) {
      if (
        normalizedAction !== 'TABLE_CALL_CONFIRMED' &&
        normalizedAction !== 'TABLE_CALL_CANCELLED'
      ) {
        return {
          status: 403,
          data: {
            error: 'Action not allowed for service requests',
            errorAr: 'هذا الإجراء غير مسموح لطلبات الخدمة',
            code: 'STAFF_ACTION_DENIED',
          },
        };
      }
      const status = orderStatusFromAction(normalizedAction);
      const upstream = await this.ensHttp.proxy({
        method: 'PATCH',
        path: `staff-auth/table-calls/${staffCallId}/status`,
        req,
        body: { status },
      });
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

    const logId = await this.resolveActivityLogId(
      req,
      resolvedMenuId,
      staffCallId,
      activityLogId,
    );

    let upstream: EnsHttpResult;

    // Table Finish: always staff-auth complete when a table-call exists.
    // Never use activity-logs for table TABLE_CALL_COMPLETED in that case.
    if (
      !isDeliveryCall &&
      normalizedAction === 'TABLE_CALL_COMPLETED' &&
      hasTableCall
    ) {
      upstream = await this.ensHttp.proxy({
        method: 'PATCH',
        path: `staff-auth/table-calls/${staffCallId}/complete`,
        req,
        body: {},
      });
    } else if (
      !isDeliveryCall &&
      logId > 0 &&
      (normalizedAction === 'TABLE_CALL_CONFIRMED' ||
        normalizedAction === 'TABLE_CALL_CANCELLED')
    ) {
      // Table channel (Web parity): confirm/cancel via activity-logs.
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

    if (
      !isDeliveryCall &&
      normalizedAction === 'TABLE_CALL_COMPLETED' &&
      hasTableCall
    ) {
      if (upstream.status < 400) {
        return this.presentSuccessfulTableFinish(
          req,
          staffCallId,
          resolvedMenuId,
          activityLogId,
          tableCallRaw,
          upstream,
        );
      }
      return this.resolveTableFinishAfterConflict(
        req,
        staffCallId,
        resolvedMenuId,
        upstream,
        tableCallRaw,
      );
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

  /**
   * After upstream Finish succeeds: prefer rich presentation, then table-call
   * presentation, then a minimal delivered ack that does not require history.
   */
  private async presentSuccessfulTableFinish(
    req: Request,
    staffCallId: number,
    menuId: number,
    activityLogId: number | undefined,
    preFinishRaw: Record<string, unknown> | null,
    upstream: EnsHttpResult,
  ): Promise<EnsHttpResult> {
    const rich = await this.presentOrderMutation(
      req,
      staffCallId,
      menuId,
      activityLogId,
    );
    if (rich.status < 400) {
      return rich;
    }

    if (!isPostFinishHistoryPresentationFailure(rich)) {
      return rich;
    }

    return this.presentDeliveredFinishWithFallback(
      req,
      staffCallId,
      menuId,
      activityLogId,
      preFinishRaw,
      upstream,
    );
  }

  /**
   * One follow-up GET after Finish conflict / menu soft-error.
   * If the table-call is already delivered, treat Finish as success (HTTP 200).
   */
  private async resolveTableFinishAfterConflict(
    req: Request,
    staffCallId: number,
    menuId: number,
    upstream: EnsHttpResult,
    preFinishRaw?: Record<string, unknown> | null,
  ): Promise<EnsHttpResult> {
    if (!isFinishConflictOrMenuUpstreamError(upstream)) {
      return normalizeStaffUpstreamError(upstream);
    }

    const raw = await this.fetchTableCallRaw(req, staffCallId);
    if (!raw) {
      return {
        status: 404,
        data: {
          error: 'Order not found',
          errorAr: 'الطلب غير موجود',
          code: 'ORDER_NOT_FOUND',
        },
      };
    }

    const status = normalizeStaffOrderStatus(raw.status);
    if (status === 'delivered') {
      return this.presentDeliveredFinishWithFallback(
        req,
        staffCallId,
        menuId,
        undefined,
        preFinishRaw ?? raw,
        upstream,
      );
    }

    if (isActiveStaffOrderStatus(status)) {
      return {
        status: 409,
        data: {
          error: 'This order action is no longer available',
          errorAr: 'هذا الإجراء لم يعد متاحاً على الطلب',
          code: 'STAFF_ORDER_STATE_CHANGED',
        },
      };
    }

    return {
      status: 409,
      data: {
        error: 'This order action is no longer available',
        errorAr: 'هذا الإجراء لم يعد متاحاً على الطلب',
        code: 'STAFF_ORDER_STATE_CHANGED',
      },
    };
  }

  private async presentDeliveredFinishWithFallback(
    req: Request,
    staffCallId: number,
    menuId: number,
    activityLogId: number | undefined,
    preFinishRaw: Record<string, unknown> | null | undefined,
    upstream: EnsHttpResult,
  ): Promise<EnsHttpResult> {
    const fetched = await this.fetchTableCallRaw(req, staffCallId);
    const raw =
      fetched ??
      (preFinishRaw
        ? { ...preFinishRaw, status: 'delivered' }
        : null);

    if (raw) {
      const presented = await this.presentDeliveredFinishSuccess(req, menuId, {
        ...raw,
        status: 'delivered',
      });
      if (presented.status < 400) {
        return presented;
      }
    }

    return this.minimalDeliveredFinishSuccess(
      req,
      staffCallId,
      activityLogId,
      preFinishRaw ?? fetched,
      upstream,
    );
  }

  /** Present a delivered table-call after Finish without the history gate. */
  private async presentDeliveredFinishSuccess(
    req: Request,
    menuId: number,
    tableRaw: Record<string, unknown>,
  ): Promise<EnsHttpResult> {
    const auth = await this.resolveStaffAuth(req);
    const entry = this.presenter.presentDetail(tableRaw, auth);
    if (!entry) {
      return {
        status: 404,
        data: {
          error: 'Order not found',
          errorAr: 'الطلب غير موجود',
          code: 'ORDER_NOT_FOUND',
        },
      };
    }

    let scopedEntry = this.presenter.applyListScope(entry, 'history');
    scopedEntry = await this.enrichEntryForStaff(
      req,
      menuId,
      auth,
      scopedEntry,
    );

    return {
      status: 200,
      data: {
        staffJobRole: auth.staffJobRole,
        permissions: auth.permissions,
        roleName: auth.roleName,
        roleId: auth.roleId,
        entry: { ...scopedEntry, status: 'delivered' },
        actions: [],
        capabilities: this.presenter.capabilitiesFor(auth),
      },
    };
  }

  /**
   * Minimal Finish ack when rich presentation is blocked by history permissions.
   * Does not require orders:history or dashboard:access.
   */
  private async minimalDeliveredFinishSuccess(
    req: Request,
    staffCallId: number,
    activityLogId: number | undefined,
    identityRaw: Record<string, unknown> | null | undefined,
    upstream: EnsHttpResult,
  ): Promise<EnsHttpResult> {
    const auth = await this.resolveStaffAuth(req);
    const upstreamBody =
      upstream.data && typeof upstream.data === 'object'
        ? (upstream.data as Record<string, unknown>)
        : {};
    const tableNumber =
      identityRaw?.tableNumber != null
        ? String(identityRaw.tableNumber)
        : null;
    const customerName =
      identityRaw?.customerName != null
        ? String(identityRaw.customerName)
        : null;
    const logId =
      activityLogId && activityLogId > 0
        ? activityLogId
        : Number(identityRaw?.activityLogId ?? 0) || null;

    return {
      status: 200,
      data: {
        staffJobRole: auth.staffJobRole,
        permissions: auth.permissions,
        roleName: auth.roleName,
        roleId: auth.roleId,
        entry: {
          id: String(logId ?? staffCallId),
          staffCallId,
          activityLogId: logId && logId > 0 ? logId : null,
          channel: 'table',
          requestKind: 'order',
          status: 'delivered',
          statusLabel: statusLabelFor('delivered'),
          items: [],
          itemCount: 0,
          totalPrice: Number(identityRaw?.orderTotal ?? identityRaw?.totalPrice ?? 0) || 0,
          availableActions: [],
          canEditItems: false,
          tableNumber,
          customerName,
          customerPhone:
            identityRaw?.customerPhone != null
              ? String(identityRaw.customerPhone)
              : null,
          customerAddress: null,
          orderNotes: null,
          createdAt:
            identityRaw?.createdAt != null
              ? String(identityRaw.createdAt)
              : null,
          actionDetails: [],
          pendingGuestAddition: false,
          pendingBillRequest: false,
          createdByStaffId: null,
        },
        actions: [],
        capabilities: this.presenter.capabilitiesFor(auth),
        finishAcknowledged: true,
        upstreamStatus: upstreamBody.status ?? 'delivered',
      },
    };
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

    // Staff with orders:view but without dashboard:access get a menu soft-404.
    // Fall back to staff-auth table-calls — never map this to ORDER_NOT_FOUND.
    if (isMenuAccessAuthorizationSoft404(upstream)) {
      logUpstreamDenial(
        this.logger,
        'listTableOrdersViaActivityLogs menus/activity-logs soft-404 → table-calls fallback',
        upstream,
      );
      return this.listTableOrdersViaTableCallsFallback(
        req,
        auth,
        channel,
        scope,
        page,
        limit,
        query,
      );
    }

    if (upstream.status >= 400) {
      return rejectUpstreamListResult(
        this.logger,
        'listTableOrdersViaActivityLogs menus/activity-logs',
        upstream,
      );
    }

    // Badge count is global — never scoped to the current page or browse filters.
    const pendingCount = await this.resolveTableAttentionPendingCount(
      req,
      menuId,
    );

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

    let entries = this.presenter.filterByScope(presented, scope);
    entries = await this.enrichEntriesForStaff(req, menuId, auth, entries);

    let mergedServiceCount = 0;
    // Prepend service rows on page 1 only so later pages do not repeat them.
    if (
      page === 1 &&
      scope !== 'history' &&
      this.shouldMergeServiceTableCalls(query)
    ) {
      const merged = await this.mergeServiceRequestsFromTableCalls(
        req,
        auth,
        channel,
        entries,
        query,
      );
      entries = merged.entries;
      mergedServiceCount = merged.addedCount;
    }

    if (scope === 'active' && page === 1) {
      const grace = await this.fetchOperationalGraceEntries(
        req,
        menuId,
        auth,
        channel,
        query,
      );
      const before = entries.length;
      entries = this.mergeGraceIntoOperationalPage(entries, grace, limit);
      mergedServiceCount += Math.max(0, entries.length - before);
    }

    entries = this.presenter.applyListScopeToEntries(entries, scope);
    entries = sortTableEntriesByAttention(entries);

    const scopedTotal = await this.estimateScopedActivityLogTotal({
      req,
      menuId,
      auth,
      channel,
      scope,
      query,
      seedPresented: presented,
      seedPayload: payload,
    });
    const total = scopedTotal + mergedServiceCount;
    const totalPages = Math.max(1, Math.ceil(total / limit) || 1);

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
        pendingCount,
        capabilities: this.presenter.capabilitiesFor(auth),
      },
    };
  }

  /**
   * Global table attention count for `pendingCount`.
   * Scans activity-logs (channel=table) without list page/limit/q/date/status
   * filters, then adds waiter/orphan-bill rows from staff-auth/table-calls.
   * On menu-access soft-404, counts from staff-auth table-calls only.
   */
  private async resolveTableAttentionPendingCount(
    req: Request,
    menuId: number,
  ): Promise<number> {
    if (menuId <= 0) return 0;

    const activityScan = await this.fetchAllTableActivityLogRowsForAttention(
      req,
      menuId,
    );

    if (activityScan.soft404) {
      return this.resolveTableAttentionPendingCountFromTableCalls(req);
    }

    const serviceTableCallRows = await this.fetchPendingServiceTableCalls(req);

    return countTableAttentionAcrossSources({
      activityLogRows: activityScan.rows,
      serviceTableCallRows,
    });
  }

  private async resolveTableAttentionPendingCountFromTableCalls(
    req: Request,
  ): Promise<number> {
    const pendingRows = await this.fetchAllPendingTableCallRows(req);
    return countAttentionEntries(
      pendingRows.map((raw) => ({
        status: String(raw.status ?? 'pending')
          .trim()
          .toLowerCase(),
        pendingGuestAddition: raw.pendingGuestAddition === true,
        pendingBillRequest: raw.pendingBillRequest === true,
        requestKind:
          raw.requestKind == null ? undefined : String(raw.requestKind),
      })),
    );
  }

  private async fetchAllTableActivityLogRowsForAttention(
    req: Request,
    menuId: number,
  ): Promise<{ soft404: boolean; rows: Record<string, unknown>[] }> {
    const scanLimit = 100;
    let upstreamPage = 1;
    let scanned = 0;
    const collected: Record<string, unknown>[] = [];

    while (scanned < TABLE_ATTENTION_COUNT_MAX_SCAN_ROWS) {
      const upstream = await this.ensHttp.proxy({
        method: 'GET',
        path: `menus/${menuId}/activity-logs`,
        req,
        query: {
          page: upstreamPage,
          limit: scanLimit,
          channel: 'table',
        },
      });

      if (isMenuAccessAuthorizationSoft404(upstream)) {
        logUpstreamDenial(
          this.logger,
          'resolveTableAttentionPendingCount menus/activity-logs soft-404',
          upstream,
        );
        return { soft404: true, rows: [] };
      }

      if (upstream.status >= 400) {
        logUpstreamDenial(
          this.logger,
          'resolveTableAttentionPendingCount menus/activity-logs',
          upstream,
        );
        break;
      }

      const payload = (upstream.data ?? {}) as Record<string, unknown>;
      const rows = Array.isArray(payload.entries)
        ? payload.entries
        : Array.isArray(payload.calls)
          ? payload.calls
          : [];
      if (rows.length === 0) break;

      for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        const map = row as Record<string, unknown>;
        if (isDeliveryUpstreamRow(map)) continue;
        collected.push(map);
      }

      scanned += rows.length;
      const totalUpstream = Number(payload.total ?? 0);
      const totalPagesUpstream =
        Number(payload.totalPages ?? 0) ||
        (totalUpstream > 0 ? Math.ceil(totalUpstream / scanLimit) : 0);

      if (upstreamPage >= totalPagesUpstream || rows.length < scanLimit) {
        break;
      }
      upstreamPage += 1;
    }

    return { soft404: false, rows: collected };
  }

  /**
   * Merge waiter / orphan-bill pending rows from `staff-auth/table-calls`.
   * Activity-logs `channel=table` intentionally excludes these requestKinds.
   */
  private async mergeServiceRequestsFromTableCalls(
    req: Request,
    auth: StaffResolvedAuth,
    channel: StaffOrderChannel,
    entries: StaffPresentedOrderEntry[],
    query: Record<string, unknown>,
  ): Promise<{ entries: StaffPresentedOrderEntry[]; addedCount: number }> {
    const pendingCalls = await this.fetchPendingServiceTableCalls(req);
    if (pendingCalls.length === 0) {
      return { entries, addedCount: 0 };
    }

    const existingIds = new Set(
      entries.map((entry) => entry.staffCallId).filter((id) => id > 0),
    );

    const q = String(query.q ?? '')
      .trim()
      .toLowerCase();
    const dateFrom = String(query.dateFrom ?? '').trim();
    const dateTo = String(query.dateTo ?? '').trim();

    const added: StaffPresentedOrderEntry[] = [];
    for (const raw of pendingCalls) {
      const id = Number(raw.id ?? 0);
      if (!Number.isFinite(id) || id <= 0 || existingIds.has(id)) continue;

      const presented = this.presenter.presentListRow(
        {
          id,
          orderId: id,
          tableNumber: raw.tableNumber,
          requestKind: raw.requestKind,
          status: raw.status ?? 'pending',
          customerName: raw.customerName,
          items: [],
          orderTotal: 0,
          totalPrice: 0,
          createdAt: raw.at ?? raw.createdAt ?? null,
          at: raw.at ?? raw.createdAt ?? null,
          pendingGuestAddition: false,
          pendingBillRequest: false,
        },
        auth,
        channel,
      );
      if (!presented) continue;

      if (q) {
        const table = (presented.tableNumber ?? '').toLowerCase();
        const customer = (presented.customerName ?? '').toLowerCase();
        if (!table.includes(q) && !customer.includes(q)) continue;
      }

      if (dateFrom || dateTo) {
        const day = (presented.createdAt ?? '').slice(0, 10);
        if (dateFrom && day && day < dateFrom) continue;
        if (dateTo && day && day > dateTo) continue;
      }

      added.push(presented);
      existingIds.add(id);
    }

    if (added.length === 0) {
      return { entries, addedCount: 0 };
    }

    return {
      entries: [...added, ...entries],
      addedCount: added.length,
    };
  }

  private shouldMergeServiceTableCalls(query: Record<string, unknown>): boolean {
    const status = String(query.status ?? '')
      .trim()
      .toLowerCase();
    if (!status || status === 'all') return true;
    // Service rows are pending-only from Express table-calls.
    return status === 'pending';
  }

  private async fetchPendingServiceTableCalls(
    req: Request,
  ): Promise<Record<string, unknown>[]> {
    const upstream = await this.ensHttp.proxy({
      method: 'GET',
      path: 'staff-auth/table-calls',
      req,
    });
    if (upstream.status >= 400) return [];

    const payload = (upstream.data ?? {}) as Record<string, unknown>;
    const calls = Array.isArray(payload.calls) ? payload.calls : [];
    const out: Record<string, unknown>[] = [];
    for (const call of calls) {
      if (!call || typeof call !== 'object') continue;
      const map = call as Record<string, unknown>;
      if (isDeliveryUpstreamRow(map)) continue;
      if (!isMergeableServiceTableCall(map)) continue;
      out.push(map);
    }
    return out;
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
      'delivery',
    );

    const collectedSeed = this.presenter.filterByScope(presented, scope);
    let entries = await this.enrichEntriesForStaff(
      req,
      menuId,
      auth,
      collectedSeed,
    );

    let graceExtra = 0;
    if (scope === 'active' && page === 1) {
      const grace = await this.fetchOperationalGraceEntries(
        req,
        menuId,
        auth,
        channel,
        query,
      );
      const before = entries.length;
      entries = this.mergeGraceIntoOperationalPage(entries, grace, limit);
      graceExtra = Math.max(0, entries.length - before);
    }

    entries = this.presenter.applyListScopeToEntries(entries, scope);

    const scopedTotal = await this.estimateScopedActivityLogTotal({
      req,
      menuId,
      auth,
      channel,
      scope,
      query,
      seedPresented: presented,
      seedPayload: payload,
    });
    const total = scopedTotal + graceExtra;
    const totalPages = Math.max(1, Math.ceil(total / limit) || 1);

    const pendingCount = await this.resolveDeliveryPendingCount(req, menuId);

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
        pendingCount,
        capabilities: this.presenter.capabilitiesFor(auth),
      },
    };
  }

  /**
   * Table list fallback when activity-logs returns menu-access soft-404.
   * Uses staff-auth table-calls (pending) + table-calls/history (lifecycle rows).
   */
  private async listTableOrdersViaTableCallsFallback(
    req: Request,
    auth: StaffResolvedAuth,
    channel: StaffOrderChannel,
    scope: Scope,
    page: number,
    limit: number,
    query: Record<string, unknown>,
  ): Promise<EnsHttpResult> {
    if (scope === 'history') {
      return this.listTableHistory(req, auth, channel, page, limit, query);
    }

    const [pendingRows, historyRows, pendingCount] = await Promise.all([
      this.fetchAllPendingTableCallRows(req),
      this.fetchTableCallHistoryRowsForFallback(req),
      this.resolveTableAttentionPendingCountFromTableCalls(req),
    ]);

    const pendingIds = new Set(
      pendingRows
        .map((raw) => Number(raw.id ?? 0))
        .filter((id) => Number.isFinite(id) && id > 0),
    );

    const byId = new Map<number, StaffPresentedOrderEntry>();
    for (const raw of pendingRows) {
      if (isDeliveryUpstreamRow(raw)) continue;
      const presented = this.presenter.presentTableCallRow(raw, auth);
      if (!presented) continue;
      byId.set(presented.staffCallId, presented);
    }
    for (const raw of historyRows) {
      if (isDeliveryUpstreamRow(raw)) continue;
      const id = Number(raw.id ?? 0);
      if (pendingIds.has(id)) continue;
      const presented = this.presenter.presentTableCallRow(raw, auth);
      if (!presented) continue;
      byId.set(presented.staffCallId, presented);
    }

    let entries = [...byId.values()];
    entries = this.presenter.filterByScope(entries, 'active');
    entries = this.filterTableFallbackEntries(entries, query);
    entries = await this.enrichEntriesForStaff(req, 0, auth, entries);
    entries = this.presenter.applyListScopeToEntries(entries, 'active');
    entries = sortTableEntriesByAttention(entries);

    const total = entries.length;
    const start = (page - 1) * limit;
    const pageEntries = entries.slice(start, start + limit);
    const totalPages = Math.max(1, Math.ceil(total / limit) || 1);

    return {
      status: 200,
      data: {
        staffJobRole: auth.staffJobRole,
        permissions: auth.permissions,
        roleName: auth.roleName,
        roleId: auth.roleId,
        channel,
        scope,
        entries: pageEntries,
        total,
        page,
        limit,
        totalPages,
        pendingCount,
        capabilities: this.presenter.capabilitiesFor(auth),
      },
    };
  }

  private filterTableFallbackEntries(
    entries: StaffPresentedOrderEntry[],
    query: Record<string, unknown>,
  ): StaffPresentedOrderEntry[] {
    const q = String(query.q ?? '')
      .trim()
      .toLowerCase();
    const statusFilter = String(query.status ?? '')
      .trim()
      .toLowerCase();
    const dateFrom = String(query.dateFrom ?? '').trim();
    const dateTo = String(query.dateTo ?? '').trim();

    return entries.filter((entry) => {
      if (
        statusFilter &&
        statusFilter !== 'all' &&
        entry.status !== statusFilter
      ) {
        return false;
      }

      if (q) {
        const table = (entry.tableNumber ?? '').toLowerCase();
        const customer = (entry.customerName ?? '').toLowerCase();
        if (!table.includes(q) && !customer.includes(q)) return false;
      }

      if (dateFrom || dateTo) {
        const day = (entry.createdAt ?? '').slice(0, 10);
        if (dateFrom && day && day < dateFrom) return false;
        if (dateTo && day && day > dateTo) return false;
      }

      return true;
    });
  }

  private async fetchAllPendingTableCallRows(
    req: Request,
  ): Promise<Record<string, unknown>[]> {
    const upstream = await this.ensHttp.proxy({
      method: 'GET',
      path: 'staff-auth/table-calls',
      req,
    });
    if (upstream.status >= 400) {
      logUpstreamDenial(
        this.logger,
        'listTableOrdersViaTableCallsFallback staff-auth/table-calls',
        upstream,
      );
      return [];
    }

    const payload = (upstream.data ?? {}) as Record<string, unknown>;
    const calls = Array.isArray(payload.calls) ? payload.calls : [];
    const out: Record<string, unknown>[] = [];
    for (const call of calls) {
      if (!call || typeof call !== 'object') continue;
      const map = call as Record<string, unknown>;
      if (isDeliveryUpstreamRow(map)) continue;
      out.push(map);
    }
    return out;
  }

  private async fetchTableCallHistoryRowsForFallback(
    req: Request,
  ): Promise<Record<string, unknown>[]> {
    const scanLimit = 50;
    let upstreamPage = 1;
    let scannedRows = 0;
    const collected: Record<string, unknown>[] = [];

    while (scannedRows < TABLE_HISTORY_MAX_SCAN_ROWS) {
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
        logUpstreamDenial(
          this.logger,
          'listTableOrdersViaTableCallsFallback staff-auth/table-calls/history',
          upstream,
        );
        break;
      }

      const payload = (upstream.data ?? {}) as Record<string, unknown>;
      const rows = Array.isArray(payload.calls) ? payload.calls : [];
      if (rows.length === 0) break;

      scannedRows += rows.length;

      for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        const map = row as Record<string, unknown>;
        if (isDeliveryUpstreamRow(map)) continue;
        const status = normalizeStaffOrderStatus(map.status);
        // Collect lifecycle rows; active vs history filtering happens later.
        if (
          isActiveStaffOrderStatus(status) ||
          isHistoryStaffOrderStatus(status)
        ) {
          collected.push(map);
        }
      }

      const totalUpstream = Number(payload.total ?? 0);
      const totalPagesUpstream =
        Number(payload.totalPages ?? 0) ||
        (totalUpstream > 0 ? Math.ceil(totalUpstream / scanLimit) : 0);

      if (upstreamPage >= totalPagesUpstream && rows.length < scanLimit) {
        break;
      }
      upstreamPage += 1;
    }

    return collected;
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
    channel: StaffOrderChannel = 'table',
  ): Promise<StaffPresentedOrderEntry[]> {
    if (entries.length === 0 || menuId <= 0) return entries;

    const upstream = await this.ensHttp.proxy({
      method: 'GET',
      path: `menus/${menuId}/activity-logs`,
      req,
      query: { page: 1, limit: 100, channel },
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

  /**
   * Global delivery pending badge count (status === pending).
   * Scans activity-logs channel=delivery without list page/q/date/status filters.
   */
  private async resolveDeliveryPendingCount(
    req: Request,
    menuId: number,
  ): Promise<number> {
    if (menuId <= 0) return 0;

    const scanLimit = 100;
    let upstreamPage = 1;
    let scanned = 0;
    let pending = 0;

    while (scanned < TABLE_ATTENTION_COUNT_MAX_SCAN_ROWS) {
      const upstream = await this.ensHttp.proxy({
        method: 'GET',
        path: `menus/${menuId}/activity-logs`,
        req,
        query: {
          page: upstreamPage,
          limit: scanLimit,
          channel: 'delivery',
        },
      });

      if (upstream.status >= 400) {
        logUpstreamDenial(
          this.logger,
          'resolveDeliveryPendingCount menus/activity-logs',
          upstream,
        );
        break;
      }

      const payload = (upstream.data ?? {}) as Record<string, unknown>;
      const rows = Array.isArray(payload.entries)
        ? payload.entries
        : Array.isArray(payload.calls)
          ? payload.calls
          : [];
      if (rows.length === 0) break;

      for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        const map = row as Record<string, unknown>;
        if (!isDeliveryUpstreamRow(map)) continue;
        const status = resolveListEntryStatus({
          actionDetails: parseActionDetailsList(map.actionDetails),
          status: map.status as string | undefined,
        });
        if (status === 'pending') {
          pending += 1;
        }
      }

      scanned += rows.length;
      const totalUpstream = Number(payload.total ?? 0);
      const totalPagesUpstream =
        Number(payload.totalPages ?? 0) ||
        (totalUpstream > 0 ? Math.ceil(totalUpstream / scanLimit) : 0);

      if (upstreamPage >= totalPagesUpstream || rows.length < scanLimit) {
        break;
      }
      upstreamPage += 1;
    }

    return pending;
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
    const parsed = parseStaffOrderListChannel(raw);
    return parsed === 'all' ? 'table' : parsed;
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
    channel: StaffOrderListChannel,
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
      pendingCount: 0,
      capabilities: this.presenter.capabilitiesFor(auth),
    };
  }

  private dedupeEntriesByStaffCallId(
    entries: StaffPresentedOrderEntry[],
  ): StaffPresentedOrderEntry[] {
    const seen = new Set<number>();
    const out: StaffPresentedOrderEntry[] = [];
    for (const entry of entries) {
      if (entry.staffCallId <= 0 || seen.has(entry.staffCallId)) continue;
      seen.add(entry.staffCallId);
      out.push(entry);
    }
    return out;
  }

  private mergeGraceIntoOperationalPage(
    pageEntries: StaffPresentedOrderEntry[],
    grace: StaffPresentedOrderEntry[],
    limit: number,
  ): StaffPresentedOrderEntry[] {
    const merged = this.dedupeEntriesByStaffCallId([
      ...grace,
      ...pageEntries,
    ]);
    return merged.slice(0, Math.max(limit, pageEntries.length));
  }

  private async fetchOperationalGraceEntries(
    req: Request,
    menuId: number,
    auth: StaffResolvedAuth,
    channel: StaffOrderChannel,
    query: Record<string, unknown>,
  ): Promise<StaffPresentedOrderEntry[]> {
    const statuses = ['delivered', 'cancelled'] as const;
    const collected: StaffPresentedOrderEntry[] = [];

    for (const status of statuses) {
      for (let page = 1; page <= OPERATIONAL_GRACE_SCAN_PAGES; page += 1) {
        const upstream = await this.ensHttp.proxy({
          method: 'GET',
          path: `menus/${menuId}/activity-logs`,
          req,
          query: {
            page,
            limit: 50,
            channel,
            status,
            ...this.deliveryListQueryParams(query, { skipDates: false }),
          },
        });
        if (upstream.status >= 400) break;
        const payload = (upstream.data ?? {}) as Record<string, unknown>;
        const rows = Array.isArray(payload.entries)
          ? payload.entries
          : Array.isArray(payload.calls)
            ? payload.calls
            : [];
        if (rows.length === 0) break;

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
          channel === 'delivery' ? 'delivery' : undefined,
        );
        collected.push(
          ...this.presenter.filterByScope(presented, 'active'),
        );

        const totalPages = Number(payload.totalPages ?? 1) || 1;
        if (page >= totalPages) break;
      }
    }

    return this.presenter.applyListScopeToEntries(
      this.dedupeEntriesByStaffCallId(collected),
      'active',
    );
  }

  private async estimateScopedActivityLogTotal(input: {
    req: Request;
    menuId: number;
    auth: StaffResolvedAuth;
    channel: StaffOrderChannel;
    scope: Scope;
    query: Record<string, unknown>;
    seedPresented: StaffPresentedOrderEntry[];
    seedPayload: Record<string, unknown>;
  }): Promise<number> {
    const matched = [
      ...this.presenter.filterByScope(input.seedPresented, input.scope),
    ];
    const seedTotalPages =
      Number(input.seedPayload.totalPages ?? 1) || 1;
    const limit = Math.min(
      100,
      Math.max(1, Number(input.query.limit ?? 50) || 50),
    );

    for (
      let page = 2;
      page <= Math.min(seedTotalPages, ARCHIVE_SCOPE_MAX_SCAN_PAGES);
      page += 1
    ) {
      const upstream = await this.ensHttp.proxy({
        method: 'GET',
        path: `menus/${input.menuId}/activity-logs`,
        req: input.req,
        query: {
          page,
          limit,
          channel: input.channel,
          ...this.deliveryListQueryParams(input.query),
        },
      });
      if (upstream.status >= 400) break;
      const payload = (upstream.data ?? {}) as Record<string, unknown>;
      const rows = Array.isArray(payload.entries)
        ? payload.entries
        : Array.isArray(payload.calls)
          ? payload.calls
          : [];
      if (rows.length === 0) break;

      let presented = rows
        .map((row) =>
          this.presenter.presentListRow(
            row as Record<string, unknown>,
            input.auth,
            input.channel,
          ),
        )
        .filter((entry): entry is StaffPresentedOrderEntry => entry != null);
      presented = await this.enrichEntriesActionDetailsFromActivityLogs(
        input.req,
        input.menuId,
        presented,
        input.channel === 'delivery' ? 'delivery' : undefined,
      );
      matched.push(...this.presenter.filterByScope(presented, input.scope));
    }

    return this.dedupeEntriesByStaffCallId(matched).length;
  }

  private async listUnifiedArchiveOrders(
    req: Request,
    auth: StaffResolvedAuth,
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

    const channels: StaffOrderChannel[] = [];
    if (canStaffViewOrders(auth)) channels.push('table');
    if (canStaffViewDelivery(auth)) channels.push('delivery');

    if (channels.length === 0) {
      return {
        status: 200,
        data: this.emptyList(auth, 'all', 'history', page, limit),
      };
    }

    const collected: StaffPresentedOrderEntry[] = [];
    for (const channel of channels) {
      const channelEntries = await this.scanArchiveEntriesForChannel(
        req,
        menuId,
        auth,
        channel,
        query,
      );
      collected.push(...channelEntries);
    }

    const deduped = this.dedupeEntriesByStaffCallId(collected);
    deduped.sort((a, b) => {
      const tb = terminalAtSortMs({
        status: b.status,
        actionDetails: b.actionDetails,
        createdAt: b.createdAt,
      });
      const ta = terminalAtSortMs({
        status: a.status,
        actionDetails: a.actionDetails,
        createdAt: a.createdAt,
      });
      if (tb !== ta) return tb - ta;
      return b.staffCallId - a.staffCallId;
    });

    const total = deduped.length;
    const slice = deduped.slice((page - 1) * limit, page * limit);
    const entries = this.presenter.applyListScopeToEntries(slice, 'history');
    const enriched = await this.enrichEntriesForStaff(
      req,
      menuId,
      auth,
      entries,
    );

    return {
      status: 200,
      data: {
        staffJobRole: auth.staffJobRole,
        permissions: auth.permissions,
        roleName: auth.roleName,
        roleId: auth.roleId,
        channel: 'all',
        scope: 'history',
        entries: enriched,
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit) || 1),
        pendingCount: 0,
        capabilities: this.presenter.capabilitiesFor(auth),
      },
    };
  }

  private async scanArchiveEntriesForChannel(
    req: Request,
    menuId: number,
    auth: StaffResolvedAuth,
    channel: StaffOrderChannel,
    query: Record<string, unknown>,
  ): Promise<StaffPresentedOrderEntry[]> {
    const matched: StaffPresentedOrderEntry[] = [];
    const scanLimit = 50;

    for (let page = 1; page <= ARCHIVE_SCOPE_MAX_SCAN_PAGES; page += 1) {
      const upstream = await this.ensHttp.proxy({
        method: 'GET',
        path: `menus/${menuId}/activity-logs`,
        req,
        query: {
          page,
          limit: scanLimit,
          channel,
          ...this.deliveryListQueryParams(query),
        },
      });
      if (upstream.status >= 400) break;
      const payload = (upstream.data ?? {}) as Record<string, unknown>;
      const rows = Array.isArray(payload.entries)
        ? payload.entries
        : Array.isArray(payload.calls)
          ? payload.calls
          : [];
      if (rows.length === 0) break;

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
        channel === 'delivery' ? 'delivery' : undefined,
      );
      matched.push(...this.presenter.filterByScope(presented, 'history'));

      const totalPages = Number(payload.totalPages ?? 1) || 1;
      if (page >= totalPages) break;
    }

    return matched;
  }
}
