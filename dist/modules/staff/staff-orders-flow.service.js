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
const staff_job_role_util_1 = require("./staff-job-role.util");
const staff_order_presenter_service_1 = require("./staff-order-presenter.service");
const staff_order_channel_util_1 = require("./staff-order-channel.util");
const staff_order_status_util_1 = require("./staff-order-status.util");
const staff_table_history_filters_util_1 = require("./staff-table-history-filters.util");
const staff_table_order_util_1 = require("./staff-table-order.util");
const staff_table_order_creator_registry_1 = require("./staff-table-order-creator.registry");
const staff_order_self_accept_util_1 = require("./staff-order-self-accept.util");
let StaffOrdersFlowService = StaffOrdersFlowService_1 = class StaffOrdersFlowService {
    constructor(ensHttp, presenter, tableOrderCreators) {
        this.ensHttp = ensHttp;
        this.presenter = presenter;
        this.tableOrderCreators = tableOrderCreators;
        this.logger = new common_1.Logger(StaffOrdersFlowService_1.name);
    }
    parseMenuId(query, body) {
        const raw = body?.menuId ?? query.menuId;
        const parsed = Number(raw);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    }
    async resolveMenuId(req, query) {
        const fromQuery = this.parseMenuId(query);
        if (fromQuery > 0) {
            return fromQuery;
        }
        try {
            const me = await this.ensHttp.proxy({
                method: 'GET',
                path: 'staff-auth/me',
                req,
            });
            if (me.status >= 400) {
                return 0;
            }
            const payload = me.data;
            const menu = payload?.menu;
            if (menu && typeof menu === 'object') {
                const id = Number(menu.id ?? 0);
                if (Number.isFinite(id) && id > 0) {
                    return id;
                }
            }
        }
        catch {
        }
        return 0;
    }
    async resolveRole(req) {
        const fromJwt = (0, staff_job_role_util_1.staffJobRoleFromRequest)(req);
        if (fromJwt === 'cashier')
            return 'cashier';
        try {
            const me = await this.ensHttp.proxy({
                method: 'GET',
                path: 'staff-auth/me',
                req,
            });
            const staff = me.data?.staff;
            if (staff && typeof staff === 'object') {
                const role = (0, staff_job_role_util_1.normalizeStaffJobRole)(staff.role);
                if (role !== 'unknown')
                    return role;
            }
        }
        catch {
        }
        return fromJwt === 'unknown' ? 'waiter' : fromJwt;
    }
    async resolveStaffId(req) {
        try {
            const me = await this.ensHttp.proxy({
                method: 'GET',
                path: 'staff-auth/me',
                req,
            });
            if (me.status >= 400)
                return 0;
            const staff = me.data?.staff;
            if (staff && typeof staff === 'object') {
                const id = Number(staff.id ?? 0);
                if (Number.isFinite(id) && id > 0)
                    return id;
            }
        }
        catch {
        }
        return 0;
    }
    async enrichEntryForStaff(req, menuId, role, entry) {
        const currentStaffId = await this.resolveStaffId(req);
        const createdByStaffId = this.tableOrderCreators.lookup(menuId, entry.staffCallId);
        return (0, staff_order_self_accept_util_1.applyStaffOrderSelfAcceptRules)(entry, {
            role,
            currentStaffId,
            createdByStaffId,
        });
    }
    async enrichEntriesForStaff(req, menuId, role, entries) {
        if (entries.length === 0 || menuId <= 0)
            return entries;
        const currentStaffId = await this.resolveStaffId(req);
        return entries.map((entry) => (0, staff_order_self_accept_util_1.applyStaffOrderSelfAcceptRules)(entry, {
            role,
            currentStaffId,
            createdByStaffId: this.tableOrderCreators.lookup(menuId, entry.staffCallId),
        }));
    }
    async listOrders(req, query) {
        const role = await this.resolveRole(req);
        const channel = this.parseChannel(query.channel);
        const page = Math.max(1, Number(query.page ?? 1) || 1);
        const limit = Math.min(100, Math.max(1, Number(query.limit ?? 50) || 50));
        if (this.isRecentScopeRequest(query.scope)) {
            return (0, staff_order_errors_util_1.staffScopeDeniedResult)('recent');
        }
        const scope = this.parseScope(query.scope);
        if (role === 'waiter' && scope === 'history') {
            return (0, staff_order_errors_util_1.staffHistoryDeniedResult)();
        }
        if (channel === 'delivery' && !(0, staff_order_actions_util_1.canStaffViewDelivery)(role)) {
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
    async getOrder(req, staffCallId, query) {
        const role = await this.resolveRole(req);
        const menuId = this.parseMenuId(query) || (await this.resolveMenuId(req, query));
        const activityLogId = Number(query.activityLogId ?? 0);
        if (menuId <= 0 || staffCallId <= 0) {
            return {
                denied: true,
                httpStatus: 404,
                data: { error: 'Order not found', code: 'ORDER_NOT_FOUND' },
            };
        }
        let detailRaw = null;
        if (role === 'cashier') {
            const resolvedLogId = Number.isFinite(activityLogId) && activityLogId > 0
                ? activityLogId
                : await this.resolveActivityLogId(req, menuId, staffCallId, activityLogId);
            if (resolvedLogId > 0) {
                detailRaw = await this.fetchActivityLogRaw(req, menuId, resolvedLogId);
            }
        }
        if (!detailRaw) {
            const tableRaw = await this.fetchTableCallRaw(req, staffCallId);
            if (tableRaw && !(0, staff_order_channel_util_1.isDeliveryUpstreamRow)(tableRaw)) {
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
        scopedEntry = await this.enrichEntryForStaff(req, menuId, role, scopedEntry);
        if (role === 'waiter' && !(0, staff_order_status_util_1.isActiveStaffOrderStatus)(entry.status)) {
            return {
                denied: true,
                httpStatus: 404,
                data: { error: 'Order not found', code: 'ORDER_NOT_FOUND' },
            };
        }
        if (entry.channel === 'delivery' && !(0, staff_order_actions_util_1.canStaffViewDelivery)(role)) {
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
                staffJobRole: role,
                entry: scopedEntry,
                actions,
                capabilities: this.presenter.capabilitiesFor(role),
            },
        };
    }
    async postOrderAction(req, staffCallId, action, menuId, activityLogId) {
        const role = await this.resolveRole(req);
        const normalizedAction = String(action ?? '').trim();
        const resolvedMenuId = menuId > 0 ? menuId : await this.resolveMenuId(req, {});
        if (!resolvedMenuId || staffCallId <= 0) {
            return {
                status: 400,
                data: {
                    error: 'Invalid order payload',
                    code: 'INVALID_ORDER',
                },
            };
        }
        if ((0, staff_order_actions_util_1.isCashierOnlyAction)(normalizedAction) && role !== 'cashier') {
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
            const createdByStaffId = this.tableOrderCreators.lookup(resolvedMenuId, staffCallId);
            if ((0, staff_order_self_accept_util_1.shouldBlockWaiterSelfAccept)({
                channel: 'table',
                status: 'pending',
                createdByStaffId,
                role,
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
        const logId = await this.resolveActivityLogId(req, resolvedMenuId, staffCallId, activityLogId);
        if (role === 'cashier' &&
            logId > 0 &&
            normalizedAction === 'TABLE_CALL_PREPARED') {
            const autoConfirm = await this.autoConfirmPendingDeliveryOrder(req, resolvedMenuId, staffCallId, logId);
            if (autoConfirm) {
                return autoConfirm;
            }
        }
        let upstream;
        if (role === 'cashier' &&
            logId > 0 &&
            (normalizedAction === 'TABLE_CALL_CONFIRMED' ||
                normalizedAction === 'TABLE_CALL_CANCELLED' ||
                normalizedAction === 'TABLE_CALL_PREPARED' ||
                normalizedAction === 'TABLE_CALL_DELIVERED')) {
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
                    error: 'Action not allowed for your staff role',
                    errorAr: 'هذا الإجراء غير مسموح لدورك الوظيفي',
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
        const role = await this.resolveRole(req);
        return {
            staffJobRole: role,
            capabilities: this.presenter.capabilitiesFor(role),
        };
    }
    canCreateTableOrders(role) {
        return role === 'waiter' || role === 'cashier';
    }
    async listRestaurantTables(req) {
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
        const menuId = this.parseMenuId({}, body) || (await this.resolveMenuId(req, body));
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
        const creatorStaffId = await this.resolveStaffId(req);
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
        if (entry.channel === 'delivery' && !(0, staff_order_actions_util_1.canStaffViewDelivery)(role)) {
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
        try {
            const me = await this.ensHttp.proxy({
                method: 'GET',
                path: 'staff-auth/me',
                req,
            });
            if (me.status >= 400)
                return null;
            const payload = me.data;
            const menu = payload?.menu;
            if (menu && typeof menu === 'object') {
                const slug = String(menu.slug ?? '').trim();
                if (slug.length > 0)
                    return slug;
            }
        }
        catch {
        }
        return null;
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
    async listWaiterOrders(req, role, channel, scope, page, limit) {
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
            return (0, staff_order_errors_util_1.rejectUpstreamListResult)(this.logger, 'listWaiterOrders staff-auth/table-calls', pendingUpstream);
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
            return (0, staff_order_errors_util_1.rejectUpstreamListResult)(this.logger, 'listWaiterOrders staff-auth/table-calls/history', historyUpstream);
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
            .map((row) => this.presenter.presentTableCallRow(row, role))
            .filter((entry) => entry != null)
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
    sortWaiterActiveEntries(entries) {
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
    async hydrateWaiterActiveListEntries(req, entries) {
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
            return this.presenter.mergeCallHydration(entry, raw, 'waiter');
        });
    }
    resolveDetailListScope(role, query) {
        if (role === 'waiter') {
            return 'active';
        }
        return this.parseScope(query.scope);
    }
    async listCashierOrders(req, role, channel, scope, page, limit, query) {
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
            return this.listCashierTableHistory(req, role, channel, menuId, page, limit, query);
        }
        const upstreamQuery = {
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
            return (0, staff_order_errors_util_1.rejectUpstreamListResult)(this.logger, 'listCashierOrders menus/activity-logs', upstream);
        }
        const payload = (upstream.data ?? {});
        const rows = Array.isArray(payload.entries)
            ? payload.entries
            : Array.isArray(payload.calls)
                ? payload.calls
                : [];
        let presented = rows
            .map((row) => this.presenter.presentListRow(row, role, channel))
            .filter((entry) => entry != null);
        presented = await this.hydrateListEntries(req, menuId, role, channel, presented);
        presented = await this.enrichEntriesActionDetailsFromActivityLogs(req, menuId, presented);
        const scoped = this.presenter.applyListScopeToEntries(this.presenter.filterByScope(presented, scope), scope);
        const enriched = await this.enrichEntriesForStaff(req, menuId, role, scoped);
        const total = Number(payload.total ?? enriched.length) || enriched.length;
        const totalPages = Number(payload.totalPages ?? Math.ceil(total / limit)) ||
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
    async listCashierTableHistory(req, role, channel, menuId, page, limit, query) {
        const dateRange = (0, staff_table_history_filters_util_1.resolveTableHistoryDateRange)(query, 'history', channel);
        const historyQuery = {
            ...query,
            dateFrom: dateRange.dateFrom,
            dateTo: dateRange.dateTo,
        };
        const needed = page * limit;
        const scanLimit = 50;
        let upstreamPage = 1;
        let scannedRows = 0;
        const collected = [];
        while (collected.length < needed &&
            scannedRows < staff_table_history_filters_util_1.TABLE_HISTORY_MAX_SCAN_ROWS) {
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
                return (0, staff_order_errors_util_1.rejectUpstreamListResult)(this.logger, 'listCashierTableHistory menus/activity-logs', upstream);
            }
            const payload = (upstream.data ?? {});
            const rows = Array.isArray(payload.entries)
                ? payload.entries
                : Array.isArray(payload.calls)
                    ? payload.calls
                    : [];
            if (rows.length === 0)
                break;
            scannedRows += rows.length;
            let presented = rows
                .map((row) => this.presenter.presentListRow(row, role, channel))
                .filter((entry) => entry != null);
            presented = await this.hydrateListEntries(req, menuId, role, channel, presented);
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
    cashierListQueryParams(query, options) {
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
    async hydrateListEntries(req, menuId, role, channel, entries) {
        if (entries.length === 0)
            return entries;
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
                return this.presenter.mergeCallHydration(entry, pending, role);
            }
            const detail = detailIndex.get(entry.staffCallId);
            if (detail) {
                return this.presenter.mergeCallHydration(entry, detail, role);
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
    async hydrateDeliveryListEntries(req, menuId, role, entries) {
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
            const hydrated = this.presenter.presentListRow(raw, role, 'delivery');
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
    emptyList(role, channel, scope, page, limit) {
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
};
exports.StaffOrdersFlowService = StaffOrdersFlowService;
exports.StaffOrdersFlowService = StaffOrdersFlowService = StaffOrdersFlowService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [ens_http_service_1.EnsHttpService,
        staff_order_presenter_service_1.StaffOrderPresenterService,
        staff_table_order_creator_registry_1.StaffTableOrderCreatorRegistry])
], StaffOrdersFlowService);
//# sourceMappingURL=staff-orders-flow.service.js.map