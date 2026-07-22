export type ProcessRole = 'api' | 'worker' | 'all';

function parseProcessRole(raw: string | undefined): ProcessRole {
  const value = (raw ?? 'api').trim().toLowerCase();
  if (value === 'worker' || value === 'all' || value === 'api') {
    return value;
  }
  return 'api';
}

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw == null || raw === '') return fallback;
  const v = raw.trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return fallback;
}

export default () => {
  const processRole = parseProcessRole(process.env.PROCESS_ROLE);
  return {
    port: parseInt(process.env.PORT ?? '3010', 10),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    ensBackendUrl: process.env.ENS_BACKEND_URL?.replace(/\/$/, ''),
    assetPublicBaseUrl: process.env.ASSET_PUBLIC_BASE_URL?.replace(/\/$/, ''),
    corsOrigins: process.env.CORS_ORIGINS ?? '*',
    secretKey: process.env.SECRET_KEY ?? process.env.ENCRYPTION_KEY,
    jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
    apiKeyTimeOffsetSeconds: parseInt(
      process.env.API_KEY_TIME_OFFSET_SECONDS ?? '0',
      10,
    ),
    upstreamDebugLog: process.env.UPSTREAM_DEBUG_LOG === 'true',
    /** Safe route/upstream duration logs (no tokens/bodies). Allowed in production. */
    perfTimingLog: parseBool(process.env.PERF_TIMING_LOG, false),
    upstreamTimeoutMs: parseInt(process.env.UPSTREAM_TIMEOUT_MS ?? '30000', 10),
    requestJsonLimit: process.env.REQUEST_JSON_LIMIT ?? '1mb',
    requestUrlencodedLimit: process.env.REQUEST_URLENCODED_LIMIT ?? '1mb',
    trustProxyHops: parseInt(
      process.env.TRUST_PROXY_HOPS ??
        (process.env.NODE_ENV === 'production' ? '1' : '0'),
      10,
    ),
    throttleTtlMs: parseInt(process.env.THROTTLE_TTL_MS ?? '60000', 10),
    throttleLimit: parseInt(process.env.THROTTLE_LIMIT ?? '120', 10),

    processRole,
    isApiRole: processRole === 'api' || processRole === 'all',
    isWorkerRole: processRole === 'worker' || processRole === 'all',

    databaseUrl: process.env.DATABASE_URL?.trim() || undefined,
    ensSocketUrl: (
      process.env.ENS_SOCKET_URL ??
      process.env.ENS_BACKEND_URL ??
      ''
    ).replace(/\/$/, ''),
    fcmEnabled: parseBool(process.env.FCM_ENABLED, false),
    fcmDryRun: parseBool(process.env.FCM_DRY_RUN, false),
    fcmReconcileIntervalMs: parseInt(
      process.env.FCM_RECONCILE_INTERVAL_MS ?? '3000',
      10,
    ),
    fcmUncoveredReadyMs: parseInt(
      process.env.FCM_UNCOVERED_READY_MS ?? '180000',
      10,
    ),
    fcmPerMenuRateLimit: parseInt(
      process.env.FCM_PER_MENU_RATE_LIMIT ?? '30',
      10,
    ),
    firebaseProjectId: process.env.FIREBASE_PROJECT_ID?.trim() || undefined,
    firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL?.trim() || undefined,
    firebasePrivateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(
      /\\n/g,
      '\n',
    ),
    firebaseServiceAccountJson:
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim() || undefined,
  };
};
