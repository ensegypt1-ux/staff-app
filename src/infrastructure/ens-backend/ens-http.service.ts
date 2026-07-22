import { HttpService } from '@nestjs/axios';
import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError, AxiosRequestConfig, Method } from 'axios';
import { Request } from 'express';
import { firstValueFrom } from 'rxjs';
import { pickForwardHeaders } from '../../common/utils/forward-headers.util';
import {
  authFingerprintFromRequest,
  buildUpstreamCacheKey,
  coalesceRequestUpstream,
  getRequestPerfRoute,
} from '../../common/utils/request-upstream-cache.util';
import { ApiKeyService } from './api-key.service';

export interface EnsHttpResult {
  status: number;
  data: unknown;
}

export interface EnsProxyOptions {
  method: Method;
  path: string;
  req?: Request;
  body?: unknown;
  query?: Record<string, unknown>;
  headers?: Record<string, string>;
  timeoutMs?: number;
  /**
   * GET default `request`: coalesce in-flight + reuse 2xx for this HTTP request.
   * Use `none` after logout / when a fresh upstream read is required.
   */
  cacheMode?: 'request' | 'none';
}

function isUpstreamTokenExpired(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const body = data as Record<string, unknown>;
  const en = String(body.error ?? body.errorEn ?? '').toLowerCase();
  const ar = String(body.errorAr ?? '');
  return (
    body.code === 'TOKEN_EXPIRED' ||
    en.includes('token expired') ||
    ar.includes('انتهت صلاحية الرمز')
  );
}

/**
 * Proxies to Express legacy /api/* routes.
 */
