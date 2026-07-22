import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class UpstreamExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(UpstreamExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      response.status(status).json(this.normalize(payload, status, request));
      return;
    }

    this.logger.error('Unhandled gateway error', exception as Error);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal gateway error',
      errorAr: 'خطأ داخلي في البوابة',
      code: 'GATEWAY_ERROR',
      requestId: request.headers['x-request-id'],
    });
  }

  private normalize(
    payload: string | object,
    statusCode: number,
    request: Request,
  ): Record<string, unknown> {
    const requestId = request.headers['x-request-id'];

    if (typeof payload === 'string') {
      return {
        statusCode,
        error: payload,
        requestId,
      };
    }

    const record = payload as Record<string, unknown>;
    const error =
      typeof record.error === 'string'
        ? record.error
        : typeof record.message === 'string'
          ? record.message
          : Array.isArray(record.message)
            ? 'Validation failed'
            : 'Request failed';

    return {
      statusCode:
        typeof record.statusCode === 'number' ? record.statusCode : statusCode,
      error,
      errorAr: typeof record.errorAr === 'string' ? record.errorAr : undefined,
      code: typeof record.code === 'string' ? record.code : undefined,
      requestId,
    };
  }
}
