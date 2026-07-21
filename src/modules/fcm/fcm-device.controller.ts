import {
  Body,
  Controller,
  Delete,
  Put,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { AuthThrottle } from '../../common/decorators/throttle.decorators';
import {
  RefreshFcmDeviceDto,
  RegisterFcmDeviceDto,
  UnregisterFcmDeviceDto,
} from './dto/fcm-device.dto';
import { FcmDeviceService } from './fcm-device.service';

@Controller('staff/v1/devices/fcm')
export class FcmDeviceController {
  constructor(
    private readonly devices: FcmDeviceService,
    private readonly config: ConfigService,
  ) {}

  private assertApiRole(): void {
    if (!this.config.get<boolean>('isApiRole')) {
      throw new ServiceUnavailableException({
        error: 'Device APIs are only served by the API process',
        code: 'FCM_API_ROLE_REQUIRED',
      });
    }
  }

  @AuthThrottle()
  @Put()
  register(@Req() req: Request, @Body() body: RegisterFcmDeviceDto) {
    this.assertApiRole();
    return this.devices.register(req, body);
  }

  @AuthThrottle()
  @Put('refresh')
  refresh(@Req() req: Request, @Body() body: RefreshFcmDeviceDto) {
    this.assertApiRole();
    return this.devices.refresh(req, body);
  }

  @AuthThrottle()
  @Delete()
  unregister(@Req() req: Request, @Body() body: UnregisterFcmDeviceDto) {
    this.assertApiRole();
    return this.devices.unregister(req, body);
  }
}
