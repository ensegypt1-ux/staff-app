import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { UpstreamExceptionFilter } from './common/filters/upstream-exception.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { StaffOnlyGuard } from './common/guards/staff-only.guard';
import { RouteTimingInterceptor } from './common/interceptors/route-timing.interceptor';
import { EnsBackendModule } from './infrastructure/ens-backend/ens-backend.module';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { FcmModule } from './modules/fcm/fcm.module';
import { HealthModule } from './modules/health/health.module';
import { StaffModule } from './modules/staff/staff.module';

const processRole = (process.env.PROCESS_ROLE ?? 'api').trim().toLowerCase();
const isApiRole = processRole === 'api' || processRole === 'all';
const isWorkerRole = processRole === 'worker' || processRole === 'all';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          name: 'default',
          ttl: config.get<number>('throttleTtlMs') ?? 60_000,
          limit: config.get<number>('throttleLimit') ?? 120,
        },
      ],
    }),
    EnsBackendModule,
    PrismaModule,
    HealthModule,
    ...(isApiRole ? [StaffModule] : []),
    FcmModule.forRoot({
      enableApi: isApiRole,
      enableWorker: isWorkerRole,
    }),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: StaffOnlyGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_FILTER,
      useClass: UpstreamExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RouteTimingInterceptor,
    },
  ],
})
export class AppModule {}
