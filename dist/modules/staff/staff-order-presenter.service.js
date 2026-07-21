"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StaffOrderPresenterService = void 0;
const common_1 = require("@nestjs/common");
const staff_order_actions_util_1 = require("./staff-order-actions.util");
const staff_order_status_util_1 = require("./staff-order-status.util");
const staff_order_channel_util_1 = require("./staff-order-channel.util");
const staff_order_edit_permissions_util_1 = require("./staff-order-edit-permissions.util");
const staff_order_action_details_util_1 = require("./staff-order-action-details.util");
const staff_order_attention_util_1 = require("./staff-order-attention.util");
let StaffOrderPresenterService = class StaffOrderPresenterService {
    capabilitiesFor(auth) {
        return auth.capabilities;
    }
    presentTableCallRow(raw, auth) {
        const channel = this.resolveChannel(raw);
        const staffCallId = this.parseStaffCallId(raw);
        if (staffCallId <= 0)
            return null;
        const items = this.parseItems(raw.items);
        const statusRaw = String(raw.status ?? 'pending').trim().toLowerCase();
        const fromRaw = (0, staff_order_action_details_util_1.parseActionDetailsList)(raw.actionDetails);
        const synthetic = (0, staff_order_action_details_util_1.parseActionDetailsList)([
            { status: statusRaw, time: String(raw.at ?? raw.requestedAt ?? '') },
        ]);
        const actionDetails = (0, staff_order_action_details_util_1.pickRicherActionDetails)(fromRaw, synthetic);
        const status = (0, staff_order_status_util_1.resolveListEntryStatus)({
            actionDetails,
            status: statusRaw,
        });
        return this.buildEntry({
            raw,
            auth,
            channel,
            staffCallId,
            activityLogId: null,
            status,
            items,
            actionDetails,
            actions: null,
        });
    }
    mergeCallHydration(entry, call, auth) {
        if (entry.channel === 'delivery') {
            return entry;
        }
        const callChannel = this.resolveChannel(call);
        if (callChannel === 'delivery') {
            return entry;
        }
        const hydrated = this.presentTableCallRow({
            ...call,
            orderId: call.id ?? entry.staffCallId,
        }, auth);
        if (!hydrated)
            return entry;
        return this.mergeEntryFields(entry, hydrated, auth);
    }
    mergeEntryFields(base, overlay, auth) {
        const items = base.items.length > 0
            ? base.items
            : overlay.items.length > 0
                ? overlay.items
                : base.items;
        const actionDetails = (0, staff_order_action_details_util_1.pickRicherActionDetails)(base.actionDetails, overlay.actionDetails);
        const fromActions = (0, staff_order_status_util_1.resolveLatestOrderStatus)(actionDetails);
        const status = (0, staff_order_status_util_1.preferAuthoritativeLifecycleStatus)((0, staff_order_status_util_1.preferAuthoritativeLifecycleStatus)(base.status, fromActions), overlay.status);
        const pendingGuestAddition = base.pendingGuestAddition || overlay.pendingGuestAddition;
        const pendingBillRequest = base.pendingBillRequest || overlay.pendingBillRequest;
        const requestKind = (0, staff_order_attention_util_1.isServiceRequestKind)(base.requestKind)
            ? base.requestKind
            : (0, staff_order_attention_util_1.isServiceRequestKind)(overlay.requestKind)
                ? overlay.requestKind
                : base.requestKind;
        const isService = (0, staff_order_attention_util_1.isServiceRequestKind)(requestKind);
        return {
            ...overlay,
            id: base.id,
            activityLogId: base.activityLogId ?? overlay.activityLogId,
            channel: base.channel,
            tableNumber: this.pickString(base.tableNumber, overlay.tableNumber),
            customerName: this.pickString(base.customerName, overlay.customerName),
            customerPhone: this.pickString(base.customerPhone, overlay.customerPhone),
            customerAddress: this.pickString(base.customerAddress, overlay.customerAddress),
            orderNotes: this.pickString(base.orderNotes, overlay.orderNotes),
            governorateId: base.governorateId ?? overlay.governorateId,
            governorateNameAr: this.pickString(base.governorateNameAr, overlay.governorateNameAr),
            governorateNameEn: this.pickString(base.governorateNameEn, overlay.governorateNameEn),
            itemsSubtotal: base.itemsSubtotal ?? overlay.itemsSubtotal,
            taxAmount: base.taxAmount ?? overlay.taxAmount,
            serviceAmount: base.serviceAmount ?? overlay.serviceAmount,
            deliveryFee: base.deliveryFee ?? overlay.deliveryFee,
            items,
            itemCount: items.reduce((sum, line) => sum + line.quantity, 0),
            totalPrice: base.totalPrice > 0 ? base.totalPrice : overlay.totalPrice,
            createdAt: base.createdAt ?? overlay.createdAt,
            actionDetails,
            pendingGuestAddition,
            pendingBillRequest,
            requestKind,
            status,
            statusLabel: (0, staff_order_actions_util_1.statusLabelFor)(status),
            availableActions: (0, staff_order_actions_util_1.availableActionsForOrder)(status, auth, base.channel, { pendingGuestAddition, requestKind }),
            canEditItems: !isService &&
                (0, staff_order_edit_permissions_util_1.resolveCanEditItems)(base.channel, auth, status),
            createdByStaffId: null,
            waitingForCashierApproval: false,
        };
    }
    pickString(primary, fallback) {
        if (primary != null && primary.trim().length > 0)
            return primary;
        if (fallback != null && fallback.trim().length > 0)
            return fallback;
        return primary ?? fallback;
    }
    presentListRow(raw, auth, channel) {
        const entryChannel = this.resolveChannel(raw, channel);
        if (entryChannel !== channel)
            return null;
        const staffCallId = this.parseStaffCallIdFromList(raw);
        if (staffCallId <= 0)
            return null;
        const activityLogId = this.parseActivityLogIdFromList(raw);
        const items = this.parseItems(raw.items);
        const fromList = (0, staff_order_action_details_util_1.parseActionDetailsList)(raw.actionDetails);
        const fromActions = (0, staff_order_action_details_util_1.buildActionDetailsFromActions)(raw.actions);
        const actionDetails = (0, staff_order_action_details_util_1.pickRicherActionDetails)(fromActions, fromList);
        const status = (0, staff_order_status_util_1.resolveListEntryStatus)({
            actionDetails,
            status: raw.status,
        });
        return this.buildEntry({
            raw,
            auth,
            channel: entryChannel,
            staffCallId,
            activityLogId,
            status,
            items,
            actionDetails,
            actions: null,
        });
    }
    presentDetail(raw, auth) {
        const channel = this.resolveChannel(raw);
        const staffCallId = this.parseStaffCallId(raw);
        if (staffCallId <= 0)
            return null;
        const activityLogId = this.parseActivityLogId(raw);
        const order = raw.order ?? {};
        const actions = Array.isArray(raw.actions)
            ? raw.actions
            : [];
        const items = this.parseItems(raw.items ?? order.items);
        const fromList = (0, staff_order_action_details_util_1.parseActionDetailsList)(raw.actionDetails);
        const fromActions = (0, staff_order_action_details_util_1.buildActionDetailsFromActions)(actions);
        const actionDetails = (0, staff_order_action_details_util_1.pickRicherActionDetails)(fromActions, fromList);
        const status = (0, staff_order_status_util_1.resolveLatestOrderStatus)(actions, order);
        return this.buildEntry({
            raw: { ...raw, ...order },
            auth,
            channel,
            staffCallId,
            activityLogId,
            status,
            items,
            actionDetails,
            actions,
        });
    }
    buildEntry(input) {
        const totalPrice = this.resolveTotalPrice(input.raw, input.items);
        const itemCount = input.items.reduce((sum, line) => sum + line.quantity, 0);
        const pendingGuestAddition = input.raw.pendingGuestAddition === true;
        const pendingBillRequest = input.raw.pendingBillRequest === true;
        const requestKind = (0, staff_order_attention_util_1.parseStaffRequestKind)(input.raw.requestKind);
        const isService = (0, staff_order_attention_util_1.isServiceRequestKind)(requestKind);
        const availableActions = (0, staff_order_actions_util_1.availableActionsForOrder)(input.status, input.auth, input.channel, { pendingGuestAddition, requestKind });
        const canEditItems = !isService &&
            (0, staff_order_edit_permissions_util_1.resolveCanEditItems)(input.channel, input.auth, input.status);
        return {
            id: String(input.activityLogId ?? input.staffCallId),
            staffCallId: input.staffCallId,
            activityLogId: input.activityLogId,
            channel: input.channel,
            requestKind,
            status: input.status,
            statusLabel: (0, staff_order_actions_util_1.statusLabelFor)(input.status),
            tableNumber: this.stringOrNull(input.raw.tableNumber),
            customerName: this.stringOrNull(input.raw.customerName),
            customerPhone: this.stringOrNull(input.raw.customerPhone),
            customerAddress: this.stringOrNull(input.raw.customerAddress),
            orderNotes: this.stringOrNull(input.raw.orderNotes),
            governorateId: this.numberOrNull(input.raw.governorateId),
            governorateNameAr: this.stringOrNull(input.raw.governorateNameAr),
            governorateNameEn: this.stringOrNull(input.raw.governorateNameEn),
            itemsSubtotal: this.numberOrNull(input.raw.itemsSubtotal),
            taxAmount: this.numberOrNull(input.raw.taxAmount),
            serviceAmount: this.numberOrNull(input.raw.serviceAmount),
            deliveryFee: this.numberOrNull(input.raw.deliveryFee),
            items: isService ? [] : input.items,
            itemCount: isService ? 0 : itemCount,
            totalPrice: isService ? 0 : totalPrice,
            createdAt: this.resolveCreatedAt(input.actionDetails, input.raw),
            actionDetails: input.actionDetails,
            availableActions,
            canEditItems,
            pendingGuestAddition: isService ? false : pendingGuestAddition,
            pendingBillRequest: isService ? false : pendingBillRequest,
            createdByStaffId: null,
            waitingForCashierApproval: false,
        };
    }
    filterByScope(entries, scope) {
        if (scope === 'active') {
            return entries.filter((entry) => (0, staff_order_status_util_1.isActiveStaffOrderStatus)(entry.status));
        }
        return entries.filter((entry) => (0, staff_order_status_util_1.isHistoryStaffOrderStatus)(entry.status));
    }
    applyListScope(entry, scope) {
        if (scope === 'history') {
            return {
                ...entry,
                availableActions: [],
                canEditItems: false,
            };
        }
        if (!(0, staff_order_status_util_1.isActiveStaffOrderStatus)(entry.status)) {
            return {
                ...entry,
                availableActions: [],
                canEditItems: false,
            };
        }
        return entry;
    }
    applyListScopeToEntries(entries, scope) {
        return entries.map((entry) => this.applyListScope(entry, scope));
    }
    resolveChannel(raw, listChannelHint) {
        return (0, staff_order_channel_util_1.resolveStaffOrderChannel)(raw, listChannelHint);
    }
    parseStaffCallIdFromList(raw) {
        const orderId = Number(raw.orderId ?? 0);
        if (Number.isFinite(orderId) && orderId > 0)
            return orderId;
        return this.parseStaffCallId(raw);
    }
    parseActivityLogIdFromList(raw) {
        const id = Number(raw.id ?? 0);
        const orderId = Number(raw.orderId ?? 0);
        if (Number.isFinite(id) && id > 0 && orderId > 0 && id !== orderId) {
            return id;
        }
        return null;
    }
    parseStaffCallId(raw) {
        const fromOrderId = Number(raw.orderId ?? raw.staffCallId ?? 0);
        if (Number.isFinite(fromOrderId) && fromOrderId > 0)
            return fromOrderId;
        const fromId = Number(raw.id ?? 0);
        return Number.isFinite(fromId) && fromId > 0 ? fromId : 0;
    }
    parseActivityLogId(raw) {
        const fromList = this.parseActivityLogIdFromList(raw);
        if (fromList != null)
            return fromList;
        const id = Number(raw.id ?? 0);
        return Number.isFinite(id) && id > 0 ? id : null;
    }
    parseItems(raw) {
        if (!Array.isArray(raw))
            return [];
        const items = [];
        for (const line of raw) {
            if (!line || typeof line !== 'object')
                continue;
            const map = line;
            const quantity = Math.max(1, Number(map.quantity ?? 1) || 1);
            const price = Number(map.price ?? 0) || 0;
            const total = Number(map.total ?? price * quantity) || price * quantity;
            const name = String(map.name ?? 'Item').trim() || 'Item';
            items.push({
                menuItemId: map.menuItemId != null ? Number(map.menuItemId) || null : null,
                name,
                quantity,
                price,
                total,
                notes: this.stringOrNull(map.notes),
                size: map.size && typeof map.size === 'object'
                    ? map.size
                    : null,
                variant: map.variant && typeof map.variant === 'object'
                    ? map.variant
                    : null,
            });
        }
        return items;
    }
    enrichEntriesActionDetails(entries, activityLogRows) {
        if (entries.length === 0 || activityLogRows.length === 0) {
            return entries;
        }
        const index = new Map();
        for (const row of activityLogRows) {
            const orderId = Number(row.orderId ?? 0);
            if (!Number.isFinite(orderId) || orderId <= 0)
                continue;
            const fromList = (0, staff_order_action_details_util_1.parseActionDetailsList)(row.actionDetails);
            const fromActions = (0, staff_order_action_details_util_1.buildActionDetailsFromActions)(row.actions);
            const details = (0, staff_order_action_details_util_1.pickRicherActionDetails)(fromActions, fromList);
            if (details.length === 0)
                continue;
            const existing = index.get(orderId);
            index.set(orderId, existing
                ? (0, staff_order_action_details_util_1.pickRicherActionDetails)(existing, details)
                : details);
        }
        return entries.map((entry) => {
            const details = index.get(entry.staffCallId);
            if (!details)
                return entry;
            return {
                ...entry,
                actionDetails: (0, staff_order_action_details_util_1.pickRicherActionDetails)(entry.actionDetails, details),
            };
        });
    }
    resolveTotalPrice(raw, items) {
        const candidates = [
            raw.totalPrice,
            raw.orderTotal,
            raw.order?.orderTotal,
        ];
        for (const value of candidates) {
            const num = Number(value);
            if (Number.isFinite(num) && num > 0)
                return num;
        }
        const computed = items.reduce((sum, line) => sum + line.total, 0);
        return computed > 0 ? computed : 0;
    }
    resolveCreatedAt(actionDetails, raw) {
        if (actionDetails.length > 0) {
            const first = actionDetails.find((detail) => detail.time)?.time;
            if (first)
                return first;
        }
        return this.stringOrNull(raw.createdAt ?? raw.updatedAt ?? raw.at);
    }
    stringOrNull(value) {
        const text = String(value ?? '').trim();
        return text.length > 0 ? text : null;
    }
    numberOrNull(value) {
        const num = Number(value);
        return Number.isFinite(num) ? num : null;
    }
};
exports.StaffOrderPresenterService = StaffOrderPresenterService;
exports.StaffOrderPresenterService = StaffOrderPresenterService = __decorate([
    (0, common_1.Injectable)()
], StaffOrderPresenterService);
//# sourceMappingURL=staff-order-presenter.service.js.map