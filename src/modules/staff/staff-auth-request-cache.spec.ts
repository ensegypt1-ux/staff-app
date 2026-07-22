import { Request } from 'express';
import { EnsHttpService } from '../../infrastructure/ens-backend/ens-http.service';
import { StaffOrderPresenterService } from './staff-order-presenter.service';
import { StaffOrdersFlowService } from './staff-orders-flow.service';

function mockReq(token: string, menuId = 7): Request {
  return {
    headers: { authorization: `Bearer ${token}` },
    user: { userId: 1, role: 'staff', menuId },
  } as unknown as Request;
}

describe('StaffOrdersFlowService resolveStaffAuth caching', () => {
  let ensHttp: { proxy: jest.Mock };
  let service: StaffOrdersFlowService;

  beforeEach(() => {
    ensHttp = { proxy: jest.fn() };
    service = new StaffOrdersFlowService(
      ensHttp as unknown as EnsHttpService,
      new StaffOrderPresenterService(),
    );
  });

  it('reuses successful /me for repeated resolveStaffAuth on one request', async () => {
    ensHttp.proxy.mockResolvedValue({
      status: 200,
      data: {
        permissions: ['orders:view'],
        staff: { roleId: 2, roleName: 'waiter' },
        menu: { slug: 'demo' },
      },
    });

    const req = mockReq('tok-ok');
    const first = await service.resolveStaffAuth(req);
    const second = await service.resolveStaffAuth(req);

    expect(first.permissions).toContain('orders:view');
    expect(second).toBe(first);
    expect(ensHttp.proxy).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent resolveStaffAuth calls into one upstream /me', async () => {
    let resolveUpstream: (value: unknown) => void;
    ensHttp.proxy.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpstream = resolve;
        }),
    );

    const req = mockReq('tok-concurrent');
    const p1 = service.resolveStaffAuth(req);
    const p2 = service.resolveStaffAuth(req);

    expect(ensHttp.proxy).toHaveBeenCalledTimes(1);
    resolveUpstream!({
      status: 200,
      data: {
        permissions: ['orders:view'],
        staff: { roleName: 'waiter' },
        menu: { slug: 'x' },
      },
    });

    const [a, b] = await Promise.all([p1, p2]);
    expect(a.permissions).toEqual(b.permissions);
    expect(ensHttp.proxy).toHaveBeenCalledTimes(1);
  });

  it('does not cache failed authentication lookups', async () => {
    ensHttp.proxy
      .mockResolvedValueOnce({
        status: 401,
        data: { error: 'Unauthorized' },
      })
      .mockResolvedValueOnce({
        status: 200,
        data: {
          permissions: ['orders:view'],
          staff: { roleName: 'waiter' },
          menu: { slug: 'demo' },
        },
      });

    const req = mockReq('tok-retry');
    const failed = await service.resolveStaffAuth(req);
    expect(failed.permissions).toEqual([]);

    const ok = await service.resolveStaffAuth(req);
    expect(ok.permissions).toContain('orders:view');
    expect(ensHttp.proxy).toHaveBeenCalledTimes(2);
  });

  it('does not share auth results across different request objects', async () => {
    ensHttp.proxy.mockImplementation(async () => ({
      status: 200,
      data: {
        permissions: ['orders:view'],
        staff: { roleName: 'waiter' },
        menu: { slug: 'demo' },
      },
    }));

    await service.resolveStaffAuth(mockReq('tok-a'));
    await service.resolveStaffAuth(mockReq('tok-b'));
    expect(ensHttp.proxy).toHaveBeenCalledTimes(2);
  });
});
