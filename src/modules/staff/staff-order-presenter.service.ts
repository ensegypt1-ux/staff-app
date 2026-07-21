import { Injectable } from '@nestjs/common';
import {
  StaffMappedCapabilities,
  StaffResolvedAuth,
} from './staff-capability.mapper';
import {
  availableActionsForOrder,
  statusLabelFor,
  StaffOrderActionSpec,
} from './staff-order-actions.util';
import {
  isActiveStaffOrderStatus,
  isHistoryStaffOrderStatus,
  preferAuthoritativeLifecycleStatus,
  resolveLatestOrderStatus,
  resolveListEntryStatus,
  StaffOrderStatus,
} from './staff-order-status.util';
import {
  resolveStaffOrderChannel,
  StaffOrderChannel,
} from './staff-order-channel.util';
import { resolveCanEditItems } from './staff-order-edit-permissions.util';
import {
  buildActionDetailsFromActions,
  parseActionDetailsList,
  pickRicherActionDetails,
  StaffOrderActionDetail,
} from './staff-order-action-details.util';
import { StaffJobRole } from './staff-job-role.util';
import {
  isServiceRequestKind,
  parseStaffRequestKind,
  StaffRequestKind,
} from './staff-order-attention.util';

export type { StaffOrderChannel };
export type { StaffRequestKind };

export type StaffPresentedOrderItem = {
  menuItemId?: number | null;
  name: string;
  quantity: number;
  price: number;
  total: number;
  notes?: string | null;
  size?: Record<string, unknown> | null;
  variant?: Record<string, unknown> | null;
};

export type StaffPresentedOrderEntry = {
  id: string;
  staffCallId: number;
  activityLogId: number | null;
  channel: StaffOrderChannel;
  /** Guest intent — `waiter` / orphan `bill` come from table-calls merge. */
  requestKind: StaffRequestKind;
  status: StaffOrderStatus;
  statusLabel: { en: string; ar: string };
  tableNumber: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  orderNotes: string | null;
  governorateId: number | null;
  governorateNameAr: string | null;
  governorateNameEn: string | null;
  /** Express activity-log charge fields (delivery + table). */
  itemsSubtotal: number | null;
  taxAmount: number | null;
  taxPercent: number | null;
  taxEnabled: boolean | null;
  serviceAmount: number | null;
  servicePercent: number | null;
  serviceEnabled: boolean | null;
  deliveryFee: number | null;
  items: StaffPresentedOrderItem[];
  itemCount: number;
  totalPrice: number;
  createdAt: string | null;
  actionDetails: StaffOrderActionDetail[];
  availableActions: StaffOrderActionSpec[];
  canEditItems: boolean;
  pendingGuestAddition: boolean;
  pendingBillRequest: boolean;
  /** @deprecated Staff-only self-accept — always null/false for Web parity. */
  createdByStaffId: number | null;
  /** @deprecated Always false — self-accept removed for Web parity. */
  waitingForCashierApproval: boolean;
};

/** @deprecated Prefer StaffMappedCapabilities from the capability mapper. */
export type StaffOrderCapabilities = StaffMappedCapabilities;

export type StaffPresentedListResult = {
  /** @deprecated Prefer permissions-driven fields. */
  staffJobRole: StaffJobRole;
  permissions: string[];
  roleName: string | null;
  roleId: number | null;
  channel: StaffOrderChannel;
  scope: 'active' | 'history';
  entries: StaffPresentedOrderEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  /**
   * Global attention badge count (not page-scoped).
   * Table: attention rules. Delivery: pending delivery orders.
   */
  pendingCount?: number;
  capabilities: StaffMappedCapabilities;
  filters?: {
    dateFrom: string;
    dateTo: string;
  };
};

export type StaffPresentedDetailResult = {
  /** @deprecated Prefer permissions-driven fields. */
  staffJobRole: StaffJobRole;
  permissions: string[];
  roleName: string | null;
  roleId: number | null;
  entry: StaffPresentedOrderEntry;
  actions: Array<Record<string, unknown>>;
  capabilities: StaffMappedCapabilities;
};

@Injectable()
export class StaffOrderPresenterService {
  capabilitiesFor(auth: StaffResolvedAuth): StaffMappedCapabilities {
    return auth.capabilities;
  }

