import { createHash } from 'crypto';
import { Request } from 'express';

export type CachedUpstreamResult = {
  status: number;
  data: unknown;
};

type RequestUpstreamStore = {
  inflight: Map<string, Promise<CachedUpstreamResult>>;
  settled: Map<string, CachedUpstreamResult>;
};

const REQUEST_UPSTREAM_STORE = Symbol.for('ens.reqUpstreamStore');
export const REQUEST_PERF_ROUTE = Symbol.for('ens.reqPerfRoute');

function getStore(req: Request): RequestUpstreamStore {
  const keyed = req as Request & {
    [REQUEST_UPSTREAM_STORE]?: RequestUpstreamStore;
  };
  let store = keyed[REQUEST_UPSTREAM_STORE];
  if (!store) {
    store = { inflight: new Map(), settled: new Map() };
    Object.defineProperty(req, REQUEST_UPSTREAM_STORE, {
      value: store,
      writable: false,
      enumerable: false,
      configurable: true,
    });
  }
  return store;
}

/** Stable fingerprint of the caller auth header — never logs the raw token. */
export function authFingerprintFromRequest(
  req: Request | undefined,
  headerOverride?: Record<string, string>,
): string {
  const raw =
    headerOverride?.authorization ??
    headerOverride?.Authorization ??
    (typeof req?.headers?.authorization === 'string'
      ? req.headers.authorization
      : '');
  if (!raw) return 'anon';
  return createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

export function stableQueryKey(
  query?: Record<string, unknown>,
): string {
  if (!query) return '';
  const entries: string[] = [];
  for (const key of Object.keys(query).sort()) {
    const value = query[key];
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      entries.push(
        `${key}=${value.map((item) => String(item)).sort().join(',')}`,
      );
    } else {
      entries.push(`${key}=${String(value)}`);
    }
  }
  return entries.join('&');
}

export function buildUpstreamCacheKey(input: {
  method: string;
  path: string;
  query?: Record<string, unknown>;
  authFingerprint: string;
}): string {
  return [
    input.method.toUpperCase(),
    input.path.replace(/^\/+/, ''),
    stableQueryKey(input.query),
    input.authFingerprint,
  ].join('|');
}

/**
 * Request-scoped GET coalescing:
 * - Concurrent identical GETs share one in-flight Promise
 * - Successful 2xx responses are reused for the rest of the request
 * - Failures (non-2xx / thrown) are never settled into the cache
 * - Isolation is by Authorization fingerprint so tokens cannot share data
 */
export async function coalesceRequestUpstream(
  req: Request | undefined,
  key: string,
  enabled: boolean,
  factory: () => Promise<CachedUpstreamResult>,
): Promise<CachedUpstreamResult> {
  if (!enabled || !req) {
    return factory();
  }

  const store = getStore(req);
  const hit = store.settled.get(key);
  if (hit) {
    return { status: hit.status, data: hit.data };
  }

  const existing = store.inflight.get(key);
  if (existing) {
    const shared = await existing;
    return { status: shared.status, data: shared.data };
  }

  const pending = factory()
    .then((result) => {
      if (result.status >= 200 && result.status < 300) {
        store.settled.set(key, {
          status: result.status,
          data: result.data,
        });
      }
      return result;
    })
    .finally(() => {
      store.inflight.delete(key);
    });

  store.inflight.set(key, pending);
  return pending;
}

export function setRequestPerfRoute(req: Request, route: string): void {
  Object.defineProperty(req, REQUEST_PERF_ROUTE, {
    value: route,
    writable: true,
    enumerable: false,
    configurable: true,
  });
}

export function getRequestPerfRoute(req: Request | undefined): string | undefined {
  if (!req) return undefined;
  const value = (req as Request & { [REQUEST_PERF_ROUTE]?: string })[
    REQUEST_PERF_ROUTE
  ];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
