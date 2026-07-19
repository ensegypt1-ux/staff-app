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
  }

  if (productionIssues.length > 0) {
    throw new Error(
      `Environment validation failed:\n${productionIssues.join('\n')}`,
    );
  }

  return validated;
}
