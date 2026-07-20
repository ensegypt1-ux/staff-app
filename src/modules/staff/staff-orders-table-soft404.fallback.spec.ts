import { StaffOrdersFlowService } from './staff-orders-flow.service';
import { StaffOrderPresenterService } from './staff-order-presenter.service';
import { StaffTableOrderCreatorRegistry } from './staff-table-order-creator.registry';
import { EnsHttpService } from '../../infrastructure/ens-backend/ens-http.service';
import { waiterAuth, cashierAuth } from './staff-auth.fixtures';
import { Request } from 'express';

function mockReq(menuId = 7): Request {
  return {
    headers: { authorization: 'Bearer test' },
    user: { userId: 1, role: 'staff', menuId },
  } as unknown as Request;
}

describe('StaffOrdersFlowService table activity-logs soft-404 fallback', () => {
  let ensHttp: { proxy: jest.Mock };
  let service: StaffOrdersFlowService;
  let presenter: StaffOrderPresenterService;

  beforeEach(() => {
    ensHttp = { proxy: jest.fn() };
    presenter = new StaffOrderPresenterService();
    service = new StaffOrdersFlowService(
      ensHttp as unknown as EnsHttpService,
      presenter,
      new StaffTableOrderCreatorRegistry(),
    );

    jest
      .spyOn(service, 'resolveStaffAuth')
      .mockResolvedValue(waiterAuth());
    jest.spyOn(service, 'resolveMenuId').mockReturnValue(7);
  });

  it('falls back to table-calls when activity-logs returns menu soft-404', async () => {
    ensHttp.proxy.mockImplementation(async (args: { path: string }) => {
      if (args.path === 'menus/7/activity-logs') {
        return {
          status: 404,
          data: {
            error: 'Menu not found',
            errorEn: 'Menu not found',
            errorAr: 'المنيو غير موجود',
          },
        };
      }
      if (args.path === 'staff-auth/table-calls') {
        return {
          status: 200,
          data: {
            calls: [
              {
                id: 101,
                tableNumber: '5',
                status: 'pending',
                requestKind: 'order',
                items: [{ name: 'Tea', quantity: 1, price: 2, total: 2 }],
                orderTotal: 2,
                at: '2026-07-20T10:00:00.000Z',
              },
              {
                id: 102,
                tableNumber: '3',
                status: 'pending',
                requestKind: 'waiter',
                items: [],
                orderTotal: 0,
                at: '2026-07-20T10:05:00.000Z',
              },
            ],
          },
        };
      }
      if (args.path === 'staff-auth/table-calls/history') {
        return {
          status: 200,
          data: {
            calls: [
              {
                id: 201,
                tableNumber: '8',
                status: 'confirmed',
                requestKind: 'order',
                items: [{ name: 'Soup', quantity: 1, price: 5, total: 5 }],
                orderTotal: 5,
                at: '2026-07-20T09:00:00.000Z',
              },
              {
                id: 202,
                tableNumber: '9',
                status: 'prepared',
                requestKind: 'order',
                items: [],
                orderTotal: 0,
                at: '2026-07-20T08:00:00.000Z',
              },
              {
                id: 203,
                tableNumber: '10',
                status: 'delivered',
                requestKind: 'order',
                items: [],
                orderTotal: 0,
                at: '2026-07-20T07:00:00.000Z',
              },
              {
                id: 204,
                tableNumber: '11',
                status: 'cancelled',
                requestKind: 'order',
                items: [],
                orderTotal: 0,
                at: '2026-07-20T06:00:00.000Z',
              },
            ],
            total: 4,
            totalPages: 1,
          },
        };
      }
      if (args.path === 'staff-auth/me') {
        return { status: 200, data: { permissions: [], staff: {}, menu: {} } };
      }
      return { status: 404, data: { error: 'unexpected' } };
    });

    const result = await service.listOrders(mockReq(), {
      channel: 'table',
      scope: 'active',
      page: 1,
      limit: 50,
    });

    expect(result.status).toBe(200);
    const data = result.data as Record<string, unknown>;
    expect(data.code).toBeUndefined();
    const entries = data.entries as Array<Record<string, unknown>>;
    const statuses = entries.map((e) => e.status).sort();
    expect(statuses).toEqual(['confirmed', 'pending', 'pending', 'prepared']);
    expect(entries.some((e) => e.requestKind === 'waiter')).toBe(true);
    expect(entries.some((e) => e.tableNumber === '5')).toBe(true);
    expect(Number(data.pendingCount)).toBeGreaterThanOrEqual(2);
    expect(
      entries.every((e) => Array.isArray(e.availableActions)),
    ).toBe(true);
  });

  it('does not fall back when activity-logs succeeds (cashier path)', async () => {
    jest.spyOn(service, 'resolveStaffAuth').mockResolvedValue(cashierAuth());

    ensHttp.proxy.mockImplementation(async (args: { path: string }) => {
      if (args.path === 'menus/7/activity-logs') {
        return {
          status: 200,
          data: {
            entries: [
              {
                id: 900,
                orderId: 301,
                tableNumber: '1',
                status: 'pending',
                requestKind: 'order',
                items: [],
                orderTotal: 0,
                createdAt: '2026-07-20T10:00:00.000Z',
              },
            ],
            total: 1,
            totalPages: 1,
          },
        };
      }
      if (args.path === 'staff-auth/table-calls') {
        return { status: 200, data: { calls: [] } };
      }
      return { status: 200, data: {} };
    });

    const result = await service.listOrders(mockReq(), {
      channel: 'table',
      scope: 'active',
      page: 1,
      limit: 50,
    });

    expect(result.status).toBe(200);
    const tableCallsListCalls = ensHttp.proxy.mock.calls.filter(
      (call) => call[0]?.path === 'staff-auth/table-calls/history',
    );
    // Soft-404 fallback scans history; success path must not.
    expect(tableCallsListCalls.length).toBe(0);

    const data = result.data as Record<string, unknown>;
    const entries = data.entries as Array<Record<string, unknown>>;
    expect(entries).toHaveLength(1);
    expect(entries[0].staffCallId).toBe(301);
  });

  it('does not map list soft-404 to ORDER_NOT_FOUND', async () => {
    ensHttp.proxy.mockImplementation(async (args: { path: string }) => {
      if (args.path === 'menus/7/activity-logs') {
        return {
          status: 404,
          data: {
            error: 'Menu not found',
            errorEn: 'Menu not found',
            errorAr: 'المنيو غير موجود',
          },
        };
      }
      if (
        args.path === 'staff-auth/table-calls' ||
        args.path === 'staff-auth/table-calls/history'
      ) {
        return { status: 200, data: { calls: [], total: 0, totalPages: 0 } };
      }
      return { status: 200, data: {} };
    });

    const result = await service.listOrders(mockReq(), {
      channel: 'table',
      scope: 'active',
    });

    expect(result.status).toBe(200);
    expect((result.data as Record<string, unknown>).code).not.toBe(
      'ORDER_NOT_FOUND',
    );
  });
});
