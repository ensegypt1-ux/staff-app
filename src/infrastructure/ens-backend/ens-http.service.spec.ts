import { ConfigService } from '@nestjs/config';
import { of } from 'rxjs';
import { EnsHttpService } from './ens-http.service';
import { ApiKeyService } from './api-key.service';
import { Request } from 'express';

describe('EnsHttpService request-scoped GET coalescing', () => {
  let httpService: { request: jest.Mock };
  let service: EnsHttpService;

  beforeEach(() => {
    httpService = {
      request: jest.fn(),
    };
    const config = {
      get: (key: string) => {
        if (key === 'ensBackendUrl') return 'https://ensapi.example';
        if (key === 'upstreamTimeoutMs') return 5000;
        if (key === 'upstreamDebugLog') return false;
        if (key === 'perfTimingLog') return false;
        return undefined;
      },
    } as unknown as ConfigService;
    const apiKey = {
      isConfigured: () => false,
      refreshClock: async () => undefined,
      generateHeaderValueAsync: async () => 'x',
    } as unknown as ApiKeyService;

    service = new EnsHttpService(
      httpService as never,
      config,
      apiKey,
    );
  });

  it('issues one HTTP call for concurrent identical GETs on one request', async () => {
    httpService.request.mockImplementation(() =>
      of({ status: 200, data: { calls: [] } }),
    );

    const req = {
      headers: { authorization: 'Bearer abc' },
    } as Request;

    await Promise.all([
      service.proxy({ method: 'GET', path: 'staff-auth/table-calls', req }),
      service.proxy({ method: 'GET', path: 'staff-auth/table-calls', req }),
      service.proxy({ method: 'GET', path: 'staff-auth/table-calls', req }),
    ]);

    expect(httpService.request).toHaveBeenCalledTimes(1);
  });

  it('does not coalesce across different bearer tokens', async () => {
    httpService.request.mockImplementation(() =>
      of({ status: 200, data: { ok: true } }),
    );

    await Promise.all([
      service.proxy({
        method: 'GET',
        path: 'staff-auth/me',
        req: { headers: { authorization: 'Bearer a' } } as Request,
      }),
      service.proxy({
        method: 'GET',
        path: 'staff-auth/me',
        req: { headers: { authorization: 'Bearer b' } } as Request,
      }),
    ]);

    expect(httpService.request).toHaveBeenCalledTimes(2);
  });
});
