import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { UpstreamExceptionFilter } from './common/filters/upstream-exception.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
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
      provide: APP_FILTER,
      useClass: UpstreamExceptionFilter,
    },
  ],
})
export class AppModule {}