  presentTableCallRow(
    raw: Record<string, unknown>,
    auth: StaffResolvedAuth,
  ): StaffPresentedOrderEntry | null {
    const channel = this.resolveChannel(raw);
    const staffCallId = this.parseStaffCallId(raw);
    if (staffCallId <= 0) return null;

    const items = this.parseItems(raw.items);
    const statusRaw = String(raw.status ?? 'pending').trim().toLowerCase();
    const fromRaw = parseActionDetailsList(raw.actionDetails);
    const synthetic = parseActionDetailsList([
      { status: statusRaw, time: String(raw.at ?? raw.requestedAt ?? '') },
    ]);
    const actionDetails = pickRicherActionDetails(fromRaw, synthetic);
    const status = resolveListEntryStatus({
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

  mergeCallHydration(
    entry: StaffPresentedOrderEntry,
    call: Record<string, unknown>,
    auth: StaffResolvedAuth,
  ): StaffPresentedOrderEntry {
    if (entry.channel === 'delivery') {
      return entry;
    }

    const callChannel = this.resolveChannel(call);
    if (callChannel === 'delivery') {
      return entry;
    }

    const hydrated = this.presentTableCallRow(
      {
        ...call,
        orderId: call.id ?? entry.staffCallId,
      },
      auth,
    );
    if (!hydrated) return entry;

    return this.mergeEntryFields(entry, hydrated, auth);
  }

  /** Merge table-call hydration without clobbering activity-log delivery fields. */
  private mergeEntryFields(
    base: StaffPresentedOrderEntry,
    overlay: StaffPresentedOrderEntry,
    auth: StaffResolvedAuth,
  ): StaffPresentedOrderEntry {
    const items =
      base.items.length > 0
        ? base.items
        : overlay.items.length > 0
          ? overlay.items
          : base.items;

    const actionDetails = pickRicherActionDetails(
      base.actionDetails,
      overlay.actionDetails,
    );

    // Activity-log / action history wins when ahead of a stale pending overlay.
    const fromActions = resolveLatestOrderStatus(actionDetails);
    const status = preferAuthoritativeLifecycleStatus(
      preferAuthoritativeLifecycleStatus(base.status, fromActions),
      overlay.status,
    );

    const pendingGuestAddition =
      base.pendingGuestAddition || overlay.pendingGuestAddition;
    const pendingBillRequest =
      base.pendingBillRequest || overlay.pendingBillRequest;
    const requestKind = isServiceRequestKind(base.requestKind)
      ? base.requestKind
      : isServiceRequestKind(overlay.requestKind)
        ? overlay.requestKind
        : base.requestKind;
    const isService = isServiceRequestKind(requestKind);

    return {
      ...overlay,
      id: base.id,
      activityLogId: base.activityLogId ?? overlay.activityLogId,
      channel: base.channel,
      tableNumber: this.pickString(base.tableNumber, overlay.tableNumber),
      customerName: this.pickString(base.customerName, overlay.customerName),
      customerPhone: this.pickString(base.customerPhone, overlay.customerPhone),
      customerAddress: this.pickString(
        base.customerAddress,
        overlay.customerAddress,
      ),
      orderNotes: this.pickString(base.orderNotes, overlay.orderNotes),
      governorateId: base.governorateId ?? overlay.governorateId,
      governorateNameAr: this.pickString(
        base.governorateNameAr,
        overlay.governorateNameAr,
      ),
      governorateNameEn: this.pickString(
        base.governorateNameEn,
        overlay.governorateNameEn,
      ),
      itemsSubtotal: base.itemsSubtotal ?? overlay.itemsSubtotal,
      taxAmount: base.taxAmount ?? overlay.taxAmount,
      taxPercent: base.taxPercent ?? overlay.taxPercent,
      taxEnabled: base.taxEnabled ?? overlay.taxEnabled,
      serviceAmount: base.serviceAmount ?? overlay.serviceAmount,
      servicePercent: base.servicePercent ?? overlay.servicePercent,
      serviceEnabled: base.serviceEnabled ?? overlay.serviceEnabled,
      deliveryFee: base.deliveryFee ?? overlay.deliveryFee,
      items,
      itemCount: items.reduce((sum, line) => sum + line.quantity, 0),
      totalPrice:
        base.totalPrice > 0 ? base.totalPrice : overlay.totalPrice,
      createdAt: base.createdAt ?? overlay.createdAt,
      actionDetails,
      pendingGuestAddition,
      pendingBillRequest,
      requestKind,
      status,
      statusLabel: statusLabelFor(status, base.channel),
      availableActions: availableActionsForOrder(
        status,
        auth,
        base.channel,
        { pendingGuestAddition, requestKind },
      ),
      canEditItems:
        !isService &&
        resolveCanEditItems(base.channel, auth, status),
      createdByStaffId: null,
      waitingForCashierApproval: false,
    };
  }

  private pickString(
    primary: string | null,
    fallback: string | null,
  ): string | null {
    if (primary != null && primary.trim().length > 0) return primary;
    if (fallback != null && fallback.trim().length > 0) return fallback;
    return primary ?? fallback;
  }

  presentListRow(
    raw: Record<string, unknown>,
    auth: StaffResolvedAuth,
    channel: StaffOrderChannel,
  ): StaffPresentedOrderEntry | null {
    const entryChannel = this.resolveChannel(raw, channel);
    if (entryChannel !== channel) return null;

    const staffCallId = this.parseStaffCallIdFromList(raw);
    if (staffCallId <= 0) return null;

    const activityLogId = this.parseActivityLogIdFromList(raw);
    const items = this.parseItems(raw.items);
    const fromList = parseActionDetailsList(raw.actionDetails);
    const fromActions = buildActionDetailsFromActions(raw.actions);
    const actionDetails = pickRicherActionDetails(fromActions, fromList);
    const status = resolveListEntryStatus({
      actionDetails,
      status: raw.status as string | undefined,
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

  presentDetail(
    raw: Record<string, unknown>,
    auth: StaffResolvedAuth,
  ): StaffPresentedOrderEntry | null {
    const channel = this.resolveChannel(raw);
    const staffCallId = this.parseStaffCallId(raw);
    if (staffCallId <= 0) return null;

    const activityLogId = this.parseActivityLogId(raw);
    const order = (raw.order as Record<string, unknown> | undefined) ?? {};
    const actions = Array.isArray(raw.actions)
      ? (raw.actions as Array<Record<string, unknown>>)
      : [];
    const items = this.parseItems(raw.items ?? order.items);
    const fromList = parseActionDetailsList(raw.actionDetails);
    const fromActions = buildActionDetailsFromActions(actions);
    const actionDetails = pickRicherActionDetails(fromActions, fromList);
    const status = resolveLatestOrderStatus(
      actions,
      order as { status?: string },
    );

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

  private buildEntry(input: {
    raw: Record<string, unknown>;
    auth: StaffResolvedAuth;
    channel: StaffOrderChannel;
    staffCallId: number;
    activityLogId: number | null;
    status: StaffOrderStatus;
    items: StaffPresentedOrderItem[];
    actionDetails: StaffOrderActionDetail[];
    actions: Array<Record<string, unknown>> | null;
  }): StaffPresentedOrderEntry {
    const totalPrice = this.resolveTotalPrice(input.raw, input.items);
    const itemCount = input.items.reduce((sum, line) => sum + line.quantity, 0);
    const pendingGuestAddition = input.raw.pendingGuestAddition === true;
    const pendingBillRequest = input.raw.pendingBillRequest === true;
    const requestKind = parseStaffRequestKind(input.raw.requestKind);
    const isService = isServiceRequestKind(requestKind);
    const availableActions = availableActionsForOrder(
      input.status,
      input.auth,
      input.channel,
      { pendingGuestAddition, requestKind },
    );
    const canEditItems =
      !isService &&
      resolveCanEditItems(input.channel, input.auth, input.status);

    return {
      id: String(input.activityLogId ?? input.staffCallId),
      staffCallId: input.staffCallId,
      activityLogId: input.activityLogId,
      channel: input.channel,
      requestKind,
      status: input.status,
      statusLabel: statusLabelFor(input.status, input.channel),
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
      taxPercent: this.numberOrNull(input.raw.taxPercent),
      taxEnabled: this.booleanOrNull(input.raw.taxEnabled),
      serviceAmount: this.numberOrNull(input.raw.serviceAmount),
      servicePercent: this.numberOrNull(input.raw.servicePercent),
      serviceEnabled: this.booleanOrNull(input.raw.serviceEnabled),
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

  filterByScope(
    entries: StaffPresentedOrderEntry[],
    scope: 'active' | 'history',
  ): StaffPresentedOrderEntry[] {
    if (scope === 'active') {
      return entries.filter((entry) => isActiveStaffOrderStatus(entry.status));
    }
    return entries.filter((entry) => isHistoryStaffOrderStatus(entry.status));
  }

  applyListScope(
    entry: StaffPresentedOrderEntry,
    scope: 'active' | 'history',
  ): StaffPresentedOrderEntry {
    if (scope === 'history') {
      return {
        ...entry,
        availableActions: [],
        canEditItems: false,
      };
    }

    if (!isActiveStaffOrderStatus(entry.status)) {
      return {
        ...entry,
        availableActions: [],
        canEditItems: false,
      };
    }

    return entry;
  }

  applyListScopeToEntries(
    entries: StaffPresentedOrderEntry[],
    scope: 'active' | 'history',
  ): StaffPresentedOrderEntry[] {
    return entries.map((entry) => this.applyListScope(entry, scope));
  }

  private resolveChannel(
    raw: Record<string, unknown>,
    listChannelHint?: StaffOrderChannel,
  ): StaffOrderChannel {
    return resolveStaffOrderChannel(raw, listChannelHint);
  }

  private parseStaffCallIdFromList(raw: Record<string, unknown>): number {
    const orderId = Number(raw.orderId ?? 0);
    if (Number.isFinite(orderId) && orderId > 0) return orderId;
    return this.parseStaffCallId(raw);
  }

  private parseActivityLogIdFromList(raw: Record<string, unknown>): number | null {
    const id = Number(raw.id ?? 0);
    const orderId = Number(raw.orderId ?? 0);
    if (Number.isFinite(id) && id > 0 && orderId > 0 && id !== orderId) {
      return id;
    }
    return null;
  }

  private parseStaffCallId(raw: Record<string, unknown>): number {
    const fromOrderId = Number(raw.orderId ?? raw.staffCallId ?? 0);
    if (Number.isFinite(fromOrderId) && fromOrderId > 0) return fromOrderId;
    const fromId = Number(raw.id ?? 0);
    return Number.isFinite(fromId) && fromId > 0 ? fromId : 0;
  }

  private parseActivityLogId(raw: Record<string, unknown>): number | null {
    const fromList = this.parseActivityLogIdFromList(raw);
    if (fromList != null) return fromList;
    const id = Number(raw.id ?? 0);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  private parseItems(raw: unknown): StaffPresentedOrderItem[] {
    if (!Array.isArray(raw)) return [];
    const items: StaffPresentedOrderItem[] = [];
    for (const line of raw) {
      if (!line || typeof line !== 'object') continue;
      const map = line as Record<string, unknown>;
      const quantity = Math.max(1, Number(map.quantity ?? 1) || 1);
      const price = Number(map.price ?? 0) || 0;
      const total = Number(map.total ?? price * quantity) || price * quantity;
      const name = String(map.name ?? 'Item').trim() || 'Item';
      items.push({
        menuItemId:
          map.menuItemId != null ? Number(map.menuItemId) || null : null,
        name,
        quantity,
        price,
        total,
        notes: this.stringOrNull(map.notes),
        size:
          map.size && typeof map.size === 'object'
            ? (map.size as Record<string, unknown>)
            : null,
        variant:
          map.variant && typeof map.variant === 'object'
            ? (map.variant as Record<string, unknown>)
            : null,
      });
    }
    return items;
  }

  enrichEntriesActionDetails(
    entries: StaffPresentedOrderEntry[],
    activityLogRows: Array<Record<string, unknown>>,
  ): StaffPresentedOrderEntry[] {
    if (entries.length === 0 || activityLogRows.length === 0) {
      return entries;
    }

    const index = new Map<number, StaffOrderActionDetail[]>();
    for (const row of activityLogRows) {
      const orderId = Number(row.orderId ?? 0);
      if (!Number.isFinite(orderId) || orderId <= 0) continue;

      const fromList = parseActionDetailsList(row.actionDetails);
      const fromActions = buildActionDetailsFromActions(row.actions);
      const details = pickRicherActionDetails(fromActions, fromList);
      if (details.length === 0) continue;

      const existing = index.get(orderId);
      index.set(
        orderId,
        existing
          ? pickRicherActionDetails(existing, details)
          : details,
      );
    }

    return entries.map((entry) => {
      const details = index.get(entry.staffCallId);
      if (!details) return entry;
      return {
        ...entry,
        actionDetails: pickRicherActionDetails(entry.actionDetails, details),
      };
    });
  }

  private resolveTotalPrice(
    raw: Record<string, unknown>,
    items: StaffPresentedOrderItem[],
  ): number {
    const candidates = [
      raw.totalPrice,
      raw.orderTotal,
      (raw.order as Record<string, unknown> | undefined)?.orderTotal,
    ];
    for (const value of candidates) {
      const num = Number(value);
      if (Number.isFinite(num) && num > 0) return num;
    }
    const computed = items.reduce((sum, line) => sum + line.total, 0);
    return computed > 0 ? computed : 0;
  }

  private resolveCreatedAt(
    actionDetails: Array<{ time?: string }>,
    raw: Record<string, unknown>,
  ): string | null {
    if (actionDetails.length > 0) {
      const first = actionDetails.find((detail) => detail.time)?.time;
      if (first) return first;
    }
    return this.stringOrNull(raw.createdAt ?? raw.updatedAt ?? raw.at);
  }

  private stringOrNull(value: unknown): string | null {
    const text = String(value ?? '').trim();
    return text.length > 0 ? text : null;
  }

  private numberOrNull(value: unknown): number | null {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  /** Preserve Express booleans; omit when absent (backward compatible). */
  private booleanOrNull(value: unknown): boolean | null {
    if (value === true || value === false) return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return null;
  }
}
