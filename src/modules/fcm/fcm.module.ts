import { DynamicModule, Module } from '@nestjs/common';
import { StaffCoreModule } from '../staff/staff-core.module';
import { ExpressJwtRelayService } from './express-jwt-relay.service';
import { FcmDeviceController } from './fcm-device.controller';
import { FcmDeviceService } from './fcm-device.service';
import { FcmHealthController } from './fcm-health.controller';
import { FcmSenderService } from './fcm-sender.service';
import { MenuSocketLockService } from './menu-socket.lock';
import { MenuSocketSupervisor } from './menu-socket.supervisor';

export type FcmModuleOptions = {
  /** Register device REST controllers (API / all). */
  enableApi: boolean;
  /** Register Worker supervisor + FCM health (worker / all). */
  enableWorker: boolean;
};

@Module({})
export class FcmModule {
  static forRoot(options: FcmModuleOptions): DynamicModule {
    const controllers = [
      ...(options.enableApi ? [FcmDeviceController] : []),
      ...(options.enableWorker ? [FcmHealthController] : []),
    ];

    const providers = [
      FcmDeviceService,
      ExpressJwtRelayService,
      ...(options.enableWorker
        ? [
            MenuSocketLockService,
            FcmSenderService,
            MenuSocketSupervisor,
          ]
        : []),
    ];

    return {
      module: FcmModule,
      imports: [StaffCoreModule],
      controllers,
      providers,
      exports: [FcmDeviceService],
    };
  }
}
