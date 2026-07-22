import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { applyProcessRoleFromArgv } from './config/process-role';

function parseCorsOrigins(
  value: string,
  nodeEnv: string,
): string[] | boolean {
  const trimmed = value.trim();
  if (trimmed === '*') {
    if (nodeEnv === 'production') {
      throw new Error(
        'CORS_ORIGINS=* is not allowed when NODE_ENV=production. Set an explicit allowlist.',
      );
    }
    return true;
  }

  return trimmed
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

async function bootstrap() {
  // Must run before AppModule is loaded (imports are hoisted otherwise).
  applyProcessRoleFromArgv();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AppModule } = require('./app.module') as typeof import('./app.module');

  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    logger:
      nodeEnv === 'production'
        ? ['error', 'warn', 'log']
        : ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port') ?? 3010;
  const corsOrigins = configService.get<string>('corsOrigins') ?? '*';
  const jsonLimit = configService.get<string>('requestJsonLimit') ?? '1mb';
  const urlencodedLimit =
    configService.get<string>('requestUrlencodedLimit') ?? '1mb';
  const trustProxyHops = configService.get<number>('trustProxyHops') ?? 0;
  const upstreamDebug = configService.get<boolean>('upstreamDebugLog');
  const perfTiming = configService.get<boolean>('perfTimingLog');
  const processRole = configService.get<string>('processRole') ?? 'api';

  app.enableShutdownHooks();

  if (trustProxyHops > 0) {
    const httpAdapter = app.getHttpAdapter();
    const instance = httpAdapter.getInstance() as {
      set?: (key: string, value: number) => void;
    };
    instance.set?.('trust proxy', trustProxyHops);
    if (trustProxyHops > 3) {
      Logger.warn(
        `TRUST_PROXY_HOPS=${trustProxyHops} is high — confirm it equals your reverse-proxy hop count`,
        'Bootstrap',
      );
    }
  }

  app.use(
    helmet({
      contentSecurityPolicy: nodeEnv === 'production' ? undefined : false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.use(json({ limit: jsonLimit }));
  app.use(urlencoded({ extended: true, limit: urlencodedLimit }));

  app.enableCors({
    origin: parseCorsOrigins(corsOrigins, nodeEnv),
    credentials: true,
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'Accept-Language',
      'X-Request-Id',
    ],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: false,
    }),
  );

  await app.listen(port);
  Logger.log(
    `Ensmenu Staff BFF listening on port ${port} (role=${processRole})`,
    'Bootstrap',
  );
  if (upstreamDebug) {
    Logger.log(
      'Upstream debug logging enabled (UPSTREAM_DEBUG_LOG)',
      'Bootstrap',
    );
  }
  if (perfTiming) {
    Logger.log(
      'Performance timing logs enabled (PERF_TIMING_LOG)',
      'Bootstrap',
    );
  }
}

bootstrap();
