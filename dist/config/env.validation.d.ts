export declare class EnvironmentVariables {
    PORT: number;
    NODE_ENV: string;
    ENS_BACKEND_URL: string;
    ASSET_PUBLIC_BASE_URL: string;
    CORS_ORIGINS: string;
    SECRET_KEY: string;
    JWT_ACCESS_SECRET?: string;
    API_KEY_TIME_OFFSET_SECONDS?: number;
    UPSTREAM_DEBUG_LOG?: string;
    UPSTREAM_TIMEOUT_MS?: number;
    TRUST_PROXY_HOPS?: number;
    THROTTLE_TTL_MS?: number;
    THROTTLE_LIMIT?: number;
    THROTTLE_AUTH_TTL_MS?: number;
    THROTTLE_AUTH_LIMIT?: number;
    REQUEST_JSON_LIMIT?: string;
    REQUEST_URLENCODED_LIMIT?: string;
}
export declare function validateEnv(config: Record<string, unknown>): EnvironmentVariables;