@Injectable()
export class EnsHttpService implements OnModuleInit {
  private readonly logger = new Logger(EnsHttpService.name);
  private readonly apiBaseUrl: string;
  private readonly defaultTimeoutMs: number;
  private readonly upstreamDebugLog: boolean;
  private readonly perfTimingLog: boolean;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly apiKeyService: ApiKeyService,
  ) {
    const backendUrl = this.configService.get<string>('ensBackendUrl');
    this.apiBaseUrl = `${backendUrl}/api`;
    this.defaultTimeoutMs =
      this.configService.get<number>('upstreamTimeoutMs') ?? 30000;
    this.upstreamDebugLog =
      this.configService.get<boolean>('upstreamDebugLog') ?? false;
    this.perfTimingLog =
      this.configService.get<boolean>('perfTimingLog') ?? false;
  }

  async onModuleInit(): Promise<void> {
    if (this.apiKeyService.isConfigured()) {
      await this.apiKeyService.refreshClock(true);
    }
  }

  buildUrl(path: string, query?: Record<string, unknown>): string {
    const normalizedPath = path.replace(/^\/+/, '');
    const url = new URL(`${this.apiBaseUrl}/${normalizedPath}`);

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) continue;
        if (Array.isArray(value)) {
          value.forEach((item) => url.searchParams.append(key, String(item)));
        } else {
          url.searchParams.set(key, String(value));
        }
      }
    }

    return url.toString();
  }

  /** Safe upstream error summary — never dumps full bodies or tokens. */
  private summarizeUpstreamBody(data: unknown): string {
    if (!data || typeof data !== 'object') {
      return '';
    }
    const body = data as Record<string, unknown>;
    const parts: string[] = [];
    if (body.code != null) {
      parts.push(`code=${String(body.code).slice(0, 64)}`);
    }
    if (body.error != null) {
      parts.push(`error=${String(body.error).slice(0, 120)}`);
    }
    return parts.join(' ');
  }

  private redactUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return `${parsed.origin}${parsed.pathname}`;
    } catch {
      return '[upstream]';
    }
  }

  private logUpstream(
    method: string,
    url: string,
    status: number,
    data: unknown,
    durationMs: number,
    req?: Request,
  ): void {
    const isError = status >= 400;
    if (!isError && !this.upstreamDebugLog && !this.perfTimingLog) return;

    const summary = isError ? this.summarizeUpstreamBody(data) : '';
    const route = getRequestPerfRoute(req);
    const routePart = route ? ` route=${route}` : '';
    const line =
      `[upstream] ${method} ${this.redactUrl(url)} -> ${status} ${durationMs}ms` +
      routePart +
      (summary ? ` | ${summary}` : '');

    if (isError) {
      this.logger.warn(line);
      return;
    }

    // PERF_TIMING_LOG is production-safe (path/status/duration only).
    if (this.perfTimingLog) {
      this.logger.log(line);
    } else {
      this.logger.debug(line);
    }
  }

  private async attachApiKey(
    headers: Record<string, string>,
    forceClockSync = false,
  ): Promise<void> {
    if (!headers['x-api-key'] && this.apiKeyService.isConfigured()) {
      headers['x-api-key'] =
        await this.apiKeyService.generateHeaderValueAsync(forceClockSync);
    }
  }

  private async executeRequest(
    options: EnsProxyOptions,
    headers: Record<string, string>,
  ): Promise<EnsHttpResult> {
    const url = this.buildUrl(options.path, options.query);
    const started = Date.now();

    const config: AxiosRequestConfig = {
      method: options.method,
      url,
      headers,
      timeout: options.timeoutMs ?? this.defaultTimeoutMs,
      validateStatus: () => true,
    };

    if (options.body !== undefined && options.method !== 'GET') {
      config.data = options.body;
      if (!config.headers?.['content-type']) {
        config.headers = {
          ...config.headers,
          'content-type': 'application/json',
        };
      }
    }

    try {
      const response = await firstValueFrom(this.httpService.request(config));
      const result = {
        status: response.status,
        data: response.data,
      };
      this.logUpstream(
        String(options.method),
        url,
        result.status,
        result.data,
        Date.now() - started,
        options.req,
      );
      return result;
    } catch (error) {
      if (error instanceof AxiosError) {
        if (error.response) {
          const result = {
            status: error.response.status,
            data: error.response.data,
          };
          this.logUpstream(
            String(options.method),
            url,
            result.status,
            result.data,
            Date.now() - started,
            options.req,
          );
          return result;
        }
        if (error.code === 'ECONNABORTED') {
          this.logger.warn(
            `[upstream] ${options.method} ${this.redactUrl(url)} -> timeout after ${Date.now() - started}ms`,
          );
          return {
            status: 504,
            data: {
              error: 'Upstream request timed out',
              errorAr: 'انتهت مهلة الطلب',
              code: 'UPSTREAM_TIMEOUT',
            },
          };
        }
      }

      this.logger.error(
        `[upstream] ${options.method} ${this.redactUrl(url)} -> unavailable (${error instanceof Error ? error.message : String(error)})`,
      );

      throw new ServiceUnavailableException({
        error: 'Upstream service unavailable',
        errorAr: 'الخدمة غير متاحة',
        code: 'UPSTREAM_UNAVAILABLE',
      });
    }
  }

  async proxy(options: EnsProxyOptions): Promise<EnsHttpResult> {
    const method = String(options.method).toUpperCase();
    const cacheMode =
      options.cacheMode ?? (method === 'GET' ? 'request' : 'none');
    const authFingerprint = authFingerprintFromRequest(
      options.req,
      options.headers,
    );
    const cacheKey = buildUpstreamCacheKey({
      method,
      path: options.path,
      query: options.query,
      authFingerprint,
    });

    return coalesceRequestUpstream(
      options.req,
      cacheKey,
      cacheMode === 'request' && method === 'GET',
      async () => {
        const headers: Record<string, string> = {
          ...(options.req ? pickForwardHeaders(options.req) : {}),
          ...(options.headers ?? {}),
        };

        await this.attachApiKey(headers);

        let result = await this.executeRequest(options, headers);

        if (
          result.status === 405 &&
          isUpstreamTokenExpired(result.data) &&
          this.apiKeyService.isConfigured()
        ) {
          this.logger.warn(
            '[upstream] x-api-key rejected as expired — re-syncing clock and retrying once',
          );
          await this.attachApiKey(headers, true);
          result = await this.executeRequest(options, headers);
        }

        return result;
      },
    );
  }
}
