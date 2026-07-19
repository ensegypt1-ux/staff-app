import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { Public } from '../../common/decorators/public.decorator';
import { HealthThrottle } from '../../common/decorators/throttle.decorators';

@Controller()
export class HealthController {
  constructor(private readonly health: HealthCheckService) {}

  @Public()
  @HealthThrottle()
  @Get('health')
  @HealthCheck()
  check() {
    return this.health.check([]);
  }

  @Public()
  @HealthThrottle()
  @Get('health/live')
  live() {
    return { status: 'ok' };
  }
}
