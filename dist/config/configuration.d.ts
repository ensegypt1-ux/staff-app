declare const _default: () => {
    port: number;
    nodeEnv: string;
    ensBackendUrl: string | undefined;
    assetPublicBaseUrl: string | undefined;
    corsOrigins: string;
    secretKey: string | undefined;
    jwtAccessSecret: string | undefined;
    apiKeyTimeOffsetSeconds: number;
    upstreamDebugLog: boolean;
    upstreamTimeoutMs: number;
    requestJsonLimit: string;
    requestUrlencodedLimit: string;
    trustProxyHops: number;
    throttleTtlMs: number;
    throttleLimit: number;
};
export default _default;
