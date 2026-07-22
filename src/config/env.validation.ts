import { plainToInstance } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  validateSync,
} from 'class-validator';

export class EnvironmentVariables {
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3010;

  @IsString()
  @IsNotEmpty()
  NODE_ENV: string = 'development';

  @IsUrl({ require_tld: false })
  ENS_BACKEND_URL: string;

  @IsUrl({ require_tld: false })
  ASSET_PUBLIC_BASE_URL: string;

  @IsString()
  @IsNotEmpty()
  CORS_ORIGINS: string = '*';

  @IsString()
  @IsNotEmpty()
  SECRET_KEY: string;

  @IsOptional()
  @IsString()
  JWT_ACCESS_SECRET?: string;

  /** When true, logs upstream method/path/status (never full bodies). Forbidden in production. */

  @IsOptional()
  @IsInt()
  @Min(-120)
  @Max(120)
  API_KEY_TIME_OFFSET_SECONDS?: number;

  @IsOptional()
  @IsString()
  UPSTREAM_DEBUG_LOG?: string;

  @IsOptional()
  @IsInt()
  @Min(1000)
  UPSTREAM_TIMEOUT_MS?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  TRUST_PROXY_HOPS?: number;

  @IsOptional()
  @IsInt()
  @Min(1000)
  THROTTLE_TTL_MS?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  THROTTLE_LIMIT?: number;

  @IsOptional()
  @IsInt()
  @Min(1000)
  THROTTLE_AUTH_TTL_MS?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  THROTTLE_AUTH_LIMIT?: number;

  @IsOptional()
  @IsString()
  REQUEST_JSON_LIMIT?: string;

  @IsOptional()
  @IsString()
  REQUEST_URLENCODED_LIMIT?: string;

  @IsOptional()
  @IsString()
  PROCESS_ROLE?: string;

  @IsOptional()
  @IsString()
  DATABASE_URL?: string;

  @IsOptional()
  @IsString()
  ENS_SOCKET_URL?: string;

  @IsOptional()
  @IsString()
  FCM_ENABLED?: string;

  @IsOptional()
  @IsString()
  FCM_DRY_RUN?: string;

  @IsOptional()
  @IsString()
  FIREBASE_PROJECT_ID?: string;

  @IsOptional()
  @IsString()
  FIREBASE_CLIENT_EMAIL?: string;

  @IsOptional()
  @IsString()
  FIREBASE_PRIVATE_KEY?: string;

  @IsOptional()
  @IsString()
  FIREBASE_SERVICE_ACCOUNT_JSON?: string;
}

function isTruthy(raw: string | undefined): boolean {
  if (raw == null || raw === '') return false;
  const v = raw.trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(
      `Environment validation failed:\n${errors
        .map((e) => Object.values(e.constraints ?? {}).join(', '))
        .join('\n')}`,
    );
  }

  const nodeEnv = validated.NODE_ENV;
  const productionIssues: string[] = [];
  const role = (validated.PROCESS_ROLE ?? 'api').trim().toLowerCase();
  if (role !== 'api' && role !== 'worker' && role !== 'all') {
    productionIssues.push(
      'PROCESS_ROLE must be one of: api, worker, all',
    );
  }

  const fcmEnabled = isTruthy(validated.FCM_ENABLED);
  const needsDb =
    fcmEnabled || role === 'worker' || role === 'all' || !!validated.DATABASE_URL;

  if (fcmEnabled || role === 'worker' || role === 'all') {
    if (!(validated.DATABASE_URL?.trim())) {
      productionIssues.push(
        'DATABASE_URL is required when FCM_ENABLED=true or PROCESS_ROLE is worker|all',
      );
    }
  }

  if (nodeEnv === 'production') {
    const jwt = validated.JWT_ACCESS_SECRET?.trim() ?? '';
    if (jwt.length < 32) {
      productionIssues.push(
        'JWT_ACCESS_SECRET is required in production (min 32 characters)',
      );
    }

    if ((validated.CORS_ORIGINS ?? '').trim() === '*') {
      productionIssues.push(
        'CORS_ORIGINS=* is forbidden in production; set an explicit allowlist',
      );
    }

    if (role === 'all') {
      productionIssues.push(
        'PROCESS_ROLE=all is not allowed in production; use api and worker separately',
      );
    }

    if (isTruthy(validated.UPSTREAM_DEBUG_LOG)) {
      productionIssues.push(
        'UPSTREAM_DEBUG_LOG=true is forbidden in production',
      );
    }

    const secret = validated.SECRET_KEY?.trim() ?? '';
    if (secret.length < 32) {
      productionIssues.push(
        'SECRET_KEY must be at least 32 characters in production',
      );
    }
  }

  // Silence unused when only validating presence path
  void needsDb;

  if (productionIssues.length > 0) {
    throw new Error(
      `Environment validation failed:\n${productionIssues.join('\n')}`,
    );
  }

  return validated;
}
