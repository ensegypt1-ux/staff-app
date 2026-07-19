import { applyDecorators } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Stricter limit for staff login. */
export function AuthThrottle() {
  return applyDecorators(
    Throttle({
      default: {
        limit: () => envInt('THROTTLE_AUTH_LIMIT', 20),
        ttl: () => envInt('THROTTLE_AUTH_TTL_MS', 60_000),
      },
    }),
  );
}

/** Health probes — light IP throttle. */
export function HealthThrottle() {
  return applyDecorators(
    Throttle({
      default: {
        limit: () => envInt('THROTTLE_HEALTH_LIMIT', 60),
        ttl: () => envInt('THROTTLE_HEALTH_TTL_MS', 60_000),
      },
    }),
  );
}
