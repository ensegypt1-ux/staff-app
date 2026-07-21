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
    PROCESS_ROLE?: string;
    DATABASE_URL?: string;
    ENS_SOCKET_URL?: string;
    FCM_ENABLED?: string;
    FCM_DRY_RUN?: string;
    FIREBASE_PROJECT_ID?: string;
    FIREBASE_CLIENT_EMAIL?: string;
    FIREBASE_PRIVATE_KEY?: string;
    FIREBASE_SERVICE_ACCOUNT_JSON?: string;
}
export declare function validateEnv(config: Record<string, unknown>): EnvironmentVariables;
