"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var StaffOrdersFlowService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.StaffOrdersFlowService = void 0;
const common_1 = require("@nestjs/common");
const ens_http_service_1 = require("../../infrastructure/ens-backend/ens-http.service");
const staff_order_actions_util_1 = require("./staff-order-actions.util");
const staff_order_errors_util_1 = require("./staff-order-errors.util");
const staff_capability_mapper_1 = require("./staff-capability.mapper");
const staff_menu_scope_util_1 = require("./staff-menu-scope.util");
const staff_order_presenter_service_1 = require("./staff-order-presenter.service");
const staff_order_channel_util_1 = require("./staff-order-channel.util");
const staff_order_status_util_1 = require("./staff-order-status.util");
const staff_table_history_filters_util_1 = require("./staff-table-history-filters.util");
const staff_table_order_util_1 = require("./staff-table-order.util");
const staff_table_order_creator_registry_1 = require("./staff-table-order-creator.registry");
const staff_order_self_accept_util_1 = require("./staff-order-self-accept.util");
const jwt_payload_util_1 = require("../../common/utils/jwt-payload.util");
const STAFF_AUTH_CACHE = Symbol('staffAuthCache');
let StaffOrdersFlowService = StaffOrdersFlowService_1 = class StaffOrdersFlowService {
    constructor(ensHttp, presenter, tableOrderCreators) {
        this.ensHttp = ensHttp;
        this.presenter = presenter;
        this.tableOrderCreators = tableOrderCreators;
        this.logger = new common_1.Logger(StaffOrdersFlowService_1.name);
    }
    resolveMenuId(req, query = {}, body) {
        return (0, staff_menu_scope_util_1.resolveStaffMenuId)(req, query, body);
    }
    async resolveStaffAuth(req) {
        const cached = req[STAFF_AUTH_CACHE];
        if (cached)
            return cached.auth;
        let auth = (0, staff_capability_mapper_1.emptyStaffResolvedAuth)();
        let menuSlug = null;
        try {
            const me = await this.ensHttp.proxy({
                method: 'GET',
                path: 'staff-auth/me',
                req,
            });
            if (me.status < 400) {
                const payload = me.data ?? {};
                const staff = payload.staff && typeof payload.staff === 'object'
                    ? payload.staff
                    : null;
                const roleObj = payload.role && typeof payload.role === 'object'
                    ? payload.role
                    : null;
                const roleIdRaw = staff?.roleId ?? roleObj?.id ?? null;
                const roleIdNum = Number(roleIdRaw);
                const roleId = roleIdRaw != null && Number.isFinite(roleIdNum) ? roleIdNum : null;
                const roleNameRaw = staff?.roleName ?? roleObj?.name ?? null;
                const roleName = roleNameRaw != null && String(roleNameRaw).trim().length > 0
                    ? String(roleNameRaw).trim()
                    : null;
                auth = (0, staff_capability_mapper_1.buildStaffResolvedAuth)({
                    permissions: payload.permissions,
                    roleName,
                    roleId,
                    legacyRole: staff?.role,
                });
                const menu = payload.menu && typeof payload.menu === 'object'
                    ? payload.menu
                    : null;
                const slug = String(menu?.slug ?? '').trim();
                if (slug.length > 0)
                    menuSlug = slug;
            }
        }
        catch {
        }
        Object.defineProperty(req, STAFF_AUTH_CACHE, {
            value: { auth, menuSlug },
            writable: false,
            enumerable: false,
            configurable: true,
        });
        return auth;
    }
    resolveStaffId(req) {
        return (0, jwt_payload_util_1.getAuthIdentity)(req)?.userId ?? 0;
    }
    async enrichEntryForStaff(req, menuId, auth, entry) {
        const currentStaffId = this.resolveStaffId(req);
        const createdByStaffId = this.tableOrderCreators.lookup(menuId, entry.staffCallId);
        return (0, staff_order_self_accept_util_1.applyStaffOrderSelfAcceptRules)(entry, {
            auth,
            currentStaffId,
            createdByStaffId,
        });
    }
    async enrichEntriesForStaff(req, menuId, auth, entries) {
        if (entries.length === 0 || menuId <= 0)
            return entries;
        const currentStaffId = this.resolveStaffId(req);
        return entries.map((entry) => (0, staff_order_self_accept_util_1.applyStaffOrderSelfAcceptRules)(entry, {
            auth,
            currentStaffId,
            createdByStaffId: this.tableOrderCreators.lookup(menuId, entry.staffCallId),
        }));
    }
    async listOrders(req, query) {
        const auth = await this.resolveStaffAuth(req);
        const channel = this.parseChannel(query.channel);
        const page = Math.max(1, Number(query.page ?? 1) || 1);
        const limit = Math.min(100, Math.max(1, Number(query.limit ?? 50) || 50));
        if (this.isRecentScopeRequest(query.scope)) {
            return (0, staff_order_errors_util_1.staffScopeDeniedResult)('recent');
        }
        const scope = this.parseScope(query.scope);
        if (scope === 'history' && !(0, staff_order_actions_util_1.canStaffViewHistory)(auth)) {
            return (0, staff_order_errors_util_1.staffHistoryDeniedResult)();
        }
        if (channel === 'delivery') {
            if (!(0, staff_order_actions_util_1.canStaffViewDelivery)(auth)) {
                return {
                    status: 200,
                    data: this.emptyList(auth, channel, scope, page, limit),
                };
            }
            return this.listDeliveryOrders(req, auth, channel, scope, page, limit, query);
        }
        if (!(0, staff_order_actions_util_1.canStaffViewOrders)(auth)) {
            return {
                status: 200,
                data: this.emptyList(auth, channel, scope, page, limit),
            };
        }
        return this.listTableOrders(req, auth, channel, scope, page, limit, query);
    }
    async getOrder(req, staffCallId, query) {
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
        let detailRaw = null;
        if ((0, staff_order_actions_util_1.canStaffViewDelivery)(auth)) {
            const resolvedLogId = Number.isFinite(activityLogId) && activityLogId > 0
                ? activityLogId
                : await this.resolveActivityLogId(req, menuId, staffCallId, activityLogId);
            if (resolvedLogId > 0) {
                const logRaw = await this.fetchActivityLogRaw(req, menuId, resolvedLogId);
                if (logRaw && (0, staff_order_channel_util_1.isDeliveryUpstreamRow)(logRaw)) {
                    detailRaw = logRaw;
                }
            }
        }
        if (!detailRaw) {
            const tableRaw = await this.fetchTableCallRaw(req, staffCallId);
            if (tableRaw) {
                if ((0, staff_order_channel_util_1.isDeliveryUpstreamRow)(tableRaw) && !(0, staff_order_actions_util_1.canStaffViewDelivery)(auth)) {
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
                if (!(0, staff_order_channel_util_1.isDeliveryUpstreamRow)(tableRaw) || (0, staff_order_actions_util_1.canStaffViewDelivery)(auth)) {
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
        if (entry.channel === 'table' && !(0, staff_order_actions_util_1.canStaffViewOrders)(auth)) {
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
        scopedEntry = await this.enrichEntryForStaff(req, menuId, auth, scopedEntry);
        if (!(0, staff_order_actions_util_1.canStaffViewHistory)(auth) &&
            !(0, staff_order_status_util_1.isActiveStaffOrderStatus)(entry.status)) {
            return {
                denied: true,
                httpStatus: 404,
                data: { error: 'Order not found', code: 'ORDER_NOT_FOUND' },
            };
        }
        if (entry.channel === 'delivery' && !(0, staff_order_actions_util_1.canStaffViewDelivery)(auth)) {
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
            ? detailRaw.actions
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
    async postOrderAction(req, staffCallId, action, menuId, activityLogId) {
        const auth = await this.resolveStaffAuth(req);
        const normalizedAction = String(action ?? '').trim();
        const resolvedMenuId = menuId > 0 ? menuId : this.resolveMenuId(req, {});
        if (!resolvedMenuId || staffCallId <= 0) {
            return {
                status: 400,
                data: {
                    error: 'Invalid order payload',
                    code: 'INVALID_ORDER',
                },
            };
        }
        if (!(0, staff_order_actions_util_1.canPerformOrderAction)(auth, normalizedAction)) {
            return {
                status: 403,
                data: {
                    error: 'Action not allowed for your permissions',
                    errorAr: 'هذا الإجراء غير مسموح لصلاحياتك',
                    code: 'STAFF_ACTION_DENIED',
                },
            };
        }
        if (normalizedAction === 'TABLE_CALL_CONFIRMED') {
            const staffId = this.resolveStaffId(req);
            const createdByStaffId = this.tableOrderCreators.lookup(resolvedMenuId, staffCallId);
            if ((0, staff_order_self_accept_util_1.shouldBlockStaffSelfAccept)({
                channel: 'table',
                status: 'pending',
                createdByStaffId,
                auth,
                currentStaffId: staffId,
            })) {
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
        const tableCallRaw = await this.fetchTableCallRaw(req, staffCallId);
        const hasTableCall = tableCallRaw != null;
        const isDeliveryCall = tableCallRaw != null && (0, staff_order_channel_util_1.isDeliveryUpstreamRow)(tableCallRaw);
        const logId = await this.resolveActivityLogId(req, resolvedMenuId, staffCallId, activityLogId);
        let upstream;
        if (normalizedAction === 'TABLE_CALL_PREPARED' && hasTableCall) {
            if (isDeliveryCall && logId > 0) {
                const autoConfirm = await this.autoConfirmPendingDeliveryOrder(req, resolvedMenuId, staffCallId, logId);
                if (autoConfirm) {
                    return autoConfirm;
                }
            }
            upstream = await this.ensHttp.proxy({
                method: 'PATCH',
                path: `staff-auth/table-calls/${staffCallId}/prepare`,
                req,
                body: {},
            });
        }
        else if (isDeliveryCall &&
            logId > 0 &&
            (normalizedAction === 'TABLE_CALL_CONFIRMED' ||
                normalizedAction === 'TABLE_CALL_CANCELLED' ||
                normalizedAction === 'TABLE_CALL_PREPARED' ||
                normalizedAction === 'TABLE_CALL_DELIVERED')) {
            if (normalizedAction === 'TABLE_CALL_PREPARED') {
                const autoConfirm = await this.autoConfirmPendingDeliveryOrder(req, resolvedMenuId, staffCallId, logId);
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
        }
        else if (!isDeliveryCall &&
            logId > 0 &&
            normalizedAction === 'TABLE_CALL_DELIVERED') {
            upstream = await this.ensHttp.proxy({
                method: 'POST',
                path: `menus/${resolvedMenuId}/activity-logs/${logId}/actions`,
                req,
                body: { action: normalizedAction },
            });
        }
        else if (normalizedAction === 'TABLE_CALL_CONFIRMED' ||
            normalizedAction === 'TABLE_CALL_CANCELLED') {
            const status = (0, staff_order_status_util_1.orderStatusFromAction)(normalizedAction);
            upstream = await this.ensHttp.proxy({
                method: 'PATCH',
                path: `staff-auth/table-calls/${staffCallId}/status`,
                req,
                body: { status },
            });
        }
        else {
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
            return (0, staff_order_errors_util_1.normalizeStaffUpstreamError)(upstream);
        }
        return this.presentOrderMutation(req, staffCallId, resolvedMenuId, activityLogId);
    }
    async autoConfirmPendingDeliveryOrder(req, menuId, staffCallId, logId) {
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
            return (0, staff_order_errors_util_1.normalizeStaffUpstreamError)(confirmUpstream);
        }
        return null;
    }
    async getCapabilities(req) {
        const auth = await this.resolveStaffAuth(req);
        return {
            permissions: auth.permissions,
            roleName: auth.roleName,
            roleId: auth.roleId,
            staffJobRole: auth.staffJobRole,
            capabilities: this.presenter.capabilitiesFor(auth),
        };
    }
    canCreateTableOrders(auth) {
        return ((0, staff_capability_mapper_1.staffHasPermission)(auth, 'orders:confirm') ||
            (0, staff_capability_mapper_1.staffHasPermission)(auth, 'orders:edit_items'));
    }
    async listRestaurantTables(req) {
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
            return (0, staff_order_errors_util_1.normalizeStaffUpstreamError)(upstream);
        }
        const tables = (0, staff_table_order_util_1.parsePublicMenuTablesPayload)(upstream.data);
        return {
            status: 200,
            data: {
                menuId,
                tables,
            },
        };
    }
    async createTableOrder(req, body) {
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
            return (0, staff_order_errors_util_1.normalizeStaffUpstreamError)(upstream);
        }
        const staffCallId = (0, staff_table_order_util_1.parseStaffCallCreateId)(upstream.data);
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
        const creatorStaffId = this.resolveStaffId(req);
        if (creatorStaffId > 0) {
            this.tableOrderCreators.record(menuId, staffCallId, creatorStaffId);
        }
        return this.presentOrderMutation(req, staffCallId, menuId);
    }
    async patchOrderItems(req, staffCallId, menuId, items, activityLogId) {
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
        if (entry.channel === 'delivery' && !(0, staff_order_actions_util_1.canStaffViewDelivery)(auth)) {
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
            return (0, staff_order_errors_util_1.normalizeStaffUpstreamError)(upstream);
        }
        return this.presentOrderMutation(req, staffCallId, menuId, activityLogId);
    }
    async resolveMenuSlug(req) {
        await this.resolveStaffAuth(req);
        const cached = req[STAFF_AUTH_CACHE];
        return cached?.menuSlug ?? null;
    }
    async getMenuCatalog(req, query) {
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
        const upstreamQuery = {};
        for (const key of ['locale', 'page', 'limit', 'pageSize', 'categoryId']) {
            const value = query[key];
            if (value === undefined || value === null || value === '')
                continue;
            upstreamQuery[key] = value;
        }
        const upstream = await this.ensHttp.proxy({
            method: 'GET',
            path: `public/menu/${encodeURIComponent(slug)}/catalog`,
            req,
            query: upstreamQuery,
        });
        if (upstream.status >= 400) {
            return (0, staff_order_errors_util_1.normalizeStaffUpstreamError)(upstream);
        }
        const body = upstream.data;
        const data = body?.data && typeof body.data === 'object'
            ? body.data
            : body;
        return {
            status: 200,
            data: data ?? {},
        };
    }
    async listTableOrders(req, auth, channel, scope, page, limit, query) {
        if (scope === 'history') {
            return this.listTableHistory(req, auth, channel, page, limit, query);
        }
        const pendingUpstream = await this.ensHttp.proxy({
            method: 'GET',
            path: 'staff-auth/table-calls',
            req,
            query: { limit: Math.min(limit, 100) },
        });
        if (pendingUpstream.status >= 400) {
            return (0, staff_order_errors_util_1.rejectUpstreamListResult)(this.logger, 'listTableOrders staff-auth/table-calls', pendingUpstream);
        }
        const pendingPayload = (pendingUpstream.data ?? {});
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
            return (0, staff_order_errors_util_1.rejectUpstreamListResult)(this.logger, 'listTableOrders staff-auth/table-calls/history', historyUpstream);
        }
        const historyPayload = (historyUpstream.data ?? {});
        const historyRows = Array.isArray(historyPayload.calls)
            ? historyPayload.calls
            : [];
        const mergedRows = [];
        const seenIds = new Set();
        for (const row of pendingRows) {
            if (!row || typeof row !== 'object')
                continue;
            const map = row;
            if ((0, staff_order_channel_util_1.isDeliveryUpstreamRow)(map))
                continue;
            const id = Number(map.id ?? 0);
            if (!Number.isFinite(id) || id <= 0 || seenIds.has(id))
                continue;
            seenIds.add(id);
            mergedRows.push(map);
        }
        for (const row of historyRows) {
            if (!row || typeof row !== 'object')
                continue;
            const map = row;
            if ((0, staff_order_channel_util_1.isDeliveryUpstreamRow)(map))
                continue;
            const status = String(map.status ?? '')
                .trim()
                .toLowerCase();
            if (status !== 'confirmed' && status !== 'prepared')
                continue;
            const id = Number(map.id ?? 0);
            if (!Number.isFinite(id) || id <= 0 || seenIds.has(id))
                continue;
            seenIds.add(id);
            mergedRows.push({
                ...map,
                at: map.requestedAt ?? map.at,
                items: map.items ?? [],
            });
        }
        let presented = mergedRows
            .map((row) => this.presenter.presentTableCallRow(row, auth))
            .filter((entry) => entry != null)
            .filter((entry) => entry.channel === channel);
        presented = await this.hydrateTableActiveListEntries(req, auth, presented);
        presented = this.sortActiveTableEntries(presented);
        presented = this.presenter.filterByScope(presented, scope);
        presented = this.presenter.applyListScopeToEntries(presented, scope);
        const menuId = this.resolveMenuId(req, {});
        presented = await this.enrichEntriesForStaff(req, menuId, auth, presented);
        const total = presented.length;
        const start = (page - 1) * limit;
        const paged = presented.slice(start, start + limit);
        const totalPages = Math.max(1, Math.ceil(total / limit));
        return {
            status: 200,
            data: {
                staffJobRole: auth.staffJobRole,
                permissions: auth.permissions,
                roleName: auth.roleName,
                roleId: auth.roleId,
                channel,
                scope,
                entries: paged,
                total,
                page,
                limit,
                totalPages,
                capabilities: this.presenter.capabilitiesFor(auth),
            },
        };
    }
    sortActiveTableEntries(entries) {
        return [...entries].sort((a, b) => {
            const aPending = a.status === 'pending' ? 0 : 1;
            const bPending = b.status === 'pending' ? 0 : 1;
            if (aPending !== bPending)
                return aPending - bPending;
            const aTime = Date.parse(a.createdAt ?? '') || 0;
            const bTime = Date.parse(b.createdAt ?? '') || 0;
            return bTime - aTime;
        });
    }
    async hydrateTableActiveListEntries(req, auth, entries) {
        const sparse = entries.filter((entry) => entry.items.length === 0);
        if (sparse.length === 0)
            return entries;
        const fetches = sparse.slice(0, 20).map(async (entry) => {
            const raw = await this.fetchTableCallRaw(req, entry.staffCallId);
            return { staffCallId: entry.staffCallId, raw };
        });
        const results = await Promise.all(fetches);
        const index = new Map();
        for (const row of results) {
            if (row.raw && !(0, staff_order_channel_util_1.isDeliveryUpstreamRow)(row.raw)) {
                index.set(row.staffCallId, row.raw);
            }
        }
        return entries.map((entry) => {
            const raw = index.get(entry.staffCallId);
            if (!raw)
                return entry;
            return this.presenter.mergeCallHydration(entry, raw, auth);
        });
    }
    resolveDetailListScope(auth, query) {
        if (!(0, staff_order_actions_util_1.canStaffViewHistory)(auth)) {
            return 'active';
        }
        return this.parseScope(query.scope);
    }
    async listDeliveryOrders(req, auth, channel, scope, page, limit, query) {
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
        const upstreamQuery = {
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
            return (0, staff_order_errors_util_1.rejectUpstreamListResult)(this.logger, 'listDeliveryOrders menus/activity-logs', upstream);
        }
        const payload = (upstream.data ?? {});
        const rows = Array.isArray(payload.entries)
            ? payload.entries
            : Array.isArray(payload.calls)
                ? payload.calls
                : [];
        let presented = rows
            .map((row) => this.presenter.presentListRow(row, auth, channel))
            .filter((entry) => entry != null);
        presented = await this.hydrateListEntries(req, menuId, auth, channel, presented);
        presented = await this.enrichEntriesActionDetailsFromActivityLogs(req, menuId, presented);
        const scoped = this.presenter.applyListScopeToEntries(this.presenter.filterByScope(presented, scope), scope);
        const enriched = await this.enrichEntriesForStaff(req, menuId, auth, scoped);
        const total = Number(payload.total ?? enriched.length) || enriched.length;
        const totalPages = Number(payload.totalPages ?? Math.ceil(total / limit)) ||
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
    async listTableHistory(req, auth, channel, page, limit, query) {
        const dateRange = (0, staff_table_history_filters_util_1.resolveTableHistoryDateRange)(query, 'history', channel);
        const needed = page * limit;
        const scanLimit = 50;
        let upstreamPage = 1;
        let scannedRows = 0;
        const collected = [];
        while (collected.length < needed &&
            scannedRows < staff_table_history_filters_util_1.TABLE_HISTORY_MAX_SCAN_ROWS) {
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
                return (0, staff_order_errors_util_1.rejectUpstreamListResult)(this.logger, 'listTableHistory staff-auth/table-calls/history', upstream);
            }
            const payload = (upstream.data ?? {});
            const rows = Array.isArray(payload.calls) ? payload.calls : [];
            if (rows.length === 0)
                break;
            scannedRows += rows.length;
            let presented = rows
                .filter((row) => row != null &&
                typeof row === 'object' &&
                !(0, staff_order_channel_util_1.isDeliveryUpstreamRow)(row))
                .map((row) => this.presenter.presentTableCallRow(row, auth))
                .filter((entry) => entry != null);
            presented = this.presenter.filterByScope(presented, 'history');
            presented = (0, staff_table_history_filters_util_1.filterEntriesByDateRange)(presented, dateRange);
            collected.push(...presented);
            const totalUpstream = Number(payload.total ?? 0);
            const totalPagesUpstream = Number(payload.totalPages ?? 0) ||
                (totalUpstream > 0 ? Math.ceil(totalUpstream / scanLimit) : 0);
            if (upstreamPage >= totalPagesUpstream && rows.length < scanLimit) {
                break;
            }
            upstreamPage += 1;
        }
        return {
            status: 200,
            data: (0, staff_table_history_filters_util_1.buildTableHistoryListResult)({
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
    deliveryListQueryParams(query, options) {
        const params = {};
        const keys = options?.skipDates
            ? ['q', 'status']
            : ['q', 'dateFrom', 'dateTo', 'status'];
        for (const key of keys) {
            const value = query[key];
            if (value === undefined || value === null || value === '') {
                continue;
            }
            params[key] = value;
        }
        return params;
    }
    async presentOrderMutation(req, staffCallId, menuId, activityLogId) {
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
    async hydrateListEntries(req, menuId, auth, channel, entries) {
        if (entries.length === 0)
            return entries;
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
        const detailIndex = new Map();
        for (const row of fetched) {
            if (row.raw && !(0, staff_order_channel_util_1.isDeliveryUpstreamRow)(row.raw)) {
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
    async enrichEntriesActionDetailsFromActivityLogs(req, menuId, entries) {
        if (entries.length === 0 || menuId <= 0)
            return entries;
        const upstream = await this.ensHttp.proxy({
            method: 'GET',
            path: `menus/${menuId}/activity-logs`,
            req,
            query: { page: 1, limit: 100, channel: 'table' },
        });
        if (upstream.status >= 400) {
            (0, staff_order_errors_util_1.logUpstreamDenial)(this.logger, 'enrichEntriesActionDetailsFromActivityLogs menus/activity-logs', upstream);
            return entries;
        }
        const payload = (upstream.data ?? {});
        const rows = Array.isArray(payload.entries)
            ? payload.entries
            : Array.isArray(payload.calls)
                ? payload.calls
                : [];
        const logRows = rows.filter((row) => row != null && typeof row === 'object');
        return this.presenter.enrichEntriesActionDetails(entries, logRows);
    }
    async hydrateDeliveryListEntries(req, menuId, auth, entries) {
        const sparse = entries.filter((entry) => entry.channel === 'delivery' &&
            entry.activityLogId != null &&
            entry.activityLogId > 0 &&
            this.deliveryEntryNeedsHydration(entry));
        if (sparse.length === 0)
            return entries;
        const fetches = sparse.slice(0, 20).map(async (entry) => {
            const raw = await this.fetchActivityLogRaw(req, menuId, entry.activityLogId);
            return { activityLogId: entry.activityLogId, raw };
        });
        const results = await Promise.all(fetches);
        const index = new Map();
        for (const row of results) {
            if (row.raw)
                index.set(row.activityLogId, row.raw);
        }
        return entries.map((entry) => {
            const logId = entry.activityLogId;
            if (logId == null)
                return entry;
            const raw = index.get(logId);
            if (!raw)
                return entry;
            const hydrated = this.presenter.presentListRow(raw, auth, 'delivery');
            if (!hydrated)
                return entry;
            return {
                ...hydrated,
                id: entry.id,
                activityLogId: entry.activityLogId,
            };
        });
    }
    deliveryEntryNeedsHydration(entry) {
        return (entry.items.length === 0 ||
            !entry.customerName ||
            !entry.customerPhone ||
            entry.customerAddress == null ||
            entry.deliveryFee == null);
    }
    async fetchActivityLogRaw(req, menuId, activityLogId) {
        const activity = await this.ensHttp.proxy({
            method: 'GET',
            path: `menus/${menuId}/activity-logs/${activityLogId}`,
            req,
        });
        if (activity.status >= 400)
            return null;
        const payload = activity.data;
        const entry = payload?.entry;
        if (!entry || typeof entry !== 'object')
            return null;
        const map = entry;
        const order = map.order && typeof map.order === 'object'
            ? map.order
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
    async fetchPendingTableCallsIndex(req) {
        const upstream = await this.ensHttp.proxy({
            method: 'GET',
            path: 'staff-auth/table-calls',
            req,
        });
        const payload = (upstream.data ?? {});
        const calls = Array.isArray(payload.calls) ? payload.calls : [];
        const index = new Map();
        for (const call of calls) {
            if (!call || typeof call !== 'object')
                continue;
            const map = call;
            if ((0, staff_order_channel_util_1.isDeliveryUpstreamRow)(map))
                continue;
            const id = Number(map.id ?? 0);
            if (Number.isFinite(id) && id > 0) {
                index.set(id, map);
            }
        }
        return index;
    }
    async fetchTableCallRaw(req, staffCallId) {
        const call = await this.ensHttp.proxy({
            method: 'GET',
            path: `staff-auth/table-calls/${staffCallId}`,
            req,
        });
        if (call.status >= 400)
            return null;
        const callBody = call.data;
        const callData = callBody?.call && typeof callBody.call === 'object'
            ? callBody.call
            : callBody;
        if (!callData || typeof callData !== 'object')
            return null;
        return {
            ...callData,
            orderId: callData.id ?? staffCallId,
            totalPrice: callData.orderTotal,
            items: callData.items,
            status: callData.status,
        };
    }
    async resolveActivityLogId(req, menuId, staffCallId, activityLogId) {
        if (activityLogId && activityLogId > 0)
            return activityLogId;
        const upstream = await this.ensHttp.proxy({
            method: 'GET',
            path: `menus/${menuId}/activity-logs`,
            req,
            query: { page: 1, limit: 100 },
        });
        const payload = (upstream.data ?? {});
        const rows = Array.isArray(payload.entries)
            ? payload.entries
            : Array.isArray(payload.calls)
                ? payload.calls
                : [];
        for (const row of rows) {
            const map = row;
            if (Number(map.orderId) === staffCallId) {
                const id = Number(map.id);
                if (Number.isFinite(id) && id > 0)
                    return id;
            }
        }
        return 0;
    }
    parseChannel(raw) {
        return String(raw ?? 'table').trim().toLowerCase() === 'delivery'
            ? 'delivery'
            : 'table';
    }
    parseScope(raw) {
        const value = String(raw ?? 'active').trim().toLowerCase();
        if (value === 'history')
            return 'history';
        return 'active';
    }
    isRecentScopeRequest(raw) {
        return String(raw ?? '').trim().toLowerCase() === 'recent';
    }
    emptyList(auth, channel, scope, page, limit) {
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
};
exports.StaffOrdersFlowService = StaffOrdersFlowService;
exports.StaffOrdersFlowService = StaffOrdersFlowService = StaffOrdersFlowService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [ens_http_service_1.EnsHttpService,
        staff_order_presenter_service_1.StaffOrderPresenterService,
        staff_table_order_creator_registry_1.StaffTableOrderCreatorRegistry])
], StaffOrdersFlowService);
//# sourceMappingURL=staff-orders-flow.service.js.map