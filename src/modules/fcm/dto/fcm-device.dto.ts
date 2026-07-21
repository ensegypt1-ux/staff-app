import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterFcmDeviceDto {
  @IsString()
  @MinLength(10)
  token!: string;

  @IsString()
  @IsIn(['android', 'ios'])
  platform!: string;

  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsOptional()
  @IsString()
  appVersion?: string;

  @IsOptional()
  @IsString()
  locale?: string;
}

export class RefreshFcmDeviceDto {
  @IsString()
  @MinLength(10)
  oldToken!: string;

  @IsString()
  @MinLength(10)
  newToken!: string;

  @IsString()
  @IsIn(['android', 'ios'])
  platform!: string;

  @IsOptional()
  @IsString()
  deviceId?: string;
}

export class UnregisterFcmDeviceDto {
  @IsOptional()
  @IsString()
  token?: string;

  @IsOptional()
  @IsString()
  deviceId?: string;
}
