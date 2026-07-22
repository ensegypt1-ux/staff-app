import { EnsHttpService } from '../../infrastructure/ens-backend/ens-http.service';
import { StaffOrderPresenterService } from './staff-order-presenter.service';
import { StaffOrdersFlowService } from './staff-orders-flow.service';
import { waiterAuth } from './staff-auth.fixtures';
import { Request } from 'express';

function mockReq(menuId = 7): Request {
  return {
    headers: { authorization: 'Bearer test' },
    user: { userId: 1, role: 'staff', menuId },
  } as unknown as Request;
}

/**
 * Documents upstream fan-out reduction on soft-404 fallback + happy path.
 * Counts are against a mock EnsHttpService (no real Express).
 */
describe('orders upstream fan-out reduction', () => {
  let ensHttp: { proxy: jest.Mock };
  let service: StaffOrdersFlowService;

  beforeEach(() => {
    ensHttp = { proxy: jest.fn() };
    service = new StaffOrdersFlowService(
      ensHttp as unknown as EnsHttpService,
      new StaffOrderPresenterService(),
    );
    jest.spyOn(service, 'resolveStaffAuth').mockResolvedValue(waiterAuth());
    jest.spyOn(service, 'resolveMenuId').mockReturnValue(7);
  });

  it('soft-404 fallback fetches staff-auth/table-calls only once', async () => {
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
                items: [],
                orderTotal: 0,
                at: '2026-07-20T10:00:00.000Z',
              },
            ],
          },
        };
      }
      if (args.path === 'staff-auth/table-calls/history') {
        return { status: 200, data: { calls: [], total: 0, totalPages: 0 } };
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
    const tableCalls = ensHttp.proxy.mock.calls.filter(
      (call) => call[0]?.path === 'staff-auth/table-calls',
    );
    // Before fix: 2 (Promise.all pending + pendingCount). After: 1.
    expect(tableCalls.length).toBe(1);
  });

  it('happy-path reuses identical table-calls GETs when EnsHttp coalesces', async () => {
    // Simulate request-scoped coalescing the way EnsHttpService does now.
    const settled = new Map<string, unknown>();
    ensHttp.proxy.mockImplementation(
      async (args: { method: string; path: string; query?: unknown }) => {
        const key = `${args.method}|${args.path}|${JSON.stringify(args.query ?? {})}`;
        if (settled.has(key)) return settled.get(key);

        let result: { status: number; data: unknown };
        if (args.path === 'menus/7/activity-logs') {
          result = {
            status: 200,
            data: {
              entries: [
                {
                  id: 900,
                  orderId: 301,
                  tableNumber: '1',
                  status: 'pending',
                  requestKind: 'order',
                  items: [{ name: 'Tea', quantity: 1 }],
                  orderTotal: 2,
                  createdAt: '2026-07-20T10:00:00.000Z',
                },
              ],
              total: 1,
              totalPages: 1,
            },
          };
        } else if (args.path === 'staff-auth/table-calls') {
          result = { status: 200, data: { calls: [] } };
        } else {
          result = { status: 200, data: {} };
        }
        settled.set(key, result);
        return result;
      },
    );

    // Wrap to count unique factory executions = settled size growth pattern
    let uniqueUpstream = 0;
    const inner = ensHttp.proxy.getMockImplementation()!;
    ensHttp.proxy.mockImplementation(async (args) => {
      const key = `${args.method}|${args.path}|${JSON.stringify(args.query ?? {})}`;
      const before = settled.has(key);
      const result = await inner(args);
      if (!before) uniqueUpstream += 1;
      return result;
    });

    const result = await service.listOrders(mockReq(), {
      channel: 'table',
      scope: 'active',
      page: 1,
      limit: 50,
    });

    expect(result.status).toBe(200);
    const tableCallsUnique = [...settled.keys()].filter((k) =>
      k.includes('staff-auth/table-calls|'),
    );
    // attention service merge + hydrate index share one coalesced GET
    expect(tableCallsUnique.length).toBe(1);
    expect(uniqueUpstream).toBeGreaterThan(0);
  });
});
