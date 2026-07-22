import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { setRequestPerfRoute } from '../utils/request-upstream-cache.util';

/**
 * Safe per-route timing. Logs method, route template/path, status, duration only.
 * Never logs Authorization, bodies, tokens, or PII.
 */
@Injectable()
export class RouteTimingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('RouteTiming');
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    this.enabled = this.config.get<boolean>('perfTimingLog') === true;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.enabled || context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const started = Date.now();

    const handler = context.getHandler()?.name ?? 'handler';
    const controller = context.getClass()?.name ?? 'Controller';
    const routePath =
      (req.route && typeof req.route.path === 'string'
        ? String(req.baseUrl || '') + String(req.route.path)
        : req.path) || '/';
    const label = `${req.method} ${routePath} (${controller}.${handler})`;
    setRequestPerfRoute(req, label);

    return next.handle().pipe(
      tap({
        next: () => {
          this.logger.log(
            `[route] ${req.method} ${routePath} -> ${res.statusCode} ${Date.now() - started}ms`,
          );
        },
        error: () => {
          const status = res.statusCode || 500;
          this.logger.log(
            `[route] ${req.method} ${routePath} -> ${status} ${Date.now() - started}ms`,
          );
        },
      }),
    );
  }
}
