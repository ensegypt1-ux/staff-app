export declare class EnvironmentVariables {
    PORT: number;
    NODE_ENV: string;
    ENS_BACKEND_URL: string;
    ASSET_PUBLIC_BASE_URL: string;
    CORS_ORIGINS: string;
    SECRET_KEY: string;
    API_KEY_TIME_OFFSET_SECONDS?: number;
    UPSTREAM_DEBUG_LOG?: string;
    UPSTREAM_TIMEOUT_MS?: number;
}
export declare function validateEnv(config: Record<string, unknown>): EnvironmentVariables;
