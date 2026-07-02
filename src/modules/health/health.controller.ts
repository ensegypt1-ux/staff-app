import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { Public } from '../../common/decorators/public.decorator';

@Controller()
export class HealthController {
  constructor(private readonly health: HealthCheckService) {}

  @Public()
  @Get('health')
  @HealthCheck()
  check() {
    return this.health.check([]);
  }

  @Public()
  @Get('health/live')
  live() {
    return { status: 'ok' };
  }
}
