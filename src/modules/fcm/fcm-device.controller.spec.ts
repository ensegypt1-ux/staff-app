import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Request } from 'express';
import { FcmDeviceController } from './fcm-device.controller';
import { FcmDeviceService } from './fcm-device.service';
import { RegisterFcmDeviceDto } from './dto/fcm-device.dto';

describe('FcmDeviceController routes', () => {
  let controller: FcmDeviceController;
  let devices: { register: jest.Mock };

  beforeEach(async () => {
    devices = {
      register: jest.fn().mockResolvedValue({
        ok: true,
        deviceId: 'dev-1',
      }),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [FcmDeviceController],
      providers: [
        { provide: FcmDeviceService, useValue: devices },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => (key === 'isApiRole' ? true : undefined),
          },
        },
      ],
    }).compile();

    controller = moduleRef.get(FcmDeviceController);
  });

  const body: RegisterFcmDeviceDto = {
    token: 'fcm-token-1234567890',
    platform: 'android',
  };

  const req = { headers: { authorization: 'Bearer x' } } as Request;

  it('registers on canonical PUT /staff/v1/devices/fcm', async () => {
    await expect(controller.register(req, body)).resolves.toEqual({
      ok: true,
      deviceId: 'dev-1',
    });
    expect(devices.register).toHaveBeenCalledWith(req, body);
  });

  it('registers on POST /staff/v1/devices/fcm compatibility alias', async () => {
    await controller.registerPost(req, body);
    expect(devices.register).toHaveBeenCalledTimes(1);
  });

  it('registers on POST /staff/v1/devices/fcm/register compatibility alias', async () => {
    await controller.registerPostAlias(req, body);
    expect(devices.register).toHaveBeenCalledTimes(1);
  });

  it('registers on PUT /staff/v1/devices/fcm/register compatibility alias', async () => {
    await controller.registerPutAlias(req, body);
    expect(devices.register).toHaveBeenCalledTimes(1);
  });
});
