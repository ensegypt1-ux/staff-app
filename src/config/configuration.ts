export default () => ({
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
});
