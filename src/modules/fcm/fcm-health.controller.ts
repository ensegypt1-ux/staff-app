import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../common/decorators/public.decorator';
import { HealthThrottle } from '../../common/decorators/throttle.decorators';
import { FcmSenderService } from './fcm-sender.service';
import { MenuSocketSupervisor } from './menu-socket.supervisor';

@Controller('health')
export class FcmHealthController {
  constructor(
    private readonly config: ConfigService,
    private readonly supervisor: MenuSocketSupervisor,
    private readonly sender: FcmSenderService,
  ) {}

  @Public()
  @HealthThrottle()
  @Get('fcm')
  health() {
    if (!this.config.get<boolean>('isWorkerRole')) {
      return {
        enabled: false,
        role: this.config.get<string>('processRole'),
        message: 'FCM health is served by the Worker process',
      };
    }

    const enabled = this.config.get<boolean>('fcmEnabled') === true;
    const uncovered = this.supervisor.uncoveredMenus;
    const uncoveredSinceLimit =
      this.config.get<number>('fcmUncoveredReadyMs') ?? 180_000;

    // Do not expose menu ID lists publicly — counts only for readiness.
    const body = {
      enabled,
      role: this.config.get<string>('processRole'),
      firebaseReady: this.sender.isFirebaseReady,
      dryRun: this.config.get<boolean>('fcmDryRun') === true,
      desiredMenus: this.supervisor.desiredMenus,
      joinedMenus: this.supervisor.joinedMenus,
      uncoveredCount: uncovered.length,
      reconnectsTotal: this.supervisor.reconnectsTotal,
      pushSentTotal: this.sender.sentTotal,
      pushDedupedTotal: this.sender.dedupedTotal,
      pushInvalidTokenTotal: this.sender.invalidTokenTotal,
    };

    if (
      enabled &&
      uncovered.length > 0 &&
      // Soft readiness: only hard-fail if we have zero joined while desired > 0
      this.supervisor.desiredMenus > 0 &&
      this.supervisor.joinedMenus === 0
    ) {
      throw new ServiceUnavailableException({
        ...body,
        code: 'FCM_RELAYS_UNCOVERED',
        uncoveredReadyMs: uncoveredSinceLimit,
      });
    }

    return body;
  }
}
