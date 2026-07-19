import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { UpstreamExceptionFilter } from './common/filters/upstream-exception.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { StaffOnlyGuard } from './common/guards/staff-only.guard';
import { EnsBackendModule } from './infrastructure/ens-backend/ens-backend.module';
import { HealthModule } from './modules/health/health.module';
import { StaffModule } from './modules/staff/staff.module';

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
    HealthModule,
    StaffModule,
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
  ],
})
export class AppModule {}
