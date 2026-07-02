import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

function parseCorsOrigins(value: string): string[] | string | boolean {
  if (value === '*') {
    return true;
  }

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

async function bootstrap() {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const app = await NestFactory.create(AppModule, {
    bodyParser: true,
    logger:
      nodeEnv === 'production'
        ? ['error', 'warn', 'log']
        : ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port') ?? 3010;
  const corsOrigins = configService.get<string>('corsOrigins') ?? '*';

  app.enableCors({
    origin: parseCorsOrigins(corsOrigins),
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
      whitelist: false,
      forbidUnknownValues: false,
    }),
  );

  await app.listen(port);
  Logger.log(`Ensmenu Staff BFF listening on port ${port}`, 'Bootstrap');
}

bootstrap();
