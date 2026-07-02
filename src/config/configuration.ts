export default () => ({
  port: parseInt(process.env.PORT ?? '3010', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  ensBackendUrl: process.env.ENS_BACKEND_URL?.replace(/\/$/, ''),
  assetPublicBaseUrl: process.env.ASSET_PUBLIC_BASE_URL?.replace(/\/$/, ''),
  corsOrigins: process.env.CORS_ORIGINS ?? '*',
  secretKey: process.env.SECRET_KEY ?? process.env.ENCRYPTION_KEY,
  apiKeyTimeOffsetSeconds: parseInt(
    process.env.API_KEY_TIME_OFFSET_SECONDS ?? '0',
    10,
  ),
  upstreamDebugLog: process.env.UPSTREAM_DEBUG_LOG === 'true',
  upstreamTimeoutMs: parseInt(process.env.UPSTREAM_TIMEOUT_MS ?? '30000', 10),
});
