import { Request } from 'express';
import {
  authFingerprintFromRequest,
  buildUpstreamCacheKey,
  coalesceRequestUpstream,
} from './request-upstream-cache.util';

function mockReq(auth: string): Request {
  return {
    headers: { authorization: auth },
  } as unknown as Request;
}

describe('request-upstream-cache.util', () => {
  it('isolates cache keys by authorization fingerprint', () => {
    const a = buildUpstreamCacheKey({
      method: 'GET',
      path: 'staff-auth/me',
      authFingerprint: authFingerprintFromRequest(mockReq('Bearer token-a')),
    });
    const b = buildUpstreamCacheKey({
      method: 'GET',
      path: 'staff-auth/me',
      authFingerprint: authFingerprintFromRequest(mockReq('Bearer token-b')),
    });
    expect(a).not.toEqual(b);
  });

  it('reuses a single in-flight request for concurrent identical GETs', async () => {
    const req = mockReq('Bearer same');
    let calls = 0;
    const factory = async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return { status: 200, data: { ok: true, n: calls } };
    };

    const key = buildUpstreamCacheKey({
      method: 'GET',
      path: 'staff-auth/table-calls',
      authFingerprint: authFingerprintFromRequest(req),
    });

    const [one, two, three] = await Promise.all([
      coalesceRequestUpstream(req, key, true, factory),
      coalesceRequestUpstream(req, key, true, factory),
      coalesceRequestUpstream(req, key, true, factory),
    ]);

    expect(calls).toBe(1);
    expect(one).toEqual(two);
    expect(two).toEqual(three);
  });

  it('reuses settled 2xx responses for later callers on the same request', async () => {
    const req = mockReq('Bearer settled');
    let calls = 0;
    const key = buildUpstreamCacheKey({
      method: 'GET',
      path: 'staff-auth/me',
      authFingerprint: authFingerprintFromRequest(req),
    });

    await coalesceRequestUpstream(req, key, true, async () => {
      calls += 1;
      return { status: 200, data: { id: 1 } };
    });
    await coalesceRequestUpstream(req, key, true, async () => {
      calls += 1;
      return { status: 200, data: { id: 2 } };
    });

    expect(calls).toBe(1);
  });

  it('does not settle non-2xx responses into the cache', async () => {
    const req = mockReq('Bearer fail');
    let calls = 0;
    const key = buildUpstreamCacheKey({
      method: 'GET',
      path: 'staff-auth/me',
      authFingerprint: authFingerprintFromRequest(req),
    });

    const first = await coalesceRequestUpstream(req, key, true, async () => {
      calls += 1;
      return { status: 401, data: { error: 'nope' } };
    });
    const second = await coalesceRequestUpstream(req, key, true, async () => {
      calls += 1;
      return { status: 200, data: { ok: true } };
    });

    expect(first.status).toBe(401);
    expect(second.status).toBe(200);
    expect(calls).toBe(2);
  });

  it('does not share responses across different request objects', async () => {
    const reqA = mockReq('Bearer shared-token');
    const reqB = mockReq('Bearer shared-token');
    let calls = 0;
    const key = buildUpstreamCacheKey({
      method: 'GET',
      path: 'staff-auth/me',
      authFingerprint: authFingerprintFromRequest(reqA),
    });

    await coalesceRequestUpstream(reqA, key, true, async () => {
      calls += 1;
      return { status: 200, data: { req: 'A' } };
    });
    await coalesceRequestUpstream(reqB, key, true, async () => {
      calls += 1;
      return { status: 200, data: { req: 'B' } };
    });

    expect(calls).toBe(2);
  });
});
